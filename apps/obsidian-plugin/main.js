"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ContinuumPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var defaults = {
  baseUrl: "https://your-continuum.example",
  secretName: "",
  syncEntireVault: false,
  includeFolder: "Continuum Inbox",
  pullFolder: "Continuum",
  includeBinary: true
};
var textExtensions = /* @__PURE__ */ new Set(["md", "markdown", "txt", "csv", "json", "yaml", "yml", "tex", "py", "js", "ts", "tsx", "jsx", "java", "c", "cpp", "h", "rs", "go"]);
function mime(file) {
  const known = { md: "text/markdown", markdown: "text/markdown", txt: "text/plain", csv: "text/csv", json: "application/json", pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" };
  return known[file.extension.toLowerCase()] ?? "application/octet-stream";
}
function base64(bytes) {
  const array = new Uint8Array(bytes);
  let binary = "";
  for (let offset = 0; offset < array.length; offset += 32768) binary += String.fromCharCode(...array.subarray(offset, offset + 32768));
  return btoa(binary);
}
var ContinuumPlugin = class extends import_obsidian.Plugin {
  settings = defaults;
  async onload() {
    this.settings = { ...defaults, ...await this.loadData() ?? {} };
    this.addSettingTab(new ContinuumSettingTab(this.app, this));
    this.addRibbonIcon("refresh-cw", "Sync selected documents with Continuum", () => void this.syncNow());
    this.addCommand({ id: "sync-now", name: "Sync selected documents now", callback: () => void this.syncNow() });
    this.addCommand({ id: "pull-context", name: "Pull Continuum context and outcome receipts", callback: () => void this.pullContext() });
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  endpoint() {
    const url = new URL(this.settings.baseUrl);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("Continuum URL must use HTTPS, except on localhost");
    return new URL("/api/integrations/obsidian/sync", url).toString();
  }
  token() {
    if (!this.settings.secretName) throw new Error("Choose a Continuum token in Obsidian SecretStorage");
    const token = this.app.secretStorage.getSecret(this.settings.secretName);
    if (!token) throw new Error("The selected Continuum secret is empty or unavailable");
    return token;
  }
  selectedFiles() {
    const folder = (0, import_obsidian.normalizePath)(this.settings.includeFolder.trim());
    const pullFolder = (0, import_obsidian.normalizePath)(this.settings.pullFolder.trim());
    if (!this.settings.syncEntireVault && !folder) throw new Error("Choose a vault folder or explicitly enable entire-vault sync");
    return this.app.vault.getFiles().filter((file) => {
      if (file.path === pullFolder || file.path.startsWith(`${pullFolder}/`)) return false;
      if (!this.settings.syncEntireVault && file.path !== folder && !file.path.startsWith(`${folder}/`)) return false;
      return this.settings.includeBinary || textExtensions.has(file.extension.toLowerCase());
    });
  }
  async syncNow() {
    try {
      const endpoint = this.endpoint();
      const token = this.token();
      const files = this.selectedFiles();
      if (!files.length) return void new import_obsidian.Notice("Continuum: no files matched the selected folder.");
      new import_obsidian.Notice(`Continuum: syncing ${files.length} document${files.length === 1 ? "" : "s"}\u2026`);
      let synced = 0;
      let unchanged = 0;
      let failed = 0;
      for (const file of files) {
        if (file.stat.size > 10 * 1024 * 1024) {
          failed += 1;
          continue;
        }
        try {
          const isText = textExtensions.has(file.extension.toLowerCase());
          const body = isText ? { path: file.path, mimeType: mime(file), modifiedAt: new Date(file.stat.mtime).toISOString(), content: await this.app.vault.read(file), metadata: { vault: this.app.vault.getName() } } : { path: file.path, mimeType: mime(file), modifiedAt: new Date(file.stat.mtime).toISOString(), contentBase64: base64(await this.app.vault.readBinary(file)), metadata: { vault: this.app.vault.getName() } };
          const response = await (0, import_obsidian.requestUrl)({ url: endpoint, method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body), throw: false });
          if (response.status < 200 || response.status >= 300) {
            failed += 1;
            continue;
          }
          if (response.json.unchanged) unchanged += 1;
          else synced += 1;
        } catch {
          failed += 1;
        }
      }
      this.settings.lastSync = (/* @__PURE__ */ new Date()).toISOString();
      await this.saveSettings();
      new import_obsidian.Notice(`Continuum: ${synced} synced, ${unchanged} unchanged${failed ? `, ${failed} failed or exceeded 10 MB` : ""}.`);
    } catch (error) {
      new import_obsidian.Notice(`Continuum: ${error instanceof Error ? error.message : "sync failed"}`);
    }
  }
  async ensureFolder(path) {
    const parts = (0, import_obsidian.normalizePath)(path).split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
    }
  }
  async pullContext() {
    try {
      const response = await (0, import_obsidian.requestUrl)({ url: this.endpoint(), method: "GET", headers: { authorization: `Bearer ${this.token()}` }, throw: false });
      if (response.status < 200 || response.status >= 300) throw new Error(`server returned ${response.status}`);
      const documents = response.json.documents ?? [];
      const root = (0, import_obsidian.normalizePath)(this.settings.pullFolder);
      await this.ensureFolder(root);
      for (const document of documents) {
        const name = document.path.split("/").at(-1);
        const path = (0, import_obsidian.normalizePath)(`${root}/${name}`);
        const existing = this.app.vault.getFileByPath(path);
        if (!existing) await this.app.vault.create(path, document.content);
        else {
          const current = await this.app.vault.cachedRead(existing);
          if (!current.includes("continuum_generated: true")) {
            new import_obsidian.Notice(`Continuum did not overwrite ${path}; it is not marked as generated.`);
            continue;
          }
          await this.app.vault.process(existing, () => document.content);
        }
      }
      new import_obsidian.Notice(`Continuum: updated ${documents.length} generated context document${documents.length === 1 ? "" : "s"}.`);
    } catch (error) {
      new import_obsidian.Notice(`Continuum: ${error instanceof Error ? error.message : "pull failed"}`);
    }
  }
};
var ContinuumSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    this.containerEl.empty();
    this.containerEl.createEl("h2", { text: "Continuum Sync" });
    new import_obsidian.Setting(this.containerEl).setName("Continuum URL").setDesc("Your HTTPS Continuum deployment. The token is never added to this URL.").addText((input) => input.setPlaceholder("https://continuum.example").setValue(this.plugin.settings.baseUrl).onChange(async (value) => {
      this.plugin.settings.baseUrl = value.trim();
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(this.containerEl).setName("Continuum token").setDesc("Select or create the one-time token shown by Continuum. Only its secret name is stored in plugin data.").addComponent((element) => new import_obsidian.SecretComponent(this.app, element).setValue(this.plugin.settings.secretName).onChange(async (value) => {
      this.plugin.settings.secretName = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(this.containerEl).setName("Folder to sync").setDesc("Used unless entire-vault sync is explicitly enabled.").addText((input) => input.setValue(this.plugin.settings.includeFolder).onChange(async (value) => {
      this.plugin.settings.includeFolder = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(this.containerEl).setName("Sync the entire vault").setDesc("Opt-in. Manual sync sends every visible file except Continuum-generated output; files are limited to 10 MB each.").addToggle((toggle) => toggle.setValue(this.plugin.settings.syncEntireVault).onChange(async (value) => {
      this.plugin.settings.syncEntireVault = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(this.containerEl).setName("Include binary files").setDesc("When private Blob storage is configured, originals are retained; PDFs are also indexed when readable.").addToggle((toggle) => toggle.setValue(this.plugin.settings.includeBinary).onChange(async (value) => {
      this.plugin.settings.includeBinary = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(this.containerEl).setName("Continuum output folder").setDesc("Generated context documents are never included in the upload loop.").addText((input) => input.setValue(this.plugin.settings.pullFolder).onChange(async (value) => {
      this.plugin.settings.pullFolder = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(this.containerEl).setName("Sync now").setDesc(this.plugin.settings.lastSync ? `Last manual sync: ${new Date(this.plugin.settings.lastSync).toLocaleString()}` : "No sync has run yet.").addButton((button) => button.setButtonText("Sync selected files").setCta().onClick(() => void this.plugin.syncNow()));
    new import_obsidian.Setting(this.containerEl).setName("Pull Continuum context").setDesc("Writes only Continuum-marked generated notes and refuses to overwrite ordinary notes.").addButton((button) => button.setButtonText("Pull context").onClick(() => void this.plugin.pullContext()));
  }
};
