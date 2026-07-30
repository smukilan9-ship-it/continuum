import type { QuestionBankQuestion, StoredSourceChunk } from "@continuum/db";

const questionPrefix = /^(?:q(?:uestion)?\s*\d*|[\divx]+)[.):\-\s]+/i;
const answerPrefix = /^(?:a(?:nswer)?|key|solution)\s*\d*[.):\-\s]+/i;
const stopWords = new Set(["about", "after", "again", "also", "and", "are", "because", "been", "being", "between", "but", "can", "could", "does", "for", "from", "had", "has", "have", "how", "into", "its", "may", "more", "most", "not", "that", "the", "their", "then", "there", "these", "they", "this", "those", "through", "was", "were", "what", "when", "where", "which", "while", "who", "why", "will", "with", "would", "you", "your"]);

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === "\"") {
      if (quoted && line[index + 1] === "\"") { current += "\""; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(clean(current));
      current = "";
    } else current += character;
  }
  values.push(clean(current));
  return values;
}

function questionId(index: number) {
  return `question_${String(index + 1).padStart(3, "0")}`;
}

function question(input: Partial<QuestionBankQuestion> & Pick<QuestionBankQuestion, "prompt" | "expectedAnswer">, index: number): QuestionBankQuestion {
  return {
    id: input.id ?? questionId(index),
    prompt: clean(input.prompt).slice(0, 2_000),
    expectedAnswer: clean(input.expectedAnswer).slice(0, 4_000),
    explanation: clean(input.explanation ?? `The marking source states: ${input.expectedAnswer}`).slice(0, 4_000),
    type: input.type ?? (clean(input.expectedAnswer).length > 180 ? "long_answer" : "short_answer"),
    ...(input.choices?.length ? { choices: input.choices.map(clean).filter(Boolean).slice(0, 8) } : {}),
    difficulty: Math.max(0, Math.min(1, input.difficulty ?? 0.5)),
    sourceChunkIds: input.sourceChunkIds ?? [],
  };
}

function csvQuestions(text: string, chunks: StoredSourceChunk[]) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2 || !lines[0]!.includes(",")) return [];
  const headers = parseCsvLine(lines[0]!).map((header) => header.toLowerCase().replace(/[^a-z0-9]+/g, "_"));
  const promptIndex = headers.findIndex((header) => ["question", "prompt", "front"].includes(header));
  const answerIndex = headers.findIndex((header) => ["answer", "expected_answer", "correct_answer", "back", "solution"].includes(header));
  if (promptIndex < 0 || answerIndex < 0) return [];
  const choiceIndexes = headers.map((header, index) => /^choice|^option/.test(header) ? index : -1).filter((index) => index >= 0);
  return lines.slice(1, 51).flatMap((line, index) => {
    const values = parseCsvLine(line);
    if (!values[promptIndex] || !values[answerIndex]) return [];
    const choices = choiceIndexes.map((choiceIndex) => values[choiceIndex] ?? "").filter(Boolean);
    return [question({
      prompt: values[promptIndex]!,
      expectedAnswer: values[answerIndex]!,
      choices,
      type: choices.length ? "multiple_choice" : undefined,
      sourceChunkIds: chunks.filter((chunk) => line.includes(chunk.text.slice(0, 40))).map((chunk) => chunk.id).slice(0, 2),
    }, index)];
  });
}

export function extractQuestionBankQuestions(chunks: StoredSourceChunk[], maxQuestions = 30) {
  const ordered = [...chunks].sort((left, right) => left.passage - right.passage);
  const text = ordered.map((chunk) => chunk.text).join("\n\n");
  const fromCsv = csvQuestions(text, ordered);
  if (fromCsv.length) return fromCsv.slice(0, maxQuestions);

  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const detected: QuestionBankQuestion[] = [];
  for (let index = 0; index < lines.length && detected.length < maxQuestions; index += 1) {
    const raw = lines[index]!;
    const isQuestion = raw.endsWith("?") || questionPrefix.test(raw);
    if (!isQuestion) continue;
    const prompt = clean(raw.replace(questionPrefix, ""));
    let expectedAnswer = "";
    let answerLine = index + 1;
    while (answerLine < lines.length && answerLine <= index + 3) {
      const candidate = lines[answerLine]!;
      if (answerPrefix.test(candidate)) {
        expectedAnswer = clean(candidate.replace(answerPrefix, ""));
        break;
      }
      if (!candidate.endsWith("?") && !questionPrefix.test(candidate)) {
        expectedAnswer = candidate;
        break;
      }
      answerLine += 1;
    }
    if (!prompt || !expectedAnswer) continue;
    const sourceChunkIds = ordered.filter((chunk) => chunk.text.includes(raw) || chunk.text.includes(expectedAnswer)).map((chunk) => chunk.id).slice(0, 3);
    detected.push(question({ prompt, expectedAnswer, sourceChunkIds }, detected.length));
  }
  if (detected.length) return detected;

  const statements = text
    .split(/(?<=[.!])\s+/)
    .map(clean)
    .filter((sentence) => sentence.length >= 45 && sentence.length <= 600 && !sentence.includes("[embedded instruction removed"))
    .slice(0, maxQuestions);
  return statements.map((statement, index) => {
    const subject = statement.split(/\s+/).slice(0, 7).join(" ").replace(/[,:;]$/, "");
    const sourceChunkIds = ordered.filter((chunk) => chunk.text.includes(statement)).map((chunk) => chunk.id).slice(0, 2);
    return question({
      prompt: `Explain what the source states about “${subject}”.`,
      expectedAnswer: statement,
      explanation: `A complete answer should preserve the source’s main claim: ${statement}`,
      type: statement.length > 180 ? "long_answer" : "short_answer",
      difficulty: statement.length > 240 ? 0.65 : 0.45,
      sourceChunkIds,
    }, index);
  });
}

