function normal(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9.+-]/g, "");
  if (["n", "false", "unchanged"].includes(normalized)) return "no";
  if (["y", "true"].includes(normalized)) return "yes";
  return normalized;
}

function semanticShortAnswer(answer: string, expected: string) {
  const words = answer.trim().toLowerCase().replaceAll(/[’']/g, "'").replace(/[^a-z0-9.+\-\s']/g, " ").replace(/\s+/g, " ");
  const target = normal(expected);
  if (target === "no") {
    const negative = /^(no\b)|\b(does not|doesn't|do not|don't|is not|isn't|will not|won't|unchanged|stays? (?:the )?same)\b/.test(words);
    const contradictory = /^(yes\b)|\b(does|will) (indeed |also )?double\b/.test(words);
    return negative && !contradictory;
  }
  if (target === "yes") {
    const affirmative = /^(yes\b)|\b(does|will) (indeed |also )?double\b/.test(words);
    const contradictory = /^(no\b)|\b(does not|doesn't|will not|won't)\b/.test(words);
    return affirmative && !contradictory;
  }
  if (target === "negative") return /\b(negative|decreases?|drops?|lower)\b/.test(words) && !/\b(not negative|positive)\b/.test(words);
  if (target === "positive") return /\b(positive|increases?|rises?|higher)\b/.test(words) && !/\b(not positive|negative)\b/.test(words);
  if (target === "zero") return /\b(zero|no work|none)\b/.test(words);
  return normal(answer) === target;
}

export function checkpointScore(answer: string | undefined, expected: string | undefined) {
  if (!answer || !expected) return 0;
  const expectedNumber = Number(expected);
  if (Number.isFinite(expectedNumber)) {
    const matches = answer.match(/[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi)?.map(Number).filter(Number.isFinite) ?? [];
    return matches.length === 1 && Math.abs(matches[0]! - expectedNumber) <= Math.max(0.01, Math.abs(expectedNumber) * 0.005) ? 1 : 0;
  }
  return semanticShortAnswer(answer, expected) ? 1 : 0;
}
