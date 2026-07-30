/**
 * Application-owned prompt contracts. Untrusted user/source content is never
 * stored here; prompt-context.ts serializes that content into labelled sections.
 */
export const promptContracts = {
  learning: {
    misconception_diagnosis: "Return the diagnostic schema with a calibrated score, explicit misconception evidence, prerequisites, intervention, and rationale.",
    lesson_generation: "Return the lesson schema with a concise explanation and one to six checks for understanding.",
  },
  code: {
    explain: "Explain the relevant concept in plain language, stay consistent with actual runtime evidence, and include one short check for understanding.",
    debug: "Identify the cause from actual runtime evidence, show the smallest correction, and explain a verification step.",
    practice: "Give one bounded exercise, a success criterion, and progressive hints before a complete solution.",
    review: "Review correctness and clarity against the program's intended behaviour. Suggest focused changes and do not invent runtime output.",
  },
  specialist: "Return an answer, exact supplied evidence identifiers, material limitations, and calibrated confidence using the required schema.",
  citationVerifier: "Independently decide whether the proposed result is supported. Reject invented or overstated support and return the verifier schema.",
} as const;

export type CodePromptMode = keyof typeof promptContracts.code;

export function codePromptContract(mode: CodePromptMode) {
  return promptContracts.code[mode];
}