function terms(value: string) {
  return value.toLowerCase().normalize("NFKC").split(/[^a-z0-9]+/).filter((term) => term.length > 2 && !stopWords.has(term));
}

export function evaluateQuestionAnswer(questionValue: QuestionBankQuestion, answer: string) {
  const normalizedAnswer = clean(answer).toLowerCase();
  const normalizedExpected = clean(questionValue.expectedAnswer).toLowerCase();
  if (!normalizedAnswer) return {
    score: 0,
    correct: false,
    completeness: 0,
    confidence: 1,
    verdict: "incorrect" as const,
    correctPoints: [],
    missingPoints: [questionValue.expectedAnswer],
    incorrectPoints: [],
    improvedAnswer: questionValue.expectedAnswer,
    explanation: "No answer was submitted.",
  };
  if (questionValue.type === "multiple_choice") {
    const correct = normalizedAnswer === normalizedExpected || normalizedAnswer.replace(/^[a-z][.):\s]+/, "") === normalizedExpected;
    return {
      score: correct ? 1 : 0,
      correct,
      completeness: correct ? 1 : 0,
      confidence: 0.98,
      verdict: correct ? "correct" as const : "incorrect" as const,
      correctPoints: correct ? [questionValue.expectedAnswer] : [],
      missingPoints: correct ? [] : [questionValue.expectedAnswer],
      incorrectPoints: correct ? [] : [answer],
      improvedAnswer: questionValue.expectedAnswer,
      explanation: correct ? questionValue.explanation : `The source-backed answer is ${questionValue.expectedAnswer}. ${questionValue.explanation}`,
    };
  }
  const expectedTerms = terms(normalizedExpected);
  const answerTerms = new Set(terms(normalizedAnswer));
  const covered = expectedTerms.filter((term) => answerTerms.has(term));
  const completeness = expectedTerms.length ? covered.length / new Set(expectedTerms).size : normalizedAnswer === normalizedExpected ? 1 : 0;
  const lengthFactor = Math.min(1, normalizedAnswer.length / Math.max(24, normalizedExpected.length * 0.55));
  const score = Math.max(0, Math.min(1, completeness * 0.82 + lengthFactor * 0.18));
  const correct = score >= 0.72;
  const verdict = correct ? "correct" as const : score >= 0.38 ? "incomplete" as const : "incorrect" as const;
  const missingTerms = [...new Set(expectedTerms.filter((term) => !answerTerms.has(term)))];
  return {
    score,
    correct,
    completeness,
    confidence: completeness > 0.8 || completeness < 0.25 ? 0.88 : 0.62,
    verdict,
    correctPoints: covered.length ? [`Covered source terms: ${[...new Set(covered)].slice(0, 8).join(", ")}`] : [],
    missingPoints: missingTerms.length ? [`Missing source ideas: ${missingTerms.slice(0, 8).join(", ")}`] : [],
    incorrectPoints: [],
    improvedAnswer: questionValue.expectedAnswer,
    explanation: correct
      ? `Your answer covers the source’s main points. ${questionValue.explanation}`
      : `Your answer is ${verdict}. Compare it with the source-backed improved answer below.`,
  };
}

export function needsDualVerification(questionValue: QuestionBankQuestion, deterministicScore: number) {
  return questionValue.type === "long_answer"
    || questionValue.difficulty >= 0.7
    || (deterministicScore >= 0.35 && deterministicScore <= 0.82);
}
