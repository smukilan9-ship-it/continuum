# Continuum security threat model

Date: 2026-07-23  
Scope: the Next.js application, Postgres persistence, provider adapters, browser
code runners, OAuth/MCP, local integrations, imported content, Vercel Preview,
and the demo-account path.

## Assets

- Account identities, password verifiers, session cookies, OAuth grants, and MCP
  tokens.
- Per-user provider keys, Google/Zotero tokens, the server envelope-encryption
  keys, and local Obsidian pairing tokens.
- Academic goals, schedules, learning state, misconceptions, research notes,
  papers, claims/evidence, uploads, code submissions/output, memory, context
  packs, and audit events.
- Browser storage containing only non-secret UI preferences and local-provider
  selection.

## Trust boundaries

1. **Browser → Next.js:** an untrusted client crosses into authenticated routes.
2. **Next.js → Postgres:** application authorization must preserve tenant scope;
   database credentials remain server-side.
3. **Next.js → providers:** bounded queries/prompts leave Continuum for OpenAlex,
   Crossref, YouTube, Featherless, Google identity services, or Zotero.
4. **Imported content → retrieval/AI:** PDFs, Markdown, abstracts, citations,
   transcripts, and Obsidian notes remain untrusted data, never policy.
5. **App → browser workers:** submitted code crosses into disposable Web
   Workers/WASM runtimes, not a server shell.
6. **Continuum → MCP clients:** OAuth scopes and tool-specific authorization
   constrain remote assistants.
7. **Continuum cloud → local tools:** Ollama is loopback-only; Obsidian is an
   explicitly paired, folder-scoped plugin; NotebookLM consumer use is a user
   controlled handoff.
8. **Vercel Preview → Neon Preview database:** branch-scoped configuration must
   not resolve to Production data or Production cryptographic keys.

## Threats and primary controls

| Threat | Control |
|---|---|
| Credential theft or log leakage | AES-256-GCM envelopes, server-only versioned keys, masked responses, fixed provider origins, no analytics/prompt inclusion |
| Account takeover | scrypt, constant-time verification, dummy-hash path, lockout/rate limits, revocable opaque sessions |
| CSRF | host-only SameSite cookies plus exact request/canonical-origin checks on authenticated writes |
| IDOR / cross-user data | user-bound repository queries, ownership checks through parent objects, user-bound provider records and cache keys |
| XSS / malicious Markdown | React escaping, `react-markdown`, CSP, `nosniff`, no raw HTML rendering of runner/provider errors |
| SSRF / unsafe redirects | fixed provider endpoints, loopback validation for Ollama, safe relative return paths, no server fetch of user-selected localhost |
| Prompt injection | system policy separates untrusted source text; retrieved passages are explicitly labelled data with provenance |
| Malicious uploads | type/size/time bounds, parser boundaries, content hashing/deduplication, private source ownership |
| Sandbox escape / resource abuse | disposable worker, hard timeout/termination, bounded source/stdin/tests/output, network/process API removal, same-origin WASM |
| MCP tool abuse | OAuth authorization code + PKCE, issuer/audience/resource checks, scopes, revocation, per-client limits, confirmation-only consequential writes |
| Obsidian path traversal | selected-folder scope, deterministic generated paths, token pairing, unchanged-file checks, ordinary-note overwrite protection |
| Dependency compromise | lockfile, minimum-release policy, production audit, patched dependency overrides, build/test gates |
| Preview data exposure | branch-scoped sibling database and branch-specific cryptographic keys; Production variables and deployment are not modified |

## Residual risk

The browser code runner is a learner sandbox, not a formally hardened
multi-tenant VM. Browser/WASM vulnerabilities and CPU pressure until worker
termination remain upstream risks. CSP still permits inline framework scripts.
Consumer NotebookLM has no cloud account connector, and the Obsidian plugin
requires a real user-owned desktop vault for final host-level verification.
These are documented limitations, not represented as completed security
guarantees.
