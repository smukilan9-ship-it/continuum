# Integration setup

Continuum shows these same instructions under **Integrations**. Third-party links below point only to the provider's official documentation or account console.

## Secret locations

For local development, copy `.env.example` to the repository-root `.env.local` and place provider secrets there. In this checkout the file is:

```text
/Users/mukilan/Desktop/promotheus/.env.local
```

`.env.local` is ignored by Git. Provider credentials must never use a `NEXT_PUBLIC_` name because those values can be included in browser bundles.

For production, open **Vercel Dashboard → continuum → Settings → Environment Variables**. Add credentials to **Production**, mark secret values **Sensitive**, and redeploy. Do not paste a secret into source, a committed `.env` file, a browser setting, a screenshot, an issue, or a chat message.

## Claude remote MCP

1. Deploy Continuum to a public HTTPS origin and confirm `/api/mcp` reports ready under Integrations.
2. In Claude, open **Customize → Connectors → Add custom connector**.
3. Paste `https://<continuum-domain>/api/mcp`.
4. Complete Continuum OAuth, review the requested read/write scopes, and enable the connector for the conversation.
5. Return to Continuum Integrations to inspect or revoke the client.

Official guide: [Claude remote MCP custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

## Featherless

1. Create a key in the [official Featherless API Keys page](https://featherless.ai/account/api-keys); see the [official quickstart](https://featherless.ai/docs/quickstart-guide).
2. Local: set `FEATHERLESS_API_KEY` in `.env.local`.
3. Production: add `FEATHERLESS_API_KEY` as a Sensitive Vercel Production variable and redeploy.
4. Reload Integrations and confirm both configured and reachable.

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
4. Redeploy and confirm Integrations reports `10/10` key slots.

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
