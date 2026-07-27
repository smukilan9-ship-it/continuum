import { describe, expect, it } from "vitest";
import { evaluateQuestionAnswer, extractQuestionBankQuestions, needsDualVerification } from "../apps/web/lib/question-bank";
import type { StoredSourceChunk } from "../packages/db/src";

function chunk(text: string, passage = 1): StoredSourceChunk {
  return {
    id: `chunk_question_${passage}`,
    sourceId: "source_question_bank",
    sourceTitle: "Question bank",
    passage,
    text,
    contentHash: `hash_${passage}`,
    sourceVersion: 1,
    deleted: false,
    reference: `Question bank · passage ${passage}`,
  };
}

describe("document question banks", () => {
  it("detects explicit Q/A pairs and preserves source passage identifiers", () => {
    const questions = extractQuestionBankQuestions([
      chunk("Q1. What is electric potential?\nA. Electric potential is potential energy per unit charge."),
      chunk("Q2. What is the SI unit?\nA. The volt."),
    ]);
    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({
      prompt: "What is electric potential?",
      expectedAnswer: "Electric potential is potential energy per unit charge.",
      sourceChunkIds: ["chunk_question_1"],
    });
  });

  it("imports a CSV question-and-answer structure", () => {
    const questions = extractQuestionBankQuestions([
      chunk('question,answer,option_a,option_b\n"Which unit?","volt","volt","joule"'),
    ]);
    expect(questions[0]).toMatchObject({
      prompt: "Which unit?",
      expectedAnswer: "volt",
      type: "multiple_choice",
      choices: ["volt", "joule"],
    });
  });

  it("generates bounded recall questions when the source has no explicit prompts", () => {
    const questions = extractQuestionBankQuestions([
      chunk("Patient-grouped validation keeps every image from one patient in the same partition, preventing morphology leakage across training and validation."),
    ]);
    expect(questions).toHaveLength(1);
    expect(questions[0]?.prompt).toMatch(/Explain what the source states/i);
  });

  it("grades against source terms and escalates ambiguous long answers", () => {
    const question = {
      id: "question_001",
      prompt: "Why is patient-grouped validation used?",
      expectedAnswer: "It prevents morphology leakage by keeping one patient's images in one partition.",
      explanation: "The source requires patient grouping.",
      type: "long_answer" as const,
      difficulty: .75,
      sourceChunkIds: ["chunk_question_1"],
    };
    const complete = evaluateQuestionAnswer(question, "It keeps each patient's images in one partition so morphology cannot leak between training and validation.");
    const incomplete = evaluateQuestionAnswer(question, "It improves validation.");
    expect(complete.score).toBeGreaterThan(incomplete.score);
    expect(complete.correct).toBe(true);
    expect(needsDualVerification(question, complete.score)).toBe(true);
  });
});
