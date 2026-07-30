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

/**
 * Characters that carry the meaning in code and mathematics.
 *
 * `split(/[^a-z0-9]+/)` plus a `length > 2` floor deletes exactly the tokens a
 * technical answer turns on. `%s` became `s` and was then dropped for being too
 * short; `2π` and `6π` both became `2` and `6` and were dropped as well. So
 * `cursor.execute(..., (roll, name))` with `%s` and the same line with
 * `.format()` tokenised identically — the injectable answer and the safe one
 * were indistinguishable to the grader. Same for the arc-length and sector-area
 * formulas this product's own demo describes a student confusing.
 */
const MEANINGFUL_SYMBOL = /[%=^√π°µ×÷<>≤≥≠+*/\\-]/;

function terms(value: string) {
  const lower = value.toLowerCase().normalize("NFKC");
  const words = lower.split(/[^a-z0-9]+/).filter((term) => term.length > 2 && !stopWords.has(term));
  // Whitespace-delimited chunks survive whole when they carry a symbol, with
  // wrapping punctuation trimmed: `(%s,%s)",` → `%s,%s`, `U=qV.` → `u=qv`.
  const symbols = lower.split(/\s+/)
    .map((chunk) => chunk.replace(/^[("'`[{,.]+/, "").replace(/[)"'`\]},.;:]+$/, ""))
    .filter((chunk) => chunk.length > 0 && MEANINGFUL_SYMBOL.test(chunk));
  return [...words, ...symbols];
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

/**
 * The upper bound used to be 0.82 — a confident deterministic "correct" was the
 * one case that skipped model verification. That is backwards. Term overlap
 * measures vocabulary, not claims, so its characteristic failure is the near
 * miss that reuses every word of the right answer and negates it. Those score
 * *high*, which is exactly why they were never checked.
 *
 * Anything we are about to call correct now gets verified.
 */
export function needsDualVerification(questionValue: QuestionBankQuestion, deterministicScore: number) {
  return questionValue.type === "long_answer"
    || questionValue.difficulty >= 0.7
    || deterministicScore >= 0.35;
}

/**
 * Whether a deterministic pass may be reported as "correct" on its own.
 *
 * Only for an answer that essentially *is* the expected one. Term overlap can
 * withhold a grade honestly — missing the source's vocabulary is real evidence
 * of missing content — but it cannot award one, because containing the right
 * words is not evidence of the right claim.
 */
export function deterministicCanConfirm(answer: string, expected: string) {
  const tidy = (value: string) => value.toLowerCase().normalize("NFKC").replace(/[\s"'`]+/g, "");
  return tidy(answer) === tidy(expected) || tidy(answer).includes(tidy(expected));
}
