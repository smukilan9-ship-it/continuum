# AI prompt context

Status: **unit-tested and active** in general AI, Code coaching, MCP specialist/
verifier, and local Ollama paths.

`buildAcademicPrompt` produces two bounded strings with explicit sections:

1. system policy and surface-specific pedagogical rules;
2. relevant academic context;
3. untrusted source content;
4. untrusted runtime data;
5. the user's request;
6. output contract.

Objects are serialized under size limits; source documents, code, retrieved text,
and runtime output are labelled data and cannot redefine policy. Code feedback must
reason from actual output and never invent it. Learning distinguishes exposure from
verified transfer. Research requires evidence-bound claims and carries the OASIS
guardrail: serial-section spatial association is not same-cell co-expression.

Routes choose only the context needed for the task. Provider keys, OAuth tokens,
cookies, raw transcripts, and unrelated project histories are never inserted. The
envelope is provider-neutral so failover does not silently change educational policy.
