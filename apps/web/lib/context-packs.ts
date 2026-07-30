type Row = Record<string, unknown>;

export interface ContextPackMetadata {
  id: string;
  title: string;
  description: string;
  category: "week" | "learning" | "project" | "goal";
  estimatedTokens: number;
  recordCount: number;
  provenance: string[];
  privacyLevel: "private_account";
  updatedAt: string;
  mcpTool: "get_context_pack";
  exportFormats: ["markdown", "json"];
}

export interface ContextPack {
  metadata: ContextPackMetadata;
  content: Record<string, unknown>;
  contextPolicy: string;
}

const array = (state: Record<string, unknown>, key: string) => Array.isArray(state[key]) ? state[key] as Row[] : [];
const string = (row: Row | undefined, key: string, fallback = "") => typeof row?.[key] === "string" ? String(row[key]) : fallback;
const updated = (rows: Row[], fallback: string) => rows.map((row) => string(row, "updatedAt") || string(row, "createdAt") || string(row, "occurredAt")).filter(Boolean).sort().at(-1) ?? fallback;
const tokens = (value: unknown) => Math.max(1, Math.ceil(JSON.stringify(value).length / 4));

function packMetadata(input: Omit<ContextPackMetadata, "estimatedTokens" | "recordCount" | "privacyLevel" | "mcpTool" | "exportFormats">, content: Record<string, unknown>): ContextPackMetadata {
  const recordCount = Object.values(content).reduce<number>((total, value) => total + (Array.isArray(value) ? value.length : value && typeof value === "object" ? 1 : 0), 0);
  return { ...input, estimatedTokens: tokens(content), recordCount, privacyLevel: "private_account", mcpTool: "get_context_pack", exportFormats: ["markdown", "json"] };
}

function projectPack(state: Record<string, unknown>, project: Row, now: string): ContextPack {
  const projectId = string(project, "id");
  const belongs = (row: Row) => string(row, "projectId") === projectId;
  const content = {
    project,
    tasks: array(state, "tasks").filter(belongs).slice(0, 20),
    decisions: array(state, "decisions").filter(belongs).slice(0, 20),
    claims: array(state, "claims").filter(belongs).slice(0, 20),
    notes: array(state, "notes").filter(belongs).slice(0, 12),
    sources: array(state, "sources").filter(belongs).slice(0, 30),
    papers: array(state, "papers").filter(belongs).slice(0, 30),
    recentReceipts: array(state, "receipts").filter(belongs).slice(0, 5),
  };
  return {
    metadata: packMetadata({ id: `project:${projectId}`, title: `${string(project, "title", "Project")} handoff`, description: "Current question, accepted decisions, evidence, open work, and recent outcomes.", category: "project", provenance: [projectId, "projects", "decisions", "claims", "sources", "receipts"], updatedAt: updated([project, ...content.decisions, ...content.claims], now) }, content),
    content,
    contextPolicy: "Private, scoped project state. Source text is referenced by stable IDs; full documents are not copied into the pack.",
  };
}

function goalPack(state: Record<string, unknown>, goal: Row, now: string): ContextPack {
  const goalId = string(goal, "id");
  const belongs = (row: Row) => string(row, "goalId") === goalId;
  const content = {
    goal,
    tasks: array(state, "tasks").filter(belongs).slice(0, 24),
    schedule: array(state, "schedule").filter(belongs).slice(0, 20),
    learningStates: array(state, "learningStates").filter((row) => belongs(row) || !string(row, "goalId")).slice(0, 8),
    recentReceipts: array(state, "receipts").filter(belongs).slice(0, 5),
  };
  return {
    metadata: packMetadata({ id: `goal:${goalId}`, title: string(goal, "title", "Goal context"), description: "Outcome, remaining tasks, scheduled work, and the learning signals relevant to this goal.", category: "goal", provenance: [goalId, "goals", "tasks", "schedule", "learning_states"], updatedAt: updated([goal, ...content.tasks, ...content.schedule], now) }, content),
    content,
    contextPolicy: "Private goal-scoped state. Only current tasks and compact learning evidence are included.",
  };
}

export function buildContextPacks(state: Record<string, unknown>, now = new Date().toISOString()): ContextPack[] {
  const goals = array(state, "goals");
  const projects = array(state, "projects");
  const tasks = array(state, "tasks");
  const schedule = array(state, "schedule");
  const receipts = array(state, "receipts");
  const learningStates = array(state, "learningStates").length
    ? array(state, "learningStates")
    : state.learningState && typeof state.learningState === "object"
      ? [state.learningState as Row]
      : [];
  const currentWeekContent = {
    activeGoals: goals.filter((goal) => !["completed", "archived"].includes(string(goal, "status"))).slice(0, 6),
    openTasks: tasks.filter((task) => string(task, "status") !== "done").slice(0, 20),
    schedule: schedule.slice(0, 24),
    upcomingDeadlines: goals.filter((goal) => string(goal, "targetDate")).slice(0, 8),
    recentOutcomes: receipts.slice(0, 4),
  };
  const misconceptionContent = {
    learningSignals: learningStates.filter((stateRow) => ["misconception_detected", "needs_review", "in_progress"].includes(string(stateRow, "status"))),
    recordedMisconceptions: receipts.flatMap((receipt) => Array.isArray(receipt.misconceptions) ? receipt.misconceptions : []).slice(0, 20),
    verificationEvidence: learningStates.flatMap((stateRow) => Array.isArray(stateRow.evidenceIds) ? stateRow.evidenceIds : []).slice(0, 30),
  };
  const base: ContextPack[] = [
    { metadata: packMetadata({ id: "current_week", title: "Current week", description: "The smallest useful pack for planning and resuming this week.", category: "week", provenance: ["goals", "tasks", "schedule", "receipts"], updatedAt: updated([...goals, ...tasks, ...schedule, ...receipts], now) }, currentWeekContent), content: currentWeekContent, contextPolicy: "Current private planning state; full event history and unrelated projects are omitted." },
    { metadata: packMetadata({ id: "current_misconceptions", title: "Current misconceptions", description: "Learning signals that still need explanation, practice, or an unseen checkpoint.", category: "learning", provenance: ["learning_states", "assessment_evidence", "receipts"], updatedAt: updated([...learningStates, ...receipts], now) }, misconceptionContent), content: misconceptionContent, contextPolicy: "Private learning evidence. Reading activity alone is not represented as mastery." },
  ];
  return [...base, ...projects.map((project) => projectPack(state, project, now)), ...goals.map((goal) => goalPack(state, goal, now))];
}

