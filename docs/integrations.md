# Integration setup

Continuum shows end-user connection instructions under **Connections**. Provider-key sections in this document are for the deployment operator and are intentionally not shown in the consumer app. Third-party links below point only to official documentation or account consoles.

## Secret locations

For local development, copy `.env.example` to the repository-root `.env.local` and place provider secrets there. In this checkout the file is:

```text
/Users/mukilan/Desktop/promotheus/.env.local
```

`.env.local` is ignored by Git. Provider credentials must never use a `NEXT_PUBLIC_` name because those values can be included in browser bundles.

For production, open **Vercel Dashboard → continuum → Settings → Environment Variables**. Add credentials to **Production**, mark secret values **Sensitive**, and redeploy. Do not paste a secret into source, a committed `.env` file, a browser setting, a screenshot, an issue, or a chat message.

## Claude remote MCP

1. Deploy Continuum to a public HTTPS origin and confirm `/mcp` returns an OAuth challenge.
2. In Claude, open **Customize → Connectors → Add custom connector**.
3. Paste `https://<continuum-domain>/mcp`.
4. Complete Continuum OAuth, review the requested read/write scopes, and enable the connector for the conversation.
5. Return to Continuum Connections to inspect its permissions, last use, or revoke the client.

Official guide: [Claude remote MCP custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

## Google sign-in and Calendar

Operator setup is required once. The same Google OAuth web client can support verified account sign-in and the separately consented Calendar connection.

1. In [Google Cloud credentials](https://console.cloud.google.com/apis/credentials), create an OAuth 2.0 **Web application** client for the Continuum deployment.
2. Configure the OAuth consent screen and request only the Calendar list read, event read, and user-owned event write scopes listed in `.env.example`/the application code. Public apps must complete Google's verification requirements before general release.
3. Add both exact authorized redirect URIs:
   - `https://<continuum-domain>/api/auth/google/callback`
   - `https://<continuum-domain>/api/connections/google/callback`
4. Store the client values only as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` server-side. Also configure a 32-byte `INTEGRATION_CREDENTIAL_ENCRYPTION_KEY`.
5. On the login screen, **Continue with Google** requests only OpenID profile/email scopes and accepts only a verified Google email. Calendar access is not granted by sign-in.
6. In Continuum, the user separately selects **Connect Google Calendar**, reviews the Calendar consent screen, and returns to Connections.
7. Sync is explicit. It imports primary-calendar busy events as planning constraints and creates only committed Continuum study blocks. Created events carry a private Continuum block ID to prevent duplicates.

Official references: [Google OAuth for web server apps](https://developers.google.com/identity/protocols/oauth2/web-server), [Google Calendar authorization](https://developers.google.com/workspace/calendar/api/auth), and [manage third-party account access](https://support.google.com/accounts/answer/3466521).

## Zotero

Zotero's Web API supports private-library access through user-created keys. Continuum deliberately asks for a dedicated read-only key instead of requesting write permission.

1. The user opens Zotero's [official key creation page](https://www.zotero.org/settings/keys/new).
2. Create a key named Continuum with personal-library read access and leave write access disabled.
3. Paste it into Continuum Connections. The server validates it with Zotero's `/keys/current` endpoint, encrypts it with AES-256-GCM, and never returns it to the browser.
4. **Sync library** imports citation metadata and sanitized abstracts into source-grounded retrieval in resumable 100-item pages. It remembers the library version for incremental updates and does not silently import attachment files or PDFs.

Official reference: [Zotero Web API v3](https://www.zotero.org/support/dev/web_api/v3/start).

## NotebookLM

Personal NotebookLM does not expose a general account-connection API. Continuum therefore provides a transparent source-pack handoff rather than a fake OAuth connection:

1. Select **Download source pack** in Connections.
2. Review the Markdown file containing project context, decision summaries, indexed-source titles, and recent verified outcomes.
3. Open [NotebookLM](https://notebooklm.google.com/) and add the file to a notebook.
4. Return to Continuum to record evidence and verify progress.

Official reference: [NotebookLM help](https://support.google.com/notebooklm/answer/14278184).

## Featherless

1. Create a key in the [official Featherless API Keys page](https://featherless.ai/account/api-keys); see the [official quickstart](https://featherless.ai/docs/quickstart-guide).
2. Local: set `FEATHERLESS_API_KEY` and optionally `_1`, `_2`, `_3` in `.env.local`.
3. Production: add each used key as a Sensitive Vercel variable and redeploy. Status
   surfaces expose only stable non-secret identifiers and health/backoff state.
4. Run the operator health and provider smoke tests; provider status is not exposed in the consumer Connections screen.

The router normally evaluates the account plan and live catalog by task. If catalog discovery is unavailable it uses the reviewed Qwen3.5 9B fast, Qwen3.6 27B reasoning, Qwen3 Coder Next, and GPT-OSS 20B verifier routes. Featherless embeddings use `Qwen/Qwen3-Embedding-8B` with 1,536 output dimensions. The model-specific `FEATHERLESS_FAST_MODEL`, `FEATHERLESS_REASONING_MODEL`, `FEATHERLESS_CODE_MODEL`, and `FEATHERLESS_VERIFIER_MODEL` variables are optional reviewed overrides.

## Gemini generation and embeddings

1. Follow Google's [official API key guide](https://ai.google.dev/gemini-api/docs/api-key) and create/restrict only keys and projects you are authorized to use.
2. Put the ten keys in these exact server-only slots in `.env.local` and Vercel Production:

```dotenv
GEMINI_API_KEY_1=
GEMINI_API_KEY_2=
GEMINI_API_KEY_3=
GEMINI_API_KEY_4=
GEMINI_API_KEY_5=
GEMINI_API_KEY_6=
GEMINI_API_KEY_7=
GEMINI_API_KEY_8=
GEMINI_API_KEY_9=
GEMINI_API_KEY_10=
GEMINI_DATA_USE_ACKNOWLEDGED=true
```

3. Keep `GEMINI_MODEL=gemini-3.5-flash`, `GEMINI_EMBEDDING_MODEL=gemini-embedding-001`, and `EMBEDDING_DIMENSIONS=1536` unless a tested migration changes all corresponding storage dimensions.
4. Redeploy and run the operator embedding smoke test. Key counts are not exposed to consumers.

The generation cursor rotates keys and retries a bounded number of times. The embedding pool also has bounded concurrency. Multiple keys in one Google Cloud project do not multiply project quota, and this mechanism must not be used to evade provider limits. Current production model IDs are listed in Google's [official Gemini models guide](https://ai.google.dev/gemini-api/docs/models).

## Ollama

1. Install Ollama from the [official download page](https://ollama.com/download).
2. Install at least one local model and start Ollama. Its [official API guide](https://docs.ollama.com/api/introduction) documents the default loopback API at `http://localhost:11434/api`.
3. If the browser blocks the origin, configure `OLLAMA_ORIGINS` to allow only the Continuum origin, then restart Ollama.
4. In Continuum Integrations keep `http://127.0.0.1:11434`, select **Test local Ollama**, and confirm a local model is listed.

Browser-local Ollama configuration stays in that browser. The server rejects non-loopback Ollama by default.

## Obsidian

1. Build the plugin with `pnpm --filter @continuum/obsidian-plugin build`.
2. Copy `apps/obsidian-plugin/manifest.json`, `main.js`, and `versions.json` into `<vault>/.obsidian/plugins/continuum-sync/`.
3. Review the plugin. Obsidian warns that community plugins inherit the application's file and network access; read the [official plugin security guide](https://obsidian.md/help/Extending%2BObsidian/Plugin%2Bsecurity).
4. In Obsidian open **Settings → Community plugins**, turn on community plugins, and enable Continuum Sync. See the [official Obsidian installation guide](https://obsidian.md/help/community-plugins).
5. In Continuum Integrations create a vault token. It is displayed once.
6. In Continuum Sync settings save the token with SecretStorage, enter the public HTTPS Continuum origin, choose one folder, and run a manual sync before considering whole-vault opt-in.

## Vercel AI Gateway

Vercel-hosted deployments should prefer the automatically provisioned `VERCEL_OIDC_TOKEN`; this avoids storing a long-lived production Gateway key. The OIDC token alone does not enable routing. Set `AI_GATEWAY_ENABLED=true` only after explicitly accepting metered provider costs. Local work can set `AI_GATEWAY_API_KEY` in `.env.local`. Follow Vercel's [official authentication and BYOK guide](https://vercel.com/docs/ai-gateway/authentication-and-byok) and [official model/provider guide](https://vercel.com/docs/ai-gateway/models-and-providers).

The current configured defaults are:

```dotenv
AI_GATEWAY_GENERAL_MODEL=google/gemini-3.5-flash
AI_GATEWAY_MULTIMODAL_MODEL=google/gemini-3.5-flash
AI_GATEWAY_FALLBACK_MODELS=openai/gpt-5.4,anthropic/claude-sonnet-4.6
```

AI Gateway is a metered hosted fallback. A configured key or OIDC token does not mean every model is free.

## Groq and xAI Grok

Groq and Grok are different products.

- The Groq adapter requires `GROQ_API_KEY` and validates reviewed task defaults against the project’s authenticated live catalog. Optional `GROQ_*_MODEL` overrides must also exist in that catalog. Follow the [official Groq quickstart](https://console.groq.com/docs/quickstart).
- xAI Grok is not configured in Continuum's routing policy and no xAI key is stored. It is intentionally not enabled merely because AI Gateway could route to it. Available model IDs and pricing belong to xAI's [official model API](https://docs.x.ai/developers/rest-api-reference/inference/models).

## ChatGPT MCP

ChatGPT MCP remains future scope for this release. Continuum does not display a fake connected state. Availability and account requirements can change; consult OpenAI's [official developer mode and MCP apps guide](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt-beta).

## Abuse controls

Production uses PostgreSQL-backed atomic counters so limits work across Vercel instances. Defaults are `30` AI requests per user/IP per minute, `120` MCP requests per user/client/IP per minute, a `50,000` token daily per-user cap, throttled authentication, throttled integration-token creation, throttled source ingestion/retrieval, bounded upload sizes, bounded model timeouts, and provider-side quotas. A `429` response includes retry guidance. These controls reduce abuse; provider budgets and usage alerts remain required operator safeguards.
