# Continuum Sync for Obsidian

This optional plugin keeps Continuum as the structured source of truth while letting the user retain human-readable vault copies and sync selected source documents.

1. In Continuum, open Integrations → Obsidian and create a vault token. It is shown once.
2. Build this package with `pnpm --filter @continuum/obsidian-plugin build`.
3. Copy `manifest.json`, `main.js`, and `versions.json` to `<vault>/.obsidian/plugins/continuum-sync/`.
4. Enable the plugin. In its settings, add the token to Obsidian SecretStorage, select it, and enter the public HTTPS URL of the Continuum deployment.
5. Choose one folder, or explicitly opt into whole-vault sync. Synchronization is manual by default.

Tokens are stored through Obsidian SecretStorage, are hash-only on the Continuum server, expire after 180 days, and can be revoked from Continuum. Generated pull files contain `continuum_generated: true`; the plugin refuses to overwrite ordinary notes.
