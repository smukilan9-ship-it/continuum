import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getDatabase, sql, syncConflicts, syncOperations, syncRecords, syncVersions } from "@continuum/db";
import {
  normalizeVaultPath,
  syncBackoffMilliseconds,
  synchronizedRecordTypes,
  type SyncDeletionState,
  type SynchronizedRecordType,
} from "@continuum/domain";

export type BridgeOperation = {
  operationId: string;
  idempotencyKey: string;
  operationType: "create" | "update" | "rename" | "move" | "delete";
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

function id(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function ownerFingerprint(userId: string) {
  return `owner_${digest(`continuum-sync:${userId}`).slice(0, 20)}`;
}

function row<T extends Record<string, unknown>>(result: Awaited<ReturnType<ReturnType<typeof getDatabase>["execute"]>>) {
  return result.rows[0] as T | undefined;
}

function recordFromRow(value: Record<string, unknown>) {
  return {
    id: String(value.id),
    userId: String(value.user_id),
    syncId: String(value.sync_id),
    recordId: String(value.record_id),
    recordType: String(value.record_type) as SynchronizedRecordType,
    schemaVersion: Number(value.schema_version),
    ownerFingerprint: String(value.owner_fingerprint),
    title: String(value.title),
    path: String(value.path),
    content: String(value.content),
    baseContent: String(value.base_content),
    contentHash: String(value.content_hash),
    baseHash: String(value.base_hash),
    localRevision: Number(value.local_revision),
    serverRevision: Number(value.server_revision),
    commonBaseRevision: Number(value.common_base_revision),
    origin: String(value.origin),
    deletionState: String(value.deletion_state) as SyncDeletionState,
    metadata: (value.metadata ?? {}) as Record<string, unknown>,
    createdAt: new Date(String(value.created_at)),
    updatedAt: new Date(String(value.updated_at)),
  };
}

async function getRecord(userId: string, syncId: string) {
  const result = await getDatabase().execute(sql`select * from sync_records where user_id = ${userId} and sync_id = ${syncId} limit 1`);
  return result.rows[0] ? recordFromRow(result.rows[0] as Record<string, unknown>) : undefined;
}

async function operationDelivered(idempotencyKey: string) {
  const result = await getDatabase().execute(sql`select id, status from sync_operations where idempotency_key = ${idempotencyKey} limit 1`);
  return row<{ id: string; status: string }>(result);
}

function validateBridgeOperation(operation: BridgeOperation) {
  if (!/^[A-Za-z0-9_-]{3,200}$/.test(operation.operationId)) throw new Error("Malformed operation ID.");
  if (!/^[A-Za-z0-9:_-]{8,300}$/.test(operation.idempotencyKey)) throw new Error("Malformed idempotency key.");
  if (!synchronizedRecordTypes.includes(operation.recordType)) throw new Error("Unsupported synchronized record type.");
  if (!Number.isSafeInteger(operation.schemaVersion) || operation.schemaVersion < 1 || operation.schemaVersion > 10) throw new Error("Unsupported schema version.");
  if (!Number.isSafeInteger(operation.localRevision) || operation.localRevision < 0) throw new Error("Invalid local revision.");
  if (!Number.isSafeInteger(operation.knownServerRevision) || operation.knownServerRevision < 0) throw new Error("Invalid server revision.");
  if (!Number.isSafeInteger(operation.commonBaseRevision) || operation.commonBaseRevision < 0) throw new Error("Invalid common-base revision.");
  if (operation.content.length > 2 * 1024 * 1024) throw new Error("Synchronized Markdown is limited to 2 MB.");
  const actualHash = digest(operation.content);
  if (operation.contentHash !== actualHash) throw new Error("Content hash mismatch.");
  return normalizeVaultPath(operation.path);
}

async function saveVersion(input: {
  userId: string;
  syncId: string;
  revision: number;
  side: "obsidian" | "continuum" | "base";
  content: string;
  contentHash: string;
  path: string;
  title: string;
  deletionState: SyncDeletionState;
}) {
  await getDatabase().insert(syncVersions).values({ id: id("sync_version"), ...input }).onConflictDoNothing();
}

async function conflictFor(userId: string, syncId: string) {
  const result = await getDatabase().execute(sql`select id from sync_conflicts where user_id = ${userId} and sync_id = ${syncId} and status = 'open' limit 1`);
  return row<{ id: string }>(result);
}

export async function applyBridgeBatch(userId: string, operations: BridgeOperation[]) {
  const acknowledgements: Array<Record<string, unknown>> = [];
  for (const operation of operations.slice(0, 100)) {
    try {
      const path = validateBridgeOperation(operation);
      const duplicate = await operationDelivered(`${userId}:${operation.idempotencyKey}`);
      if (duplicate?.status === "completed") {
        acknowledgements.push({ operationId: operation.operationId, status: "duplicate_ignored" });
        continue;
      }
      const syncId = operation.syncId && /^[A-Za-z0-9_-]{8,200}$/.test(operation.syncId) ? operation.syncId : id("sync");
      const existing = await getRecord(userId, syncId);
      if (existing && await conflictFor(userId, syncId)) {
        acknowledgements.push({ operationId: operation.operationId, syncId, status: "conflict", error: "Resolve the open conflict before synchronizing this note." });
        continue;
      }
      const operationRowId = id("sync_operation");
      await getDatabase().insert(syncOperations).values({
        id: operationRowId,
        userId,
        syncId,
        direction: "obsidian_to_continuum",
        operationType: operation.operationType,
        idempotencyKey: `${userId}:${operation.idempotencyKey}`,
        payload: operation as unknown as Record<string, unknown>,
        status: "processing",
        attemptCount: 1,
      }).onConflictDoNothing();

      if (!existing) {
        const revision = Math.max(1, operation.localRevision);
        const now = new Date();
        const recordId = operation.recordId && /^[A-Za-z0-9_-]{3,200}$/.test(operation.recordId) ? operation.recordId : id("workspace_note");
        await getDatabase().insert(syncRecords).values({
          id: id("sync_record"),
          userId,
          syncId,
          recordId,
          recordType: operation.recordType,
          schemaVersion: operation.schemaVersion,
          ownerFingerprint: ownerFingerprint(userId),
          title: operation.title.slice(0, 300),
          path,
          content: operation.content,
          baseContent: operation.content,
          contentHash: operation.contentHash,
          baseHash: operation.contentHash,
          localRevision: revision,
          serverRevision: 1,
          commonBaseRevision: 1,
          origin: "obsidian",
          deletionState: operation.deletionState,
          lastSyncedAt: now,
          metadata: { ...(operation.metadata ?? {}), basePath: path, baseTitle: operation.title.slice(0, 300) },
        });
        await Promise.all([
          saveVersion({ userId, syncId, revision: 1, side: "obsidian", content: operation.content, contentHash: operation.contentHash, path, title: operation.title.slice(0, 300), deletionState: operation.deletionState }),
          getDatabase().execute(sql`update sync_operations set status = 'completed', completed_at = now(), bridge_acknowledged_at = now(), updated_at = now() where id = ${operationRowId}`),
        ]);
        acknowledgements.push({ operationId: operation.operationId, syncId, recordId, status: "applied", serverRevision: 1, commonBaseRevision: 1, ownerFingerprint: ownerFingerprint(userId) });
        continue;
      }

      const basePath = typeof existing.metadata.basePath === "string" ? existing.metadata.basePath : existing.path;
      const baseTitle = typeof existing.metadata.baseTitle === "string" ? existing.metadata.baseTitle : existing.title;
      const localChanged = operation.contentHash !== existing.baseHash
        || path !== basePath
        || operation.title !== baseTitle
        || operation.deletionState !== existing.deletionState;
      const serverChanged = existing.contentHash !== existing.baseHash
        || existing.path !== basePath
        || existing.title !== baseTitle
        || existing.serverRevision !== operation.knownServerRevision
        || existing.commonBaseRevision !== operation.commonBaseRevision;
      if (localChanged && serverChanged) {
        const conflictId = id("sync_conflict");
        await getDatabase().insert(syncConflicts).values({
          id: conflictId,
          userId,
          syncId,
          baseRevision: existing.commonBaseRevision,
          serverRevision: existing.serverRevision,
          localRevision: operation.localRevision,
          baseContent: existing.baseContent,
          serverContent: existing.content,
          localContent: operation.content,
          serverPath: existing.path,
          localPath: path,
        });
        await Promise.all([
          saveVersion({ userId, syncId, revision: operation.localRevision, side: "obsidian", content: operation.content, contentHash: operation.contentHash, path, title: operation.title.slice(0, 300), deletionState: operation.deletionState }),
          getDatabase().execute(sql`update sync_records set blocked_at = now(), updated_at = now(), version = version + 1 where user_id = ${userId} and sync_id = ${syncId}`),
          getDatabase().execute(sql`update sync_operations set status = 'conflict', latest_error = 'Both sides changed from the common base', updated_at = now() where id = ${operationRowId}`),
        ]);
        acknowledgements.push({ operationId: operation.operationId, syncId, status: "conflict", conflictId });
        continue;
      }

      const nextServerRevision = existing.serverRevision + 1;
      await Promise.all([
        saveVersion({ userId, syncId, revision: nextServerRevision, side: "obsidian", content: operation.content, contentHash: operation.contentHash, path, title: operation.title.slice(0, 300), deletionState: operation.deletionState }),
        getDatabase().execute(sql`
          update sync_records set
            title = ${operation.title.slice(0, 300)},
            path = ${path},
            content = ${operation.content},
            base_content = ${operation.content},
            content_hash = ${operation.contentHash},
            base_hash = ${operation.contentHash},
            local_revision = ${operation.localRevision},
            server_revision = ${nextServerRevision},
            common_base_revision = ${nextServerRevision},
            origin = 'obsidian',
            deletion_state = ${operation.deletionState},
            last_synced_at = now(),
            blocked_at = null,
            metadata = ${JSON.stringify({ ...existing.metadata, ...(operation.metadata ?? {}), basePath: path, baseTitle: operation.title.slice(0, 300) })}::jsonb,
            updated_at = now(),
            version = version + 1
          where user_id = ${userId} and sync_id = ${syncId}
        `),
        getDatabase().execute(sql`update sync_operations set status = 'completed', completed_at = now(), bridge_acknowledged_at = now(), updated_at = now() where id = ${operationRowId}`),
      ]);
      acknowledgements.push({ operationId: operation.operationId, syncId, recordId: existing.recordId, status: "applied", serverRevision: nextServerRevision, commonBaseRevision: nextServerRevision, ownerFingerprint: existing.ownerFingerprint });
    } catch (error) {
      acknowledgements.push({ operationId: operation.operationId, status: "error", error: error instanceof Error ? error.message : "Operation failed" });
    }
  }
  return acknowledgements;
}

export async function enqueueContinuumRecord(input: {
  userId: string;
  recordId: string;
  recordType: SynchronizedRecordType;
  title: string;
  path: string;
  content: string;
  deletionState?: SyncDeletionState;
  metadata?: Record<string, unknown>;
  idempotencyKey: string;
}) {
  const requestedPath = normalizeVaultPath(input.path);
  const contentHash = digest(input.content);
  const existingResult = await getDatabase().execute(sql`select * from sync_records where user_id = ${input.userId} and record_id = ${input.recordId} limit 1`);
  const existing = existingResult.rows[0] ? recordFromRow(existingResult.rows[0] as Record<string, unknown>) : undefined;
  const path = input.deletionState === "tombstone" && existing ? existing.path : requestedPath;
  if (existing && existing.contentHash === contentHash && existing.path === path && existing.title === input.title && existing.deletionState === (input.deletionState ?? "active")) {
    return { syncId: existing.syncId, operationId: undefined, status: "unchanged" as const };
  }
  const syncId = existing?.syncId ?? id("sync");
  const serverRevision = (existing?.serverRevision ?? 0) + 1;
  const operationType = !existing ? "create" : input.deletionState === "tombstone" ? "delete" : existing.path !== path ? "move" : existing.title !== input.title ? "rename" : "update";
  const now = new Date();
  const record = {
    syncId,
    recordId: input.recordId,
    recordType: input.recordType,
    schemaVersion: 1,
    ownerFingerprint: ownerFingerprint(input.userId),
    title: input.title.slice(0, 300),
    path,
    content: input.content,
    contentHash,
    localRevision: existing?.localRevision ?? 0,
    serverRevision,
    commonBaseRevision: existing?.commonBaseRevision ?? 0,
    origin: "continuum" as const,
    deletionState: input.deletionState ?? "active",
    createdAt: (existing?.createdAt ?? now).toISOString(),
    updatedAt: now.toISOString(),
    lastSyncedAt: existing?.updatedAt.toISOString(),
    metadata: input.metadata ?? {},
  };
  if (!existing) {
    await getDatabase().insert(syncRecords).values({
      id: id("sync_record"),
      userId: input.userId,
      syncId,
      recordId: input.recordId,
      recordType: input.recordType,
      ownerFingerprint: record.ownerFingerprint,
      title: record.title,
      path,
      content: input.content,
      baseContent: "",
      contentHash,
      baseHash: digest(""),
      serverRevision,
      commonBaseRevision: 0,
      origin: "continuum",
      deletionState: record.deletionState,
      metadata: { ...(input.metadata ?? {}), basePath: "", baseTitle: "" },
    });
  } else {
    await getDatabase().execute(sql`
      update sync_records set title = ${record.title}, path = ${path}, content = ${input.content},
        content_hash = ${contentHash}, server_revision = ${serverRevision}, origin = 'continuum',
        deletion_state = ${record.deletionState}, updated_at = now(), version = version + 1,
        metadata = ${JSON.stringify({ ...existing.metadata, ...(input.metadata ?? {}) })}::jsonb
      where user_id = ${input.userId} and sync_id = ${syncId}
    `);
  }
  await saveVersion({ userId: input.userId, syncId, revision: serverRevision, side: "continuum", content: input.content, contentHash, path, title: record.title, deletionState: record.deletionState });
  const operationId = id("sync_operation");
  await getDatabase().insert(syncOperations).values({
    id: operationId,
    userId: input.userId,
    syncId,
    direction: "continuum_to_obsidian",
    operationType,
    idempotencyKey: `${input.userId}:${input.idempotencyKey}:${serverRevision}`,
    payload: record as unknown as Record<string, unknown>,
  }).onConflictDoNothing();
  return { syncId, operationId, status: "pending" as const };
}

export async function pendingBridgeOperations(userId: string, limit = 100) {
  const setting = await getDatabase().execute(sql`select paused from sync_settings where user_id = ${userId} limit 1`);
  if (setting.rows[0]?.paused) return [];
  const result = await getDatabase().execute(sql`
    select id, sync_id, direction, operation_type, payload_version, idempotency_key, payload,
      status, attempt_count, latest_error, next_retry_at, created_at
    from sync_operations
    where user_id = ${userId}
      and direction = 'continuum_to_obsidian'
      and (
        status in ('pending', 'retry')
        or (status = 'syncing' and updated_at < now() - interval '5 minutes')
      )
      and next_retry_at <= now()
    order by created_at asc
    limit ${Math.max(1, Math.min(100, limit))}
  `);
  for (const operation of result.rows) {
    await getDatabase().execute(sql`update sync_operations set status = 'syncing', attempt_count = attempt_count + 1, updated_at = now() where id = ${String(operation.id)}`);
  }
  return result.rows.map((operation) => ({
    id: operation.id,
    syncId: operation.sync_id,
    direction: operation.direction,
    operationType: operation.operation_type,
    payloadVersion: operation.payload_version,
    idempotencyKey: operation.idempotency_key,
    payload: operation.payload,
    attemptCount: Number(operation.attempt_count) + 1,
    createdAt: operation.created_at,
  }));
}

export async function acknowledgeBridgeOperations(userId: string, acknowledgements: Array<{ operationId: string; status: "completed" | "retry" | "conflict"; error?: string; localRevision?: number }>) {
  const results: Array<{ operationId: string; status: string }> = [];
  for (const acknowledgement of acknowledgements.slice(0, 100)) {
    const currentResult = await getDatabase().execute(sql`select * from sync_operations where id = ${acknowledgement.operationId} and user_id = ${userId} limit 1`);
    const operation = currentResult.rows[0] as Record<string, unknown> | undefined;
    if (!operation) continue;
    if (acknowledgement.status === "completed") {
      await getDatabase().execute(sql`
        update sync_operations set status = 'completed', completed_at = now(), bridge_acknowledged_at = now(),
          latest_error = null, updated_at = now() where id = ${acknowledgement.operationId} and user_id = ${userId}
      `);
      await getDatabase().execute(sql`
        update sync_records set
          base_content = content, base_hash = content_hash, common_base_revision = server_revision,
          local_revision = greatest(local_revision, ${acknowledgement.localRevision ?? 0}),
          last_synced_at = now(), blocked_at = null,
          metadata = jsonb_set(jsonb_set(metadata, '{basePath}', to_jsonb(path)), '{baseTitle}', to_jsonb(title)),
          updated_at = now(), version = version + 1
        where user_id = ${userId} and sync_id = ${String(operation.sync_id)}
      `);
    } else if (acknowledgement.status === "retry") {
      const attempt = Number(operation.attempt_count ?? 1);
      const next = new Date(Date.now() + syncBackoffMilliseconds(attempt));
      await getDatabase().execute(sql`
        update sync_operations set status = 'retry', latest_error = ${acknowledgement.error?.slice(0, 1_000) ?? "Bridge write failed"},
          next_retry_at = ${next}, updated_at = now() where id = ${acknowledgement.operationId} and user_id = ${userId}
      `);
    } else {
      await getDatabase().execute(sql`update sync_operations set status = 'conflict', latest_error = ${acknowledgement.error?.slice(0, 1_000) ?? "Bridge reported a conflict"}, updated_at = now() where id = ${acknowledgement.operationId} and user_id = ${userId}`);
      await getDatabase().execute(sql`update sync_records set blocked_at = now(), updated_at = now() where user_id = ${userId} and sync_id = ${String(operation.sync_id)}`);
    }
    results.push({ operationId: acknowledgement.operationId, status: acknowledgement.status });
  }
  return results;
}

export async function syncDashboard(userId: string) {
  const [records, operations, conflicts, settings] = await Promise.all([
    getDatabase().execute(sql`select sync_id, record_id, record_type, title, path, local_revision, server_revision, common_base_revision, origin, deletion_state, last_synced_at, blocked_at, updated_at from sync_records where user_id = ${userId} order by updated_at desc limit 200`),
    getDatabase().execute(sql`select id, sync_id, direction, operation_type, status, attempt_count, latest_error, next_retry_at, completed_at, bridge_acknowledged_at, created_at, updated_at from sync_operations where user_id = ${userId} order by created_at desc limit 300`),
    getDatabase().execute(sql`select id, sync_id, base_revision, server_revision, local_revision, base_content, server_content, local_content, server_path, local_path, status, resolution, resolved_content, resolved_at, created_at from sync_conflicts where user_id = ${userId} order by created_at desc limit 100`),
    getDatabase().execute(sql`select paused, paused_at from sync_settings where user_id = ${userId} limit 1`),
  ]);
  return {
    paused: Boolean(settings.rows[0]?.paused),
    pausedAt: settings.rows[0]?.paused_at,
    records: records.rows,
    operations: operations.rows,
    conflicts: conflicts.rows,
  };
}

export async function setObsidianSyncPaused(userId: string, paused: boolean) {
  await getDatabase().execute(sql`
    insert into sync_settings (user_id, paused, paused_at, updated_at)
    values (${userId}, ${paused}, ${paused ? new Date() : null}, now())
    on conflict (user_id) do update set
      paused = excluded.paused,
      paused_at = excluded.paused_at,
      updated_at = now()
  `);
  return { paused };
}

export async function retryObsidianSync(userId: string, operationId?: string) {
  const result = operationId
    ? await getDatabase().execute(sql`
      update sync_operations set status = 'retry', next_retry_at = now(), latest_error = null, updated_at = now()
      where user_id = ${userId} and id = ${operationId} and status in ('retry', 'syncing', 'error')
      returning id
    `)
    : await getDatabase().execute(sql`
      update sync_operations set status = 'retry', next_retry_at = now(), latest_error = null, updated_at = now()
      where user_id = ${userId} and status in ('retry', 'syncing', 'error')
      returning id
    `);
  return { retried: result.rows.map((value) => String(value.id)) };
}

export async function prepareObsidianAccountDeletion(userId: string) {
  const records = await getDatabase().execute(sql`
    select * from sync_records
    where user_id = ${userId} and deletion_state <> 'tombstone'
    order by created_at asc
  `);
  for (const value of records.rows) {
    const record = recordFromRow(value as Record<string, unknown>);
    await enqueueContinuumRecord({
      userId,
      recordId: record.recordId,
      recordType: record.recordType,
      title: record.title,
      path: record.path,
      content: "",
      deletionState: "tombstone",
      metadata: { ...record.metadata, forceDelete: true, reason: "account_deletion" },
      idempotencyKey: `account-delete:${record.recordId}`,
    });
  }
  const pending = await getDatabase().execute(sql`
    select count(*)::integer as count
    from sync_records r
    where r.user_id = ${userId}
      and (
        r.deletion_state <> 'tombstone'
        or not exists (
          select 1 from sync_operations o
          where o.user_id = ${userId}
            and o.sync_id = r.sync_id
            and o.operation_type = 'delete'
            and o.status = 'completed'
            and o.bridge_acknowledged_at is not null
            and (o.payload->>'serverRevision')::integer = r.server_revision
        )
      )
  `);
  return { pending: Number(pending.rows[0]?.count ?? 0), queued: records.rows.length };
}

export type RecordSyncStatus = {
  syncId: string;
  operationId?: string;
  status: "pending" | "syncing" | "retry" | "conflict" | "synced";
  error?: string;
  acknowledgedAt?: string;
};

export async function assistantMemorySyncStatuses(userId: string) {
  const result = await getDatabase().execute(sql`
    select r.record_id, r.sync_id, r.blocked_at,
      o.id as operation_id, o.status as operation_status, o.latest_error,
      o.bridge_acknowledged_at
    from sync_records r
    left join lateral (
      select id, status, latest_error, bridge_acknowledged_at
      from sync_operations
      where user_id = ${userId} and sync_id = r.sync_id and direction = 'continuum_to_obsidian'
      order by created_at desc
      limit 1
    ) o on true
    where r.user_id = ${userId} and r.record_type = 'assistant_memory'
  `);
  return Object.fromEntries(result.rows.map((value) => {
    const row = value as Record<string, unknown>;
    const operationStatus = String(row.operation_status ?? "pending");
    const status: RecordSyncStatus["status"] = row.blocked_at || operationStatus === "conflict"
      ? "conflict"
      : operationStatus === "completed" && row.bridge_acknowledged_at
        ? "synced"
        : operationStatus === "retry"
          ? "retry"
          : operationStatus === "syncing"
            ? "syncing"
            : "pending";
    return [String(row.record_id), {
      syncId: String(row.sync_id),
      operationId: row.operation_id ? String(row.operation_id) : undefined,
      status,
      error: row.latest_error ? String(row.latest_error) : undefined,
      acknowledgedAt: row.bridge_acknowledged_at instanceof Date
        ? row.bridge_acknowledged_at.toISOString()
        : row.bridge_acknowledged_at ? String(row.bridge_acknowledged_at) : undefined,
    } satisfies RecordSyncStatus];
  }));
}

export async function resolveSyncConflict(input: { userId: string; conflictId: string; resolution: "use_continuum" | "use_obsidian" | "manual_merge" | "duplicate_both" | "postpone"; mergedContent?: string }) {
  const result = await getDatabase().execute(sql`select * from sync_conflicts where id = ${input.conflictId} and user_id = ${input.userId} and status = 'open' limit 1`);
  const conflict = result.rows[0] as Record<string, unknown> | undefined;
  if (!conflict) throw new Error("Conflict not found.");
  if (input.resolution === "postpone") return { postponed: true };
  const record = await getRecord(input.userId, String(conflict.sync_id));
  if (!record) throw new Error("Synchronized record not found.");
  const chosen = input.resolution === "use_obsidian"
    ? String(conflict.local_content)
    : input.resolution === "manual_merge"
      ? input.mergedContent?.trim()
      : String(conflict.server_content);
  if (!chosen) throw new Error("Merged content is required.");
  const serverPath = String(conflict.server_path || record.path);
  const localPath = String(conflict.local_path || record.path);
  const targets = input.resolution === "duplicate_both"
    ? [
        { recordId: record.recordId, content: String(conflict.server_content), title: `${record.title} (Continuum)`, path: serverPath },
        { recordId: id("workspace_note"), content: String(conflict.local_content), title: `${record.title} (Obsidian)`, path: localPath },
      ]
    : [{
        recordId: record.recordId,
        content: chosen,
        title: record.title,
        path: input.resolution === "use_obsidian" ? localPath : serverPath,
      }];
  const queued = [];
  for (const target of targets) {
    queued.push(await enqueueContinuumRecord({
      userId: input.userId,
      recordId: target.recordId,
      recordType: record.recordType,
      title: target.title,
      path: input.resolution === "duplicate_both"
        ? target.path.replace(/\.md$/i, `-${digest(target.recordId).slice(0, 6)}.md`)
        : target.path,
      content: target.content,
      metadata: { conflictResolution: input.resolution, conflictId: input.conflictId },
      idempotencyKey: `resolve:${input.conflictId}:${target.recordId}`,
    }));
  }
  await getDatabase().execute(sql`update sync_conflicts set status = 'resolved', resolution = ${input.resolution}, resolved_content = ${chosen}, resolved_at = now(), updated_at = now() where id = ${input.conflictId} and user_id = ${input.userId}`);
  await getDatabase().execute(sql`update sync_records set blocked_at = null, updated_at = now() where user_id = ${input.userId} and sync_id = ${String(conflict.sync_id)}`);
  return { resolved: true, queued };
}
