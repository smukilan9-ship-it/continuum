import {
  normalizeVaultPath as normalizeContinuumPath,
  parseContinuumFrontmatter,
  renderContinuumMarkdown,
  syncBackoffMilliseconds,
  synchronizedRecordTypes,
  type ContinuumFrontmatter,
  type SyncDeletionState,
  type SynchronizedRecordType,
} from "@continuum/domain";
import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  requestUrl,
  SecretComponent,
  Setting,
  TAbstractFile,
  TFile,
  normalizePath,
} from "obsidian";

type OperationType = "create" | "update" | "rename" | "move" | "delete";

type BridgeOperation = {
  operationId: string;
  idempotencyKey: string;
  operationType: OperationType;
  syncId?: string;
  recordId?: string;
  recordType: SynchronizedRecordType;
  schemaVersion: number;
  title: string;
  path: string;
  content: string;
  contentHash: string;
  localRevision: number;
  knownServerRevision: number;
  commonBaseRevision: number;
  deletionState: SyncDeletionState;
  createdAt: string;
  updatedAt: string;
  origin: "obsidian";
  metadata?: Record<string, unknown>;
};

type QueuedOperation = BridgeOperation & {
  state: "pending" | "retry" | "conflict";
  attemptCount: number;
  nextAttemptAt: string;
  latestError?: string;
};

type LocalRecord = {
  path: string;
  recordId: string;
  syncId: string;
  recordType: SynchronizedRecordType;
  ownerFingerprint: string;
  contentHash: string;
  localRevision: number;
  serverRevision: number;
  commonBaseRevision: number;
  createdAt: string;
  deletionState: SyncDeletionState;
};

interface ContinuumSettings {
  baseUrl: string;
  secretName: string;
  enabled: boolean;
  paused: boolean;
  syncEntireVault: boolean;
  includeFolder: string;
  backupFolder: string;
  intervalSeconds: number;
  deletionBehavior: "archive" | "delete";
  enabledTypes: SynchronizedRecordType[];
  folderByType: Partial<Record<SynchronizedRecordType, string>>;
  ownerFingerprint?: string;
  lastSync?: string;
  lastError?: string;
  queue: QueuedOperation[];
  records: Record<string, LocalRecord>;
}

const defaultFolders: Partial<Record<SynchronizedRecordType, string>> = {
  assistant_memory: "Continuum/Memories",
  research_note: "Continuum/Research",
  paper_note: "Continuum/Papers",
  learning_note: "Continuum/Learning",
  concept_summary: "Continuum/Concepts",
  project_note: "Continuum/Projects",
  session_summary: "Continuum/Sessions",
  decision: "Continuum/Decisions",
  open_question: "Continuum/Open Questions",
  next_action: "Continuum/Next Actions",
  linked_source: "Continuum/Sources",
  workspace_note: "Continuum/Notes",
};

const defaults: ContinuumSettings = {
  baseUrl: "https://your-continuum.example",
  secretName: "",
  enabled: true,
  paused: false,
  syncEntireVault: false,
  includeFolder: "Continuum",
  backupFolder: "Continuum Sync Backups",
  intervalSeconds: 30,
  deletionBehavior: "archive",
  enabledTypes: [...synchronizedRecordTypes],
  folderByType: defaultFolders,
  queue: [],
  records: {},
};

