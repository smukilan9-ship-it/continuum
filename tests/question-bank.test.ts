import { describe, expect, it } from "vitest";
import { deterministicCanConfirm, evaluateQuestionAnswer, extractQuestionBankQuestions, needsDualVerification } from "../apps/web/lib/question-bank";
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

/**
 * The near miss.
 *
 * Found live in production. The question asked the learner to rewrite an
 * injectable insert safely; the answer given was the injectable line itself
 * plus "which is safe because .format handles the quoting for you" — the exact
 * misconception the question exists to catch. It came back **Correct**, with
 * "Covered source terms: cursor, execute, insert, students, values, roll, name".
 *
 * Term overlap measured vocabulary and called it a claim. The wrong answer
 * reuses every word of the right one, so it scored at the top of the range —
 * which was also the band that skipped model verification, because the old gate
 * escalated *uncertain* scores and trusted confident ones.
 */
describe("an answer that keeps the words and negates the claim", () => {
  const question = {
    id: "question_001",
    type: "short_answer" as const,
    prompt: "Rewrite this so it cannot be injected: cursor.execute(\"INSERT INTO students VALUES ({},{})\".format(roll, name))",
    expectedAnswer: "cursor.execute(\"INSERT INTO students VALUES (%s,%s)\", (roll, name))",
    explanation: "The values travel as parameters, separate from the SQL text.",
    difficulty: 0.45,
    sourceChunkIds: ["chunk_demo_sql_2"],
  };
  const wrong = "You use cursor.execute(\"INSERT INTO students VALUES ({},{})\".format(roll, name)) which is safe because .format handles the quoting for you.";

  it("is escalated for model verification rather than trusted", () => {
    const graded = evaluateQuestionAnswer(question, wrong);
    expect(needsDualVerification(question, graded.score)).toBe(true);
  });

  it("cannot be confirmed by the deterministic pass alone", () => {
    expect(deterministicCanConfirm(wrong, question.expectedAnswer)).toBe(false);
  });

  it("still confirms an answer that is the expected one", () => {
    expect(deterministicCanConfirm(question.expectedAnswer, question.expectedAnswer)).toBe(true);
    expect(deterministicCanConfirm(`So: ${question.expectedAnswer}`, question.expectedAnswer)).toBe(true);
  });

  it("scores below the safe answer, because %s is a token again", () => {
    // The tokeniser split on every non-alphanumeric and dropped anything under
    // three characters, so `%s` became `s` and vanished. The injectable answer
    // and the parameterised one tokenised identically.
    const right = evaluateQuestionAnswer(question, question.expectedAnswer);
    expect(evaluateQuestionAnswer(question, wrong).score).toBeLessThan(right.score);
  });

  it("keeps formula symbols apart, which is the same bug in mathematics", () => {
    // The product's own demo describes a student who swaps arc length and
    // sector area. Under the old tokeniser both answers reduced to nothing.
    const arc = { ...question, id: "q", prompt: "Arc length of a 60° arc, r=6", expectedAnswer: "2π", explanation: "", difficulty: 0.5 };
    expect(evaluateQuestionAnswer(arc, "6π").score).toBeLessThan(evaluateQuestionAnswer(arc, "2π").score);
  });
});
