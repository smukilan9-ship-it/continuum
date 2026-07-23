# Security remediation record

Date: 2026-07-23

| ID | Severity | Finding | Remediation | Verification |
|---|---|---|---|---|
| AUTH-1 | High availability | Vercel SSO intercepted navigation, login, API, and OPTIONS before the app | Dedicated Preview alias/protection override; application authentication retained | clean-browser redirect/header probes and deployed Playwright |
| AUTH-2 | Medium | Production same-origin logic trusted only one canonical host, rejecting unique Vercel Preview origins | Accept exact request origin or configured canonical origin; retain host-only cookie boundary | `tests/request-security.test.ts` |
| TENANT-1 | Medium | Research discovery cache omitted user identity, allowing result/provider-state reuse across users with an identical query | Prefix cache key with authenticated user ID | code review and full test suite |
| DEP-1 | High | Next 15.5.20 exposed three High advisories | Upgrade Next and ESLint config to 15.5.21 | `pnpm audit --prod` |
| DEP-2 | High | Sharp below 0.35.0 inherited libvips advisories | Override Sharp to 0.35.0 | `pnpm why sharp`; production audit |
| DEP-3 | High | `fast-uri` 3.1.3 host-confusion advisory | Override to 3.1.4 | `pnpm why fast-uri`; production audit |
| DEP-4 | Moderate | Hono adapter path-traversal/aborted-handshake advisories | Override `@hono/node-server` to 2.0.10 | `pnpm why @hono/node-server`; production audit |
| KEY-1 | High design requirement | Provider credentials previously lacked a common user-facing encrypted configuration flow | HTTPS/auth/rate-limited endpoint, live provider check, AES-256-GCM versioned envelope, masked-only status, password reauthentication for replace/delete, revoke/audit flow | provider credential tests plus browser invalid-key rejection |
| DATA-1 | High operational | Preview and Production resolved to the same database and cryptographic variables | Create `continuum_preview_product_ready`; add branch-scoped DB URLs and independent encryption/session/MCP keys | hash-only environment comparison and direct database inspection |
| UI-1 | Low | Dark system theme exposed light hard-coded auth/mobile surfaces | Semantic tokens and explicit dark surface overrides | light/dark browser screenshots |

## Accepted limitations

- Password reauthentication covers password accounts. A future Google-only
  account needs an explicit recent-OAuth reauthentication ceremony before it
  can replace/delete a provider secret.
- Nonce-based CSP would improve XSS defense in depth but requires a separate
  Next.js middleware rollout.
- Provider success, quota, and expiry behavior cannot be claimed without a real
  user-supplied key. Invalid-key and provider classification paths are tested.
- Obsidian host installation, local edit/conflict behavior, and MCP retrieval of
  a newly synced real-vault note remain external desktop verification work.