function newId(prefix: string) {
  const suffix = globalThis.crypto?.randomUUID?.().replaceAll("-", "")
    ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${suffix.slice(0, 24)}`;
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function titleFromFile(file: TFile) {
  return file.basename.trim().slice(0, 300) || "Untitled note";
}

function iso(value: string | undefined, fallback = new Date()) {
  if (value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return fallback.toISOString();
}

export default class ContinuumPlugin extends Plugin {
  settings: ContinuumSettings = defaults;
  private readonly suppressedPaths = new Set<string>();
  private readonly debounceTimers = new Map<string, number>();
  private readonly deletionTimers = new Map<string, number>();
  private syncing = false;
  private statusEl?: HTMLElement;

  async onload() {
    const stored = await this.loadData() as Partial<ContinuumSettings> | null;
    this.settings = {
      ...defaults,
      ...(stored ?? {}),
      folderByType: { ...defaultFolders, ...(stored?.folderByType ?? {}) },
      enabledTypes: stored?.enabledTypes ?? [...synchronizedRecordTypes],
      queue: stored?.queue ?? [],
      records: stored?.records ?? {},
    };
    this.addSettingTab(new ContinuumSettingTab(this.app, this));
    this.addRibbonIcon("refresh-cw", "Synchronize Continuum now", () => void this.syncNow(true));
    this.addCommand({ id: "sync-now", name: "Synchronize now", callback: () => void this.syncNow(true) });
    this.addCommand({ id: "pair-from-clipboard", name: "Pair using token from clipboard", callback: () => void this.pairFromClipboard() });
    this.addCommand({ id: "pause-sync", name: "Pause or resume synchronization", callback: () => void this.togglePause() });
    this.addCommand({ id: "retry-failed-sync", name: "Retry failed synchronization operations", callback: () => void this.retryFailed() });
    this.addCommand({ id: "backup-sync-index", name: "Back up synchronization index", callback: () => void this.backupIndex() });
    this.statusEl = this.addStatusBarItem();
    this.updateStatus();

    this.registerEvent(this.app.vault.on("create", (file) => {
      if (file instanceof TFile) this.scheduleCapture(file);
    }));
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file instanceof TFile) this.scheduleCapture(file);
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => this.scheduleDeletion(file)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (file instanceof TFile) this.scheduleCapture(file, oldPath);
    }));
    this.registerInterval(window.setInterval(() => void this.syncNow(false), Math.max(10, this.settings.intervalSeconds) * 1_000));
    this.app.workspace.onLayoutReady(() => void this.initialScan());
  }

  async onunload() {
    for (const timer of this.debounceTimers.values()) window.clearTimeout(timer);
    for (const timer of this.deletionTimers.values()) window.clearTimeout(timer);
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.updateStatus();
  }

  private updateStatus() {
    if (!this.statusEl) return;
    const blocked = this.settings.queue.filter((entry) => entry.state === "conflict").length;
    const state = this.settings.paused ? "paused" : this.syncing ? "syncing" : this.settings.lastError ? "needs attention" : "ready";
    this.statusEl.setText(`Continuum: ${state} · ${this.settings.queue.length} queued${blocked ? ` · ${blocked} blocked` : ""}`);
    this.statusEl.setAttribute("aria-label", this.settings.lastError ?? "Continuum synchronization status");
  }

  private endpoint(mode?: "operations") {
    const url = new URL(this.settings.baseUrl);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
      throw new Error("Continuum URL must use HTTPS, except on localhost.");
    }
    const endpoint = new URL("/api/integrations/obsidian/sync", url);
    if (mode) endpoint.searchParams.set("mode", mode);
    return endpoint.toString();
  }

  private token() {
    if (!this.settings.secretName) throw new Error("Choose a Continuum token in Obsidian SecretStorage.");
    const token = this.app.secretStorage.getSecret(this.settings.secretName);
    if (!token) throw new Error("The selected Continuum secret is empty or unavailable.");
    return token;
  }

  async pairFromClipboard() {
    try {
      const token = (await navigator.clipboard.readText()).trim();
      if (!/^ctm_obs_[A-Za-z0-9_-]{43}$/.test(token)) {
        throw new Error("Copy a fresh Continuum vault token before pairing.");
      }
      const secretName = this.settings.secretName || "continuum-sync-token";
      this.app.secretStorage.setSecret(secretName, token);
      this.settings.secretName = secretName;
      this.settings.baseUrl = this.settings.baseUrl.trim() || "https://continuumstudy.vercel.app";
      this.settings.enabled = true;
      this.settings.paused = false;
      await this.saveSettings();
      new Notice("Continuum vault token stored in Obsidian SecretStorage. Testing synchronization…");
      await this.syncNow(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Clipboard pairing failed.";
      this.settings.lastError = message;
      await this.saveSettings();
      this.updateStatus();
      new Notice(message);
    }
  }

  private isManaged(file: TFile) {
    if (file.extension.toLowerCase() !== "md") return false;
    const path = normalizePath(file.path);
    const backup = normalizePath(this.settings.backupFolder);
    if (path === backup || path.startsWith(`${backup}/`)) return false;
    if (this.settings.syncEntireVault) return true;
    if (Object.values(this.settings.records).some((record) => normalizePath(record.path) === path)) return true;
    const folders = [
      this.settings.includeFolder,
      ...this.settings.enabledTypes.map((recordType) => this.settings.folderByType[recordType] ?? ""),
    ]
      .map((folder) => normalizePath(folder))
      .filter(Boolean);
    return folders.some((folder) => path === folder || path.startsWith(`${folder}/`));
  }

  private scheduleCapture(file: TFile, oldPath?: string) {
    if (!this.settings.enabled || this.settings.paused || !this.isManaged(file) || this.suppressedPaths.has(file.path)) return;
    const previous = this.debounceTimers.get(file.path);
    if (previous) window.clearTimeout(previous);
    const timer = window.setTimeout(() => {
      this.debounceTimers.delete(file.path);
      void this.captureFile(file, oldPath);
    }, 750);
    this.debounceTimers.set(file.path, timer);
  }

  private scheduleDeletion(file: TAbstractFile) {
    if (!this.settings.enabled || this.settings.paused || this.suppressedPaths.has(file.path)) return;
    const existing = this.deletionTimers.get(file.path);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      this.deletionTimers.delete(file.path);
      void this.captureDeletion(file);
    }, 1_500);
    this.deletionTimers.set(file.path, timer);
  }

  private cancelScheduledDeletion(...paths: Array<string | undefined>) {
    for (const candidate of paths) {
      if (!candidate) continue;
      const path = normalizePath(candidate);
      const timer = this.deletionTimers.get(path);
      if (!timer) continue;
      window.clearTimeout(timer);
      this.deletionTimers.delete(path);
    }
  }

  private async rewrite(file: TFile, metadata: ContinuumFrontmatter, body: string) {
    this.suppressedPaths.add(file.path);
    try {
      const rendered = renderContinuumMarkdown(metadata, body);
      const current = await this.app.vault.cachedRead(file);
      if (current !== rendered) await this.app.vault.modify(file, rendered);
    } finally {
      window.setTimeout(() => this.suppressedPaths.delete(file.path), 1_000);
    }
  }

  private operationType(previous: LocalRecord | undefined, oldPath: string | undefined, newPath: string): OperationType {
    if (!previous) return "create";
    const priorPath = normalizePath(oldPath ?? previous.path);
    const currentPath = normalizePath(newPath);
    if (priorPath === currentPath) return "update";
    const priorFolder = priorPath.split("/").slice(0, -1).join("/");
    const currentFolder = currentPath.split("/").slice(0, -1).join("/");
    return priorFolder === currentFolder ? "rename" : "move";
  }

  private async captureFile(file: TFile, oldPath?: string) {
    try {
      if (!this.isManaged(file) || file.stat.size > 2 * 1024 * 1024) return;
      const markdown = await this.app.vault.cachedRead(file);
      const parsed = parseContinuumFrontmatter(markdown);
      let metadata = parsed.metadata;
      const previousByPath = Object.values(this.settings.records).find((entry) => entry.path === normalizePath(oldPath ?? file.path));
      if (metadata && this.settings.ownerFingerprint && metadata.continuum_owner !== this.settings.ownerFingerprint) {
        metadata = undefined;
        new Notice(`Continuum forked ${file.path} because its owner metadata belongs to another account.`);
      }
      const now = new Date().toISOString();
      const contentHash = await digest(parsed.body);
      const recordId = metadata?.continuum_record_id ?? previousByPath?.recordId ?? newId("workspace_note");
      const syncId = metadata?.continuum_sync_id ?? previousByPath?.syncId ?? newId("sync_local");
      const existing = this.settings.records[syncId] ?? previousByPath;
      this.cancelScheduledDeletion(oldPath, previousByPath?.path, existing?.path);
      const recordType = metadata?.continuum_record_type ?? existing?.recordType ?? "workspace_note";
      if (!this.settings.enabledTypes.includes(recordType)) return;
      const duplicate = this.settings.records[syncId];
      if (
        duplicate
        && duplicate.path !== normalizePath(oldPath ?? file.path)
        && duplicate.path !== file.path
        && this.app.vault.getFileByPath(duplicate.path)
      ) {
        throw new Error(`Duplicate Continuum sync ID also exists at ${duplicate.path}. Give one copy a new sync identity before continuing.`);
      }
      if (existing && existing.contentHash === contentHash && existing.path === file.path && !oldPath) return;
      const localRevision = Math.max(metadata?.continuum_local_revision ?? 0, existing?.localRevision ?? 0) + 1;
      const serverRevision = metadata?.continuum_server_revision ?? existing?.serverRevision ?? 0;
      const commonBaseRevision = metadata?.continuum_common_base_revision ?? existing?.commonBaseRevision ?? 0;
      const ownerFingerprint = metadata?.continuum_owner ?? existing?.ownerFingerprint ?? this.settings.ownerFingerprint ?? "owner_pending";
      const createdAt = iso(metadata?.continuum_created_at ?? existing?.createdAt);
      const title = titleFromFile(file);
      const operationType = this.operationType(existing, oldPath, file.path);
      const operation: QueuedOperation = {
        operationId: newId("bridge_operation"),
        idempotencyKey: `${syncId}:${localRevision}:${operationType}:${contentHash.slice(0, 16)}`,
        operationType,
        syncId,
        recordId,
        recordType,
        schemaVersion: 1,
        title,
        path: normalizeContinuumPath(file.path),
        content: parsed.body,
        contentHash,
        localRevision,
        knownServerRevision: serverRevision,
        commonBaseRevision,
        deletionState: "active",
        createdAt,
        updatedAt: now,
        origin: "obsidian",
        metadata: { vault: this.app.vault.getName(), previousPath: oldPath },
        state: "pending",
        attemptCount: 0,
        nextAttemptAt: now,
      };
      this.settings.queue = this.settings.queue.filter((entry) => entry.syncId !== syncId || entry.state === "conflict");
      this.settings.queue.push(operation);
      this.settings.records[syncId] = {
        path: file.path,
        recordId,
        syncId,
        recordType,
        ownerFingerprint,
        contentHash,
        localRevision,
        serverRevision,
        commonBaseRevision,
        createdAt,
        deletionState: "active",
      };
      await this.rewrite(file, {
        continuum_record_id: recordId,
        continuum_sync_id: syncId,
        continuum_schema_version: 1,
        continuum_record_type: recordType,
        continuum_owner: ownerFingerprint,
        continuum_local_revision: localRevision,
        continuum_server_revision: serverRevision,
        continuum_common_base_revision: commonBaseRevision,
        continuum_content_hash: contentHash,
        continuum_created_at: createdAt,
        continuum_updated_at: now,
        continuum_last_synced_at: metadata?.continuum_last_synced_at ?? "",
        continuum_origin: "obsidian",
        continuum_deletion_state: "active",
      }, parsed.body);
      await this.saveSettings();
    } catch (error) {
      this.settings.lastError = error instanceof Error ? error.message : "Could not queue a changed note.";
      await this.saveSettings();
      new Notice(`Continuum: ${this.settings.lastError}`);
    }
  }

  private async captureDeletion(file: TAbstractFile) {
    if (!this.settings.enabled || this.settings.paused || this.suppressedPaths.has(file.path)) return;
    const local = Object.values(this.settings.records).find((entry) => entry.path === file.path);
    if (!local) return;
    const now = new Date().toISOString();
    const emptyHash = await digest("");
    this.settings.queue = this.settings.queue.filter((entry) => entry.syncId !== local.syncId || entry.state === "conflict");
    this.settings.queue.push({
      operationId: newId("bridge_operation"),
      idempotencyKey: `${local.syncId}:${local.localRevision + 1}:delete:${emptyHash.slice(0, 16)}`,
      operationType: "delete",
      syncId: local.syncId,
      recordId: local.recordId,
      recordType: local.recordType,
      schemaVersion: 1,
      title: file.name.replace(/\.md$/i, ""),
      path: normalizeContinuumPath(file.path),
      content: "",
      contentHash: emptyHash,
      localRevision: local.localRevision + 1,
      knownServerRevision: local.serverRevision,
      commonBaseRevision: local.commonBaseRevision,
      deletionState: "tombstone",
      createdAt: local.createdAt,
      updatedAt: now,
      origin: "obsidian",
      state: "pending",
      attemptCount: 0,
      nextAttemptAt: now,
    });
    local.localRevision += 1;
    local.contentHash = emptyHash;
    local.deletionState = "tombstone";
    await this.saveSettings();
  }

  private async initialScan() {
    if (!this.settings.enabled || this.settings.paused) return;
    const seen = new Map<string, string>();
    for (const file of this.app.vault.getMarkdownFiles().filter((candidate) => this.isManaged(candidate))) {
      try {
        const parsed = parseContinuumFrontmatter(await this.app.vault.cachedRead(file));
        const syncId = parsed.metadata?.continuum_sync_id;
        if (syncId && seen.has(syncId)) {
          this.settings.lastError = `Duplicate sync identity in ${seen.get(syncId)} and ${file.path}.`;
          new Notice(`Continuum: ${this.settings.lastError}`);
          continue;
        }
        if (syncId) seen.set(syncId, file.path);
        await this.captureFile(file);
      } catch (error) {
        this.settings.lastError = `${file.path}: ${error instanceof Error ? error.message : "malformed synchronization metadata"}`;
      }
    }
    await this.saveSettings();
    await this.syncNow(false);
  }

  private async post(body: unknown) {
    return requestUrl({
      url: this.endpoint(),
      method: "POST",
      headers: { authorization: `Bearer ${this.token()}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      throw: false,
    });
  }

  private async pushQueue() {
    const now = Date.now();
    const ready = this.settings.queue.filter((entry) => entry.state !== "conflict" && new Date(entry.nextAttemptAt).getTime() <= now).slice(0, 100);
    if (!ready.length) return;
    const response = await this.post({ action: "push_batch", operations: ready.map(({ state: _state, attemptCount: _attemptCount, nextAttemptAt: _nextAttemptAt, latestError: _latestError, ...operation }) => operation) });
    if (response.status < 200 || response.status >= 300) throw new Error(`Continuum rejected the upload batch (${response.status}).`);
    const acknowledgements = (response.json as { acknowledgements?: Array<Record<string, unknown>> }).acknowledgements ?? [];
    for (const acknowledgement of acknowledgements) {
      const operationId = String(acknowledgement.operationId ?? "");
      const queued = this.settings.queue.find((entry) => entry.operationId === operationId);
      if (!queued) continue;
      const status = String(acknowledgement.status ?? "");
      if (status === "applied" || status === "duplicate_ignored") {
        const returnedSyncId = typeof acknowledgement.syncId === "string" ? acknowledgement.syncId : queued.syncId!;
        const record = this.settings.records[queued.syncId!] ?? this.settings.records[returnedSyncId];
        if (record) {
          if (returnedSyncId !== queued.syncId) {
            delete this.settings.records[queued.syncId!];
            record.syncId = returnedSyncId;
            this.settings.records[returnedSyncId] = record;
          }
          record.serverRevision = Number(acknowledgement.serverRevision ?? record.serverRevision);
          record.commonBaseRevision = Number(acknowledgement.commonBaseRevision ?? record.commonBaseRevision);
          if (typeof acknowledgement.ownerFingerprint === "string") {
            record.ownerFingerprint = acknowledgement.ownerFingerprint;
            this.settings.ownerFingerprint = acknowledgement.ownerFingerprint;
          }
          const file = this.app.vault.getFileByPath(record.path);
          if (file) {
            const parsed = parseContinuumFrontmatter(await this.app.vault.cachedRead(file));
            await this.rewrite(file, {
              continuum_record_id: record.recordId,
              continuum_sync_id: returnedSyncId,
              continuum_schema_version: 1,
              continuum_record_type: record.recordType,
              continuum_owner: record.ownerFingerprint,
              continuum_local_revision: record.localRevision,
              continuum_server_revision: record.serverRevision,
              continuum_common_base_revision: record.commonBaseRevision,
              continuum_content_hash: record.contentHash,
              continuum_created_at: record.createdAt,
              continuum_updated_at: new Date().toISOString(),
              continuum_last_synced_at: new Date().toISOString(),
              continuum_origin: "obsidian",
              continuum_deletion_state: record.deletionState,
            }, parsed.body);
          }
        }
        this.settings.queue = this.settings.queue.filter((entry) => entry.operationId !== operationId);
      } else if (status === "conflict") {
        queued.state = "conflict";
        queued.latestError = String(acknowledgement.error ?? "Both sides changed from their common base.");
      } else {
        queued.state = "retry";
        queued.attemptCount += 1;
        queued.latestError = String(acknowledgement.error ?? "The operation was rejected.");
        queued.nextAttemptAt = new Date(Date.now() + syncBackoffMilliseconds(queued.attemptCount)).toISOString();
      }
    }
  }

  private mappedPath(payload: Record<string, unknown>) {
    const recordType = String(payload.recordType) as SynchronizedRecordType;
    const configured = normalizePath(this.settings.folderByType[recordType] ?? this.settings.includeFolder);
    const original = normalizeContinuumPath(String(payload.path));
    const name = original.split("/").at(-1)!;
    return normalizeContinuumPath(`${configured}/${name}`);
  }

  private async ensureFolder(path: string) {
    const parts = normalizePath(path).split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
    }
  }

  private async backupFile(file: TFile) {
    const root = normalizePath(`${this.settings.backupFolder}/${new Date().toISOString().replace(/[:.]/g, "-")}`);
    const path = normalizePath(`${root}/${file.path}`);
    await this.ensureFolder(path.split("/").slice(0, -1).join("/"));
    if (!this.app.vault.getAbstractFileByPath(path)) await this.app.vault.create(path, await this.app.vault.cachedRead(file));
  }

  private async applyRemoteOperation(operation: Record<string, unknown>) {
    const operationId = String(operation.id);
    const payload = operation.payload as Record<string, unknown>;
    const syncId = String(payload.syncId);
    const operationMetadata = payload.metadata as Record<string, unknown> | undefined;
    const resolvesConflict = typeof operationMetadata?.conflictResolution === "string";
    const deletionState = String(payload.deletionState) as SyncDeletionState;
    const existingRecord = this.settings.records[syncId];
    const currentFile = existingRecord ? this.app.vault.getFileByPath(existingRecord.path) : undefined;
    if (deletionState === "tombstone" || operation.operationType === "delete") {
      const localRevision = Math.max(existingRecord?.localRevision ?? 0, Number(payload.localRevision ?? 0)) + 1;
      const serverRevision = Number(payload.serverRevision ?? existingRecord?.serverRevision ?? 0);
      if (currentFile) {
        const priorPath = currentFile.path;
        this.suppressedPaths.add(priorPath);
        try {
          await this.backupFile(currentFile);
          const forceDelete = Boolean(operationMetadata?.forceDelete);
          if (forceDelete || this.settings.deletionBehavior === "delete") await this.app.vault.delete(currentFile);
          else {
            const archivePath = normalizePath(`${this.settings.backupFolder}/Archived/${currentFile.path}`);
            this.suppressedPaths.add(archivePath);
            const parsed = parseContinuumFrontmatter(await this.app.vault.cachedRead(currentFile));
            await this.rewrite(currentFile, {
              continuum_record_id: existingRecord?.recordId ?? String(payload.recordId),
              continuum_sync_id: syncId,
              continuum_schema_version: Number(payload.schemaVersion ?? 1),
              continuum_record_type: existingRecord?.recordType ?? String(payload.recordType) as SynchronizedRecordType,
              continuum_owner: existingRecord?.ownerFingerprint ?? String(payload.ownerFingerprint),
              continuum_local_revision: localRevision,
              continuum_server_revision: serverRevision,
              continuum_common_base_revision: serverRevision,
              continuum_content_hash: await digest(parsed.body),
              continuum_created_at: existingRecord?.createdAt ?? iso(String(payload.createdAt ?? "")),
              continuum_updated_at: iso(String(payload.updatedAt ?? "")),
              continuum_last_synced_at: new Date().toISOString(),
              continuum_origin: "continuum",
              continuum_deletion_state: "archived",
            }, parsed.body);
            await this.ensureFolder(archivePath.split("/").slice(0, -1).join("/"));
            await this.app.fileManager.renameFile(currentFile, archivePath);
          }
        } finally {
          window.setTimeout(() => {
            this.suppressedPaths.delete(priorPath);
            this.suppressedPaths.delete(currentFile.path);
          }, 1_000);
        }
      }
      if (existingRecord) {
        existingRecord.localRevision = localRevision;
        existingRecord.serverRevision = serverRevision;
        existingRecord.commonBaseRevision = serverRevision;
        existingRecord.contentHash = String(payload.contentHash ?? existingRecord.contentHash);
        existingRecord.deletionState = "tombstone";
      }
      if (resolvesConflict) this.settings.queue = this.settings.queue.filter((entry) => entry.syncId !== syncId);
      return { operationId, status: "completed" as const, localRevision };
    }
    const recordType = String(payload.recordType) as SynchronizedRecordType;
    if (!this.settings.enabledTypes.includes(recordType)) {
      return { operationId, status: "retry" as const, error: `${recordType} is disabled in Obsidian settings.` };
    }
    const path = this.mappedPath(payload);
    await this.ensureFolder(path.split("/").slice(0, -1).join("/"));
    let file = currentFile ?? this.app.vault.getFileByPath(path);
    const content = String(payload.content ?? "");
    const contentHash = String(payload.contentHash);
    if (await digest(content) !== contentHash) return { operationId, status: "retry" as const, error: "Downloaded content hash did not match." };
    if (file && existingRecord && existingRecord.contentHash !== contentHash) await this.backupFile(file);
    const localRevision = (existingRecord?.localRevision ?? Number(payload.localRevision ?? 0)) + 1;
    const now = new Date().toISOString();
    const metadata: ContinuumFrontmatter = {
      continuum_record_id: String(payload.recordId),
      continuum_sync_id: syncId,
      continuum_schema_version: Number(payload.schemaVersion ?? 1),
      continuum_record_type: recordType,
      continuum_owner: String(payload.ownerFingerprint),
      continuum_local_revision: localRevision,
      continuum_server_revision: Number(payload.serverRevision),
      continuum_common_base_revision: Number(payload.serverRevision),
      continuum_content_hash: contentHash,
      continuum_created_at: iso(String(payload.createdAt ?? "")),
      continuum_updated_at: iso(String(payload.updatedAt ?? "")),
      continuum_last_synced_at: now,
      continuum_origin: "continuum",
      continuum_deletion_state: "active",
    };
    const rendered = renderContinuumMarkdown(metadata, content);
    if (!file) {
      this.suppressedPaths.add(path);
      try { file = await this.app.vault.create(path, rendered); } finally { window.setTimeout(() => this.suppressedPaths.delete(path), 1_000); }
    } else {
      if (file.path !== path) {
        const priorPath = file.path;
        this.suppressedPaths.add(priorPath);
        this.suppressedPaths.add(path);
        try {
          await this.app.fileManager.renameFile(file, path);
        } finally {
          window.setTimeout(() => {
            this.suppressedPaths.delete(priorPath);
            this.suppressedPaths.delete(path);
          }, 1_000);
        }
      }
      await this.rewrite(file, metadata, content);
    }
    this.settings.ownerFingerprint = metadata.continuum_owner;
    this.settings.records[syncId] = {
      path,
      recordId: metadata.continuum_record_id,
      syncId,
      recordType,
      ownerFingerprint: metadata.continuum_owner,
      contentHash,
      localRevision,
      serverRevision: metadata.continuum_server_revision,
      commonBaseRevision: metadata.continuum_common_base_revision,
      createdAt: metadata.continuum_created_at,
      deletionState: "active",
    };
    if (resolvesConflict) this.settings.queue = this.settings.queue.filter((entry) => entry.syncId !== syncId);
    return { operationId, status: "completed" as const, localRevision };
  }

  private async pullQueue() {
    const response = await requestUrl({
      url: this.endpoint("operations"),
      method: "GET",
      headers: { authorization: `Bearer ${this.token()}` },
      throw: false,
    });
    if (response.status < 200 || response.status >= 300) throw new Error(`Continuum rejected the download request (${response.status}).`);
    const operations = (response.json as { operations?: Array<Record<string, unknown>> }).operations ?? [];
    const acknowledgements = [];
    for (const operation of operations) {
      try {
        acknowledgements.push(await this.applyRemoteOperation(operation));
      } catch (error) {
        acknowledgements.push({ operationId: String(operation.id), status: "retry" as const, error: error instanceof Error ? error.message : "Vault write failed." });
      }
    }
    if (acknowledgements.length) {
      const acknowledged = await this.post({ action: "ack", acknowledgements });
      if (acknowledged.status < 200 || acknowledged.status >= 300) throw new Error(`Continuum could not acknowledge vault writes (${acknowledged.status}).`);
    }
  }

  async syncNow(notify: boolean) {
    if (!this.settings.enabled || this.settings.paused || this.syncing) {
      if (notify && this.settings.paused) new Notice("Continuum synchronization is paused.");
      return;
    }
    this.syncing = true;
    this.updateStatus();
    try {
      this.token();
      await this.pushQueue();
      await this.pullQueue();
      this.settings.lastSync = new Date().toISOString();
      this.settings.lastError = undefined;
      await this.saveSettings();
      if (notify) new Notice(`Continuum synchronized. ${this.settings.queue.length} operation${this.settings.queue.length === 1 ? "" : "s"} remain queued.`);
    } catch (error) {
      this.settings.lastError = error instanceof Error ? error.message : "Synchronization failed.";
      for (const queued of this.settings.queue.filter((entry) => entry.state === "pending")) {
        queued.state = "retry";
        queued.attemptCount += 1;
        queued.latestError = this.settings.lastError;
        queued.nextAttemptAt = new Date(Date.now() + syncBackoffMilliseconds(queued.attemptCount)).toISOString();
      }
      await this.saveSettings();
      if (notify) new Notice(`Continuum: ${this.settings.lastError} Changes remain queued offline.`);
    } finally {
      this.syncing = false;
      this.updateStatus();
    }
  }

  private async togglePause() {
    this.settings.paused = !this.settings.paused;
    await this.saveSettings();
    new Notice(`Continuum synchronization ${this.settings.paused ? "paused" : "resumed"}.`);
    if (!this.settings.paused) await this.syncNow(false);
  }

  private async retryFailed() {
    const now = new Date().toISOString();
    for (const queued of this.settings.queue) {
      if (queued.state === "retry") {
        queued.state = "pending";
        queued.nextAttemptAt = now;
      }
    }
    this.settings.lastError = undefined;
    await this.saveSettings();
    await this.syncNow(true);
  }

  private async backupIndex() {
    try {
      const root = normalizePath(this.settings.backupFolder);
      await this.ensureFolder(root);
      const path = normalizePath(`${root}/sync-index-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      await this.app.vault.create(path, JSON.stringify({
        exportedAt: new Date().toISOString(),
        vault: this.app.vault.getName(),
        records: this.settings.records,
        queue: this.settings.queue.map(({ content: _content, ...metadata }) => metadata),
      }, null, 2));
      new Notice(`Continuum sync index backed up to ${path}.`);
    } catch (error) {
      new Notice(`Continuum: ${error instanceof Error ? error.message : "backup failed"}`);
    }
  }
}

class ContinuumSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: ContinuumPlugin) { super(app, plugin); }

  display() {
    this.containerEl.empty();
    this.containerEl.createEl("h2", { text: "Continuum bidirectional sync" });
    this.containerEl.createEl("p", { text: "Changes are queued durably, synchronized in both directions, and blocked for explicit review when both sides changed." });
    new Setting(this.containerEl).setName("Continuum URL").setDesc("Your HTTPS Continuum deployment.").addText((input) => input.setPlaceholder("https://continuum.example").setValue(this.plugin.settings.baseUrl).onChange(async (value) => { this.plugin.settings.baseUrl = value.trim(); await this.plugin.saveSettings(); }));
    new Setting(this.containerEl).setName("Continuum token").setDesc("Choose the SecretStorage entry containing the one-time bridge token. The token never enters plugin data or URLs.").addComponent((element) => new SecretComponent(this.app, element).setValue(this.plugin.settings.secretName).onChange(async (value) => { this.plugin.settings.secretName = value; await this.plugin.saveSettings(); }));
    new Setting(this.containerEl).setName("Pair copied token").setDesc("After copying a new vault token from Continuum, import it directly into Obsidian SecretStorage.").addButton((button) => button.setButtonText("Pair from clipboard").setCta().onClick(() => void this.plugin.pairFromClipboard()));
    new Setting(this.containerEl).setName("Enable synchronization").addToggle((toggle) => toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => { this.plugin.settings.enabled = value; await this.plugin.saveSettings(); }));
    new Setting(this.containerEl).setName("Pause writes").setDesc("Keeps the durable queue but stops vault and server writes.").addToggle((toggle) => toggle.setValue(this.plugin.settings.paused).onChange(async (value) => { this.plugin.settings.paused = value; await this.plugin.saveSettings(); }));
    new Setting(this.containerEl).setName("Folder to watch").setDesc("Used unless entire-vault synchronization is explicitly enabled.").addText((input) => input.setValue(this.plugin.settings.includeFolder).onChange(async (value) => { this.plugin.settings.includeFolder = normalizePath(value.trim()); await this.plugin.saveSettings(); }));
    new Setting(this.containerEl).setName("Synchronize the entire vault").setDesc("Opt-in. Only Markdown files are synchronized; the backup folder is always excluded.").addToggle((toggle) => toggle.setValue(this.plugin.settings.syncEntireVault).onChange(async (value) => { this.plugin.settings.syncEntireVault = value; await this.plugin.saveSettings(); }));
    new Setting(this.containerEl).setName("Backup folder").setDesc("Continuum writes recovery copies here before remote overwrites, moves, or deletions.").addText((input) => input.setValue(this.plugin.settings.backupFolder).onChange(async (value) => { this.plugin.settings.backupFolder = normalizePath(value.trim()); await this.plugin.saveSettings(); }));
    new Setting(this.containerEl).setName("Remote deletion behavior").setDesc("Archive is safer; Delete moves the note through Obsidian's configured deletion behavior after backing it up.").addDropdown((dropdown) => dropdown.addOption("archive", "Archive locally").addOption("delete", "Delete locally").setValue(this.plugin.settings.deletionBehavior).onChange(async (value) => { this.plugin.settings.deletionBehavior = value as "archive" | "delete"; await this.plugin.saveSettings(); }));
    new Setting(this.containerEl).setName("Sync interval").setDesc("Automatic retry interval, from 10 to 300 seconds.").addText((input) => input.setValue(String(this.plugin.settings.intervalSeconds)).onChange(async (value) => { this.plugin.settings.intervalSeconds = Math.max(10, Math.min(300, Number(value) || 30)); await this.plugin.saveSettings(); }));
    this.containerEl.createEl("h3", { text: "Content types and destination folders" });
    for (const recordType of synchronizedRecordTypes) {
      new Setting(this.containerEl)
        .setName(recordType.replaceAll("_", " "))
        .setDesc("Enable this type and choose its destination folder.")
        .addToggle((toggle) => toggle.setValue(this.plugin.settings.enabledTypes.includes(recordType)).onChange(async (enabled) => {
          this.plugin.settings.enabledTypes = enabled
            ? [...new Set([...this.plugin.settings.enabledTypes, recordType])]
            : this.plugin.settings.enabledTypes.filter((value) => value !== recordType);
          await this.plugin.saveSettings();
        }))
        .addText((input) => input.setValue(this.plugin.settings.folderByType[recordType] ?? "").onChange(async (value) => {
          this.plugin.settings.folderByType[recordType] = normalizePath(value.trim());
          await this.plugin.saveSettings();
        }));
    }
    const blocked = this.plugin.settings.queue.filter((entry) => entry.state === "conflict").length;
    new Setting(this.containerEl).setName("Synchronize now").setDesc(`${this.plugin.settings.queue.length} queued; ${blocked} blocked. ${this.plugin.settings.lastSync ? `Last success: ${new Date(this.plugin.settings.lastSync).toLocaleString()}.` : "No successful sync yet."}`).addButton((button) => button.setButtonText("Sync now").setCta().onClick(() => void this.plugin.syncNow(true)));
    if (this.plugin.settings.lastError) this.containerEl.createEl("p", { text: `Needs attention: ${this.plugin.settings.lastError}`, cls: "mod-warning" });
  }
}
