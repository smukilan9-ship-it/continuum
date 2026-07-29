/**
 * Study session persistence (redesign.md §14.1, §16.11 migration 2).
 *
 * Replaces the twenty-field localStorage blob the Learn screen wrote on every
 * keystroke. That draft was per-browser, so a session opened on a phone was
 * invisible on a laptop, and it stored the *whole screen* — view name, video
 * query, rejection-modal state — rather than the session.
 *
 * Mirrors the `MemoryStore` / `NeonStore` split in `lib/store.ts`: with a
 * database configured the rows live in `study_sessions`, and without one they
 * live in a process-local map so the demo workspace still resumes within a
 * session. `getStore` makes the same choice on the same signal.
 */
import { randomUUID } from "node:crypto";
import { getDatabase, sql } from "@continuum/db";

export type StudyPhase = "learn" | "check" | "result" | "done";

export type StudySession = {
  id: string;
  userId: string;
  goalId?: string;
  conceptId?: string;
  phase: StudyPhase;
  lesson?: Record<string, unknown>;
  checkpoint?: Record<string, unknown>;
  answer?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type StudySessionPatch = {
  phase?: StudyPhase;
  lesson?: Record<string, unknown>;
  checkpoint?: Record<string, unknown>;
  answer?: string;
  completedAt?: string;
};

const persistent = () => Boolean(process.env.DATABASE_URL);

/**
 * The no-database fallback map is hung off `globalThis` rather than being a
 * plain module constant.
 *
 * Next.js bundles a route handler and a page separately, so a module-scoped
 * `new Map()` is instantiated **once per bundle**: a session written by
 * `POST /api/learning/session` was invisible to `/study/[sessionId]`, which
 * then 404ed on a session it had just created. One global keeps the two halves
 * looking at the same object. With `DATABASE_URL` set this is never touched.
 */
const globalSessions = globalThis as typeof globalThis & { __continuumStudySessions?: Map<string, StudySession> };
const memory = globalSessions.__continuumStudySessions ??= new Map<string, StudySession>();

export function studySessionId() {
  return `study_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

function iso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : undefined;
}

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function fromRow(row: Record<string, unknown>): StudySession {
  const now = new Date().toISOString();
  return {
    id: String(row.id),
    userId: String(row.user_id),
    goalId: typeof row.goal_id === "string" ? row.goal_id : undefined,
    conceptId: typeof row.concept_id === "string" ? row.concept_id : undefined,
    phase: (["learn", "check", "result", "done"] as const).find((phase) => phase === row.phase) ?? "learn",
    lesson: object(row.lesson),
    checkpoint: object(row.checkpoint),
    answer: typeof row.answer === "string" ? row.answer : undefined,
    createdAt: iso(row.created_at) ?? now,
    updatedAt: iso(row.updated_at) ?? now,
    completedAt: iso(row.completed_at),
  };
}

export async function createStudySession(input: { userId: string; goalId?: string; conceptId?: string; lesson?: Record<string, unknown> }): Promise<StudySession> {
  const now = new Date().toISOString();
  const session: StudySession = {
    id: studySessionId(),
    userId: input.userId,
    goalId: input.goalId,
    conceptId: input.conceptId,
    phase: "learn",
    lesson: input.lesson,
    createdAt: now,
    updatedAt: now,
  };
  if (!persistent()) {
    memory.set(session.id, session);
    return session;
  }
  await getDatabase().execute(sql`
    insert into study_sessions (id, user_id, goal_id, concept_id, phase, lesson, created_at, updated_at)
    values (
      ${session.id}, ${session.userId}, ${session.goalId ?? null}, ${session.conceptId ?? null}, 'learn',
      ${session.lesson ? JSON.stringify(session.lesson) : null}::jsonb, now(), now()
    )
  `);
  return session;
}

/** Always user-scoped: a session id alone must never be enough to read a row. */
export async function getStudySession(sessionId: string, userId: string): Promise<StudySession | undefined> {
  if (!persistent()) {
    const session = memory.get(sessionId);
    return session?.userId === userId ? session : undefined;
  }
  const result = await getDatabase().execute(sql`
    select id, user_id, goal_id, concept_id, phase, lesson, checkpoint, answer, created_at, updated_at, completed_at
    from study_sessions where id = ${sessionId} and user_id = ${userId} limit 1
  `);
  const row = result.rows[0];
  return row ? fromRow(row as Record<string, unknown>) : undefined;
}

export async function updateStudySession(sessionId: string, userId: string, patch: StudySessionPatch): Promise<StudySession | undefined> {
  const current = await getStudySession(sessionId, userId);
  if (!current) return undefined;
  const next: StudySession = {
    ...current,
    ...(patch.phase ? { phase: patch.phase } : {}),
    ...(patch.lesson ? { lesson: patch.lesson } : {}),
    ...(patch.checkpoint ? { checkpoint: patch.checkpoint } : {}),
    ...(patch.answer === undefined ? {} : { answer: patch.answer }),
    ...(patch.completedAt ? { completedAt: patch.completedAt } : {}),
    updatedAt: new Date().toISOString(),
  };
  if (!persistent()) {
    memory.set(sessionId, next);
    return next;
  }
  // The row was just read under the same user scope, so the merged value is
  // written whole rather than assembled from conditional SQL fragments — one
  // statement, no per-field branching to get wrong.
  await getDatabase().execute(sql`
    update study_sessions set
      phase = ${next.phase},
      lesson = ${next.lesson ? JSON.stringify(next.lesson) : null}::jsonb,
      checkpoint = ${next.checkpoint ? JSON.stringify(next.checkpoint) : null}::jsonb,
      answer = ${next.answer ?? null},
      completed_at = ${next.completedAt ?? null},
      updated_at = now()
    where id = ${sessionId} and user_id = ${userId}
  `);
  return next;
}

/** The most recent session the learner has not finished, for the Continue row. */
export async function latestOpenStudySession(userId: string): Promise<StudySession | undefined> {
  if (!persistent()) {
    return [...memory.values()]
      .filter((session) => session.userId === userId && session.phase !== "done")
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
  }
  const result = await getDatabase().execute(sql`
    select id, user_id, goal_id, concept_id, phase, lesson, checkpoint, answer, created_at, updated_at, completed_at
    from study_sessions where user_id = ${userId} and phase <> 'done'
    order by updated_at desc limit 1
  `);
  const row = result.rows[0];
  return row ? fromRow(row as Record<string, unknown>) : undefined;
}
