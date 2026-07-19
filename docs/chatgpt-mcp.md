# ChatGPT MCP future scope

Continuum’s canonical `/mcp` endpoint uses standard Streamable HTTP, JSON Schema tool inputs, structured results, stable resource URIs, OAuth discovery, dynamic client registration, PKCE, token rotation, and revocation. `/api/mcp` remains a compatibility alias. These choices avoid coupling the server to Claude.

However, ChatGPT is not a currently accepted integration for this repository. It is not shown as connected in the UI, no ChatGPT-specific setup is promised to users, and no end-to-end production claim should be made until a supported ChatGPT environment has passed:

1. OAuth connection and exact redirect validation.
2. Tool/resource enumeration with scope filtering.
3. `load_context` and `load_project` over real user state.
4. A proposed write, explicit confirmation, and app round trip.
5. Revocation on the next request.
6. Token-budget and prompt-injection checks.

Until those gates pass, the Integrations UI labels ChatGPT as future scope.
