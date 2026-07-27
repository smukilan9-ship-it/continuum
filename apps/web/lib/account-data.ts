import "server-only";

import { getDatabase, sql } from "@continuum/db";

async function rows(query: ReturnType<typeof sql>) {
  const result = await getDatabase().execute(query);
  return result.rows as Array<Record<string, unknown>>;
}

export async function accountExportData(userId: string) {
  const [
    account,
    planning,
    learning,
    research,
    memory,
    assistant,
    questionBanks,
    codeAndAudit,
    integrations,
    sync,
  ] = await Promise.all([
    Promise.all([
      rows(sql`select id, email, email_verified_at, created_at, updated_at from users where id = ${userId}`),
      rows(sql`select display_name, timezone, education_level, preferences, created_at, updated_at from profiles where user_id = ${userId} and deleted = false`),
      rows(sql`select id, created_at, last_seen_at, authenticated_at, expires_at, revoked_at from app_sessions where user_id = ${userId}`),
    ]),
    Promise.all([
      rows(sql`select * from goals where user_id = ${userId}`),
      rows(sql`select m.* from milestones m join goals g on g.id = m.goal_id where g.user_id = ${userId}`),
      rows(sql`select t.* from tasks t join goals g on g.id = t.goal_id where g.user_id = ${userId}`),
      rows(sql`select s.* from schedule_blocks s join tasks t on t.id = s.task_id join goals g on g.id = t.goal_id where g.user_id = ${userId}`),
      rows(sql`select * from calendar_constraints where user_id = ${userId}`),
    ]),
    Promise.all([
      rows(sql`select * from learning_states where user_id = ${userId}`),
      rows(sql`select * from assessment_attempts where user_id = ${userId}`),
      rows(sql`select * from misconceptions where user_id = ${userId}`),
      rows(sql`select * from resource_activities where user_id = ${userId}`),
    ]),
    Promise.all([
      rows(sql`select * from projects where user_id = ${userId}`),
      rows(sql`select d.* from project_decisions d join projects p on p.id = d.project_id where p.user_id = ${userId}`),
      rows(sql`select n.* from research_notes n join projects p on p.id = n.project_id where p.user_id = ${userId}`),
      rows(sql`select c.* from research_claims c join projects p on p.id = c.project_id where p.user_id = ${userId}`),
      rows(sql`select e.* from claim_evidence e join research_claims c on c.id = e.claim_id join projects p on p.id = c.project_id where p.user_id = ${userId}`),
      rows(sql`select * from sources where user_id = ${userId}`),
      rows(sql`select c.* from source_chunks c join sources s on s.id = c.source_id where s.user_id = ${userId}`),
      rows(sql`select p.* from papers p join projects r on r.id = p.project_id where r.user_id = ${userId}`),
      rows(sql`select * from saved_external_entities where user_id = ${userId}`),
      rows(sql`select library_type, library_id, item_key, item_type, title, doi, remote_version, collection_keys, tags, metadata, attachments, retrieved_at, deleted from zotero_items where user_id = ${userId}`),
      rows(sql`select library_type, library_id, collection_key, parent_collection_key, name, remote_version, item_count, deleted from zotero_collections where user_id = ${userId}`),
    ]),
    Promise.all([
      rows(sql`select * from memory_events where user_id = ${userId}`),
      rows(sql`select * from memory_records where user_id = ${userId}`),
      rows(sql`select * from memory_chunks where user_id = ${userId}`),
      rows(sql`select * from session_receipts where user_id = ${userId}`),
    ]),
    Promise.all([
      rows(sql`select * from assistant_sessions where user_id = ${userId}`),
      rows(sql`select id, session_id, role, content, provider, model, created_at, updated_at from assistant_messages where user_id = ${userId}`),
    ]),
    Promise.all([
      rows(sql`select * from question_banks where user_id = ${userId}`),
      rows(sql`select * from question_bank_attempts where user_id = ${userId}`),
      rows(sql`select id, content_hash, source_id, status, structure, asset_paths, injection_detected, created_at, updated_at from image_extractions where user_id = ${userId}`),
    ]),
    Promise.all([
      rows(sql`select id, name, state, created_at, updated_at from code_workspaces where user_id = ${userId}`),
      rows(sql`select id, task_class, provider, model, reason, verification_status, fallback_used, created_at from model_routes where user_id = ${userId}`),
      rows(sql`select feature, input_tokens, output_tokens, cost_class, estimated_cost_usd, occurred_at from model_usage where user_id = ${userId}`),
      rows(sql`select action, entity_ids, change_summary, metadata, occurred_at from audit_log where user_id = ${userId}`),
    ]),
    Promise.all([
      rows(sql`select provider, scopes, created_at, updated_at, revoked_at, deleted from integrations where user_id = ${userId}`),
      rows(sql`select provider, name, scopes, last_used_at, expires_at, revoked_at, created_at from integration_tokens where user_id = ${userId}`),
      rows(sql`select client_id, client_name, scopes, connected_at, last_authorized_at, revoked_at from oauth_connections where user_id = ${userId}`),
      rows(sql`select library_type, library_id, name, permissions, library_version, last_sync_at, last_error, stats from zotero_libraries where user_id = ${userId}`),
    ]),
    Promise.all([
      rows(sql`select sync_id, record_id, record_type, schema_version, owner_fingerprint, title, path, content, content_hash, local_revision, server_revision, common_base_revision, origin, deletion_state, last_synced_at, metadata, created_at, updated_at from sync_records where user_id = ${userId}`),
      rows(sql`select sync_id, revision, side, content, content_hash, path, title, deletion_state, created_at from sync_versions where user_id = ${userId}`),
      rows(sql`select id, sync_id, direction, operation_type, payload_version, status, attempt_count, latest_error, next_retry_at, completed_at, bridge_acknowledged_at, created_at from sync_operations where user_id = ${userId}`),
      rows(sql`select id, sync_id, base_revision, server_revision, local_revision, base_content, server_content, local_content, server_path, local_path, status, resolution, resolved_content, resolved_at, created_at from sync_conflicts where user_id = ${userId}`),
    ]),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    formatVersion: 1,
    securityNotice: "Secrets, password material, token hashes, credential ciphertext, raw session identifiers, and internal leases are excluded.",
    account: { user: account[0], profile: account[1], sessions: account[2] },
    planning: { goals: planning[0], milestones: planning[1], tasks: planning[2], scheduleBlocks: planning[3], calendarConstraints: planning[4] },
    learning: { mastery: learning[0], assessmentAttempts: learning[1], misconceptions: learning[2], resourceActivities: learning[3] },
    research: { projects: research[0], decisions: research[1], notes: research[2], claims: research[3], claimEvidence: research[4], sources: research[5], sourceChunks: research[6], papers: research[7], savedOpenAlexEntities: research[8], zoteroItems: research[9], zoteroCollections: research[10] },
    memory: { events: memory[0], records: memory[1], chunks: memory[2], sessionReceipts: memory[3] },
    assistant: { sessions: assistant[0], messages: assistant[1] },
    questionBanks: { banks: questionBanks[0], attempts: questionBanks[1], imageExtractions: questionBanks[2] },
    codeAndAudit: { workspaces: codeAndAudit[0], modelRoutes: codeAndAudit[1], modelUsage: codeAndAudit[2], audit: codeAndAudit[3] },
    integrations: { connections: integrations[0], localTokens: integrations[1], assistantConnections: integrations[2], zoteroLibraries: integrations[3] },
    obsidianSync: { records: sync[0], history: sync[1], operations: sync[2], conflicts: sync[3] },
  };
}

export async function accountPrivateFiles(userId: string) {
  const [sourceFiles, artifactFiles, imageFiles] = await Promise.all([
    rows(sql`select storage_path from sources where user_id = ${userId} and storage_path is not null`),
    rows(sql`select a.storage_path from artifacts a join projects p on p.id = a.project_id where p.user_id = ${userId} and a.storage_path is not null`),
    rows(sql`select unnest(asset_paths) as storage_path from image_extractions where user_id = ${userId}`),
  ]);
  return [...sourceFiles, ...artifactFiles, ...imageFiles]
    .map((row) => typeof row.storage_path === "string" ? row.storage_path : undefined)
    .filter((path): path is string => Boolean(path));
}

export async function deleteAccountData(userId: string) {
  const db = getDatabase();
  await db.transaction(async (tx) => {
    await tx.execute(sql`update users set deletion_requested_at = now() where id = ${userId}`);
    await tx.execute(sql`delete from model_usage where user_id = ${userId}`);
    await tx.execute(sql`delete from model_routes where user_id = ${userId}`);
    await tx.execute(sql`delete from ai_request_leases where user_id = ${userId}`);
    await tx.execute(sql`delete from oauth_tokens where user_id = ${userId}`);
    await tx.execute(sql`delete from oauth_grants where user_id = ${userId}`);
    await tx.execute(sql`delete from oauth_connections where user_id = ${userId}`);
    await tx.execute(sql`delete from integration_tokens where user_id = ${userId}`);
    await tx.execute(sql`delete from integrations where user_id = ${userId}`);
    await tx.execute(sql`delete from context_access_log where user_id = ${userId}`);
    await tx.execute(sql`delete from memory_proposals where user_id = ${userId}`);
    await tx.execute(sql`delete from audit_log where user_id = ${userId}`);
    await tx.execute(sql`delete from code_workspaces where user_id = ${userId}`);

    await tx.execute(sql`delete from sync_conflicts where user_id = ${userId}`);
    await tx.execute(sql`delete from sync_operations where user_id = ${userId}`);
    await tx.execute(sql`delete from sync_versions where user_id = ${userId}`);
    await tx.execute(sql`delete from sync_records where user_id = ${userId}`);
    await tx.execute(sql`delete from synced_documents where user_id = ${userId}`);
    await tx.execute(sql`delete from sync_settings where user_id = ${userId}`);

    await tx.execute(sql`delete from zotero_items where user_id = ${userId}`);
    await tx.execute(sql`delete from zotero_collections where user_id = ${userId}`);
    await tx.execute(sql`delete from zotero_libraries where user_id = ${userId}`);
    await tx.execute(sql`delete from saved_external_entities where user_id = ${userId}`);
    await tx.execute(sql`delete from image_extractions where user_id = ${userId}`);

    await tx.execute(sql`delete from assistant_messages where user_id = ${userId}`);
    await tx.execute(sql`delete from assistant_sessions where user_id = ${userId}`);
    await tx.execute(sql`delete from question_bank_attempts where user_id = ${userId}`);
    await tx.execute(sql`delete from question_banks where user_id = ${userId}`);

    await tx.execute(sql`delete from claim_evidence where claim_id in (select c.id from research_claims c join projects p on p.id = c.project_id where p.user_id = ${userId})`);
    await tx.execute(sql`delete from research_claims where project_id in (select id from projects where user_id = ${userId})`);
    await tx.execute(sql`delete from research_notes where project_id in (select id from projects where user_id = ${userId})`);
    await tx.execute(sql`delete from project_decisions where project_id in (select id from projects where user_id = ${userId})`);
    await tx.execute(sql`delete from papers where project_id in (select id from projects where user_id = ${userId})`);
    await tx.execute(sql`delete from artifacts where project_id in (select id from projects where user_id = ${userId})`);
    await tx.execute(sql`delete from source_chunks where source_id in (select id from sources where user_id = ${userId})`);
    await tx.execute(sql`delete from sources where user_id = ${userId}`);

    await tx.execute(sql`delete from memory_chunks where user_id = ${userId}`);
    await tx.execute(sql`delete from memory_records where user_id = ${userId}`);
    await tx.execute(sql`delete from session_receipts where user_id = ${userId}`);
    await tx.execute(sql`delete from memory_events where user_id = ${userId}`);
    await tx.execute(sql`delete from resource_activities where user_id = ${userId}`);
    await tx.execute(sql`delete from misconceptions where user_id = ${userId}`);
    await tx.execute(sql`delete from assessment_attempts where user_id = ${userId}`);
    await tx.execute(sql`delete from learning_states where user_id = ${userId}`);

    await tx.execute(sql`delete from schedule_blocks where task_id in (select t.id from tasks t join goals g on g.id = t.goal_id where g.user_id = ${userId})`);
    await tx.execute(sql`delete from task_dependencies where task_id in (select t.id from tasks t join goals g on g.id = t.goal_id where g.user_id = ${userId}) or depends_on_task_id in (select t.id from tasks t join goals g on g.id = t.goal_id where g.user_id = ${userId})`);
    await tx.execute(sql`delete from tasks where goal_id in (select id from goals where user_id = ${userId})`);
    await tx.execute(sql`delete from milestones where goal_id in (select id from goals where user_id = ${userId})`);
    await tx.execute(sql`delete from calendar_constraints where user_id = ${userId}`);
    await tx.execute(sql`delete from projects where user_id = ${userId}`);
    await tx.execute(sql`delete from goals where user_id = ${userId}`);

    await tx.execute(sql`delete from password_history where user_id = ${userId}`);
    await tx.execute(sql`delete from auth_tokens where user_id = ${userId}`);
    await tx.execute(sql`delete from app_sessions where user_id = ${userId}`);
    await tx.execute(sql`delete from user_credentials where user_id = ${userId}`);
    await tx.execute(sql`delete from profiles where user_id = ${userId}`);
    await tx.execute(sql`delete from users where id = ${userId}`);
  });
}