export function getContextPack(state: Record<string, unknown>, packId: string, maxTokens = 1800, now = new Date().toISOString()) {
  const pack = buildContextPacks(state, now).find((candidate) => candidate.metadata.id === packId);
  if (!pack) throw new Error("Context pack not found or not accessible");
  if (pack.metadata.estimatedTokens <= maxTokens) return pack;
  const content = JSON.parse(JSON.stringify(pack.content)) as Record<string, unknown>;
  const arrays = Object.values(content).filter(Array.isArray) as unknown[][];
  while (tokens(content) > maxTokens && arrays.some((items) => items.length)) {
    arrays.sort((left, right) => right.length - left.length)[0]?.pop();
  }
  return { ...pack, metadata: { ...pack.metadata, estimatedTokens: tokens(content), recordCount: Object.values(content).reduce<number>((total, value) => total + (Array.isArray(value) ? value.length : 1), 0) }, content, contextPolicy: `${pack.contextPolicy} Truncated to the requested ${maxTokens}-token estimate.` };
}

export interface PackSection {
  heading: string;
  items: string[];
  /** Items beyond the rendered slice, so truncation is stated rather than silent. */
  remaining: number;
}

const SECTION_HEADING: Record<string, string> = {
  goal: "Goal",
  project: "Project",
  tasks: "Open work",
  schedule: "Scheduled study",
  decisions: "What you've decided",
  claims: "Claims and their evidence",
  notes: "Notes",
  sources: "Sources",
  papers: "Papers",
  learningStates: "What you're learning",
  recentReceipts: "Recent session summaries",
  misconceptions: "Open misconceptions",
  goals: "Goals",
  blocks: "Study blocks",
};

function humanKey(key: string) {
  return SECTION_HEADING[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/**
 * Turn a record into the one line a person would read. Falls back through the
 * fields that actually carry meaning rather than printing the object.
 */
function bullet(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(bullet).filter(Boolean).join(", ") || undefined;
  if (typeof value !== "object") return undefined;

  const row = value as Row;
  const headline = ["title", "text", "summary", "name", "question", "content"].map((key) => string(row, key)).find(Boolean);
  const qualifier = ["outcome", "status", "phase", "reasoning", "purpose", "explanation"].map((key) => string(row, key)).find(Boolean);
  if (headline) return qualifier && qualifier !== headline ? `${headline} — ${qualifier}` : headline;
  if (qualifier) return qualifier;

  // Nothing nameable: describe the fields rather than dumping the object.
  const keys = Object.keys(row).filter((key) => !/^(id|.*Id|createdAt|updatedAt|deleted|version)$/.test(key));
  return keys.length ? keys.slice(0, 4).map(humanKey).join(", ") : undefined;
}

/**
 * §9.9: a pack is rendered as sections with headings and bullets. The page used
 * to show `JSON.stringify(pack.content, null, 2)` in a <pre> as its primary
 * content (C21), and the Markdown export wrapped the same JSON in a code fence,
 * so neither format was actually readable by the person the pack is about.
 */
export function renderPackSections(pack: ContextPack, perSection = 8): PackSection[] {
  const sections: PackSection[] = [];
  for (const [key, value] of Object.entries(pack.content)) {
    if (Array.isArray(value)) {
      const items = value.map(bullet).filter((item): item is string => Boolean(item));
      if (items.length) sections.push({ heading: humanKey(key), items: items.slice(0, perSection), remaining: Math.max(0, items.length - perSection) });
      continue;
    }
    const single = bullet(value);
    if (single) sections.push({ heading: humanKey(key), items: [single], remaining: 0 });
  }
  return sections;
}

export function contextPackMarkdown(pack: ContextPack) {
  const sections = renderPackSections(pack, 50);
  return [
    "---",
    `continuum_context_pack: ${JSON.stringify(pack.metadata.id)}`,
    `continuum_generated: true`,
    `updated_at: ${JSON.stringify(pack.metadata.updatedAt)}`,
    `privacy: ${pack.metadata.privacyLevel}`,
    `estimated_tokens: ${pack.metadata.estimatedTokens}`,
    "---",
    "",
    `# ${pack.metadata.title}`,
    "",
    pack.metadata.description,
    "",
    `> ${pack.contextPolicy}`,
    "",
    ...sections.flatMap((section) => [
      `## ${section.heading}`,
      "",
      ...section.items.map((item) => `- ${item}`),
      ...(section.remaining ? [`- …and ${section.remaining} more`] : []),
      "",
    ]),
  ].join("\n");
}
