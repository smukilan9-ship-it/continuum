# Obsidian integration

The connector is optional. Continuum does not need Obsidian to provide persistent memory.

## Safety model

- The user creates a scoped, one-time-visible token from Continuum Integrations.
- The Obsidian plugin stores it with Obsidian SecretStorage rather than plugin settings JSON.
- Manual sync and one selected folder are the defaults.
- Whole-vault sync requires an explicit setting.
- Every file is capped at 10 MB per request, and readable content is capped at 500,000 indexed characters.
- Continuum-generated output is excluded from the push loop.
- Pulled documents must carry `continuum_generated: true`; ordinary vault notes are never overwritten.
- Sync tokens are stored in Continuum only as SHA-256 hashes, are scoped, expire, display last use, and can be revoked.

## Data behavior

Readable Markdown, text, code, JSON, CSV, YAML, TeX, and PDF content can be sanitized, chunked, and indexed. If private Blob storage is configured, original files are also retained there. Without Blob, readable text is still indexed; non-text originals produce a warning instead of a false storage claim.

Continuum pulls stable generated context packs into
`Continuum/Context Packs/<stable-id>.md`: current week, current misconceptions, and
owned goal/project packs. Pull is incremental, skips unchanged content, and refuses
to overwrite a file that is not marked `continuum_generated: true`.

These are export views. Postgres remains canonical for transactional state, ownership, audit, MCP access, and retrieval. See `obsidian-sync.md` for the current mirror contract.

## Build and install

```bash
pnpm --filter @continuum/obsidian-plugin build
```

Copy `manifest.json`, `main.js`, and `versions.json` from `apps/obsidian-plugin` into `.obsidian/plugins/continuum-sync/` in the desired vault. Review the plugin, enable it under Obsidian Community plugins, enter the HTTPS Continuum origin and the one-time token, choose a folder, and run a manual sync first. Obsidian's official [community plugin installation](https://obsidian.md/help/community-plugins) and [plugin security](https://obsidian.md/help/Extending%2BObsidian/Plugin%2Bsecurity) guides explain the host-side steps and trust boundary.

Do not expose a local Continuum development server to the public internet with a production token. Use separate development credentials and an authenticated HTTPS tunnel when remote testing is required.
