export const DEMO_NOW = "2026-07-18T09:00:00+05:30";

export const demoUser = {
  id: "user_maya",
  name: "Maya",
  level: "CBSE · Class 12",
  initials: "MS",
  timezone: "Asia/Kolkata",
  streak: 12,
};

export const physicsGoal = {
  id: "goal_physics",
  title: "Electrostatic Potential & Capacitance",
  eyebrow: "CBSE CLASS 12 · PHYSICS",
  deadline: "Tomorrow, 9:00 AM",
  target: "Score 85%+ on the chapter assessment",
  progress: 64,
  readiness: "On track, with one concept at risk",
  uncertainty: "Assessment duration is inferred from your calendar",
  milestones: [
    { id: "m1", title: "Prerequisites", status: "done", note: "Electric field · Work" },
    { id: "m2", title: "Potential", status: "active", note: "1 misconception found" },
    { id: "m3", title: "Capacitance", status: "upcoming", note: "3 concepts" },
    { id: "m4", title: "Exam transfer", status: "upcoming", note: "Unseen mixed set" },
  ],
};

export const initialSchedule = [
  { id: "block_diagnostic_1", taskId: "task_diagnostic", time: "9:10", end: "9:35", duration: 25, title: "Potential diagnostic", kind: "learn", status: "active", flexible: true, evidence: "Complete 3 diagnostic questions", reason: "Clarify the concept at highest exam risk" },
  { id: "block_school", taskId: "fixed_school", time: "10:00", end: "13:00", duration: 180, title: "School lab", kind: "fixed", status: "planned", flexible: false, evidence: "Calendar commitment", reason: "Fixed commitment" },
  { id: "block_research_1", taskId: "task_research", time: "14:10", end: "14:55", duration: 45, title: "Validate grouped split", kind: "research", status: "planned", flexible: true, evidence: "Save comparison note", reason: "Unblocks the methods section" },
  { id: "block_review_1", taskId: "task_review", time: "17:20", end: "17:50", duration: 30, title: "Capacitance mixed practice", kind: "learn", status: "planned", flexible: true, evidence: "Pass 2 unseen items", reason: "Spaced review before tomorrow's assessment" },
];

export const scheduleSeed = {
  now: "2026-07-18T09:00:00+05:30",
  timezone: "Asia/Kolkata",
  bufferMinutes: 10,
  tasks: [
    { id: "task_diagnostic", goalId: "goal_physics", title: "Potential diagnostic", status: "backlog", estimatedMinutes: 25, deadline: "2026-07-19T09:00:00+05:30", priority: 5, energyRequired: "high", dependencies: [], minimumBlockMinutes: 25, maximumBlockMinutes: 25, splittable: false, completionEvidence: "Complete 3 diagnostic questions", resourceIds: ["resource_native"] },
    { id: "task_review", goalId: "goal_physics", title: "Capacitance mixed practice", status: "backlog", estimatedMinutes: 30, deadline: "2026-07-19T09:00:00+05:30", priority: 4, energyRequired: "medium", dependencies: ["task_diagnostic"], minimumBlockMinutes: 30, maximumBlockMinutes: 30, splittable: false, completionEvidence: "Pass 2 unseen items", resourceIds: ["resource_ncert"] },
    { id: "task_research", goalId: "goal_research", title: "Validate grouped split", status: "backlog", estimatedMinutes: 45, deadline: "2026-07-21T17:00:00+05:30", priority: 3, energyRequired: "high", dependencies: [], minimumBlockMinutes: 45, maximumBlockMinutes: 45, splittable: false, completionEvidence: "Save comparison note", resourceIds: ["source_mendez"] },
  ],
  availability: [
    { start: "2026-07-18T09:10:00+05:30", end: "2026-07-18T10:00:00+05:30", energy: "high" },
    { start: "2026-07-18T13:00:00+05:30", end: "2026-07-18T19:30:00+05:30", energy: "medium" },
  ],
  constraints: [
    { id: "constraint_school", title: "School lab", start: "2026-07-18T10:00:00+05:30", end: "2026-07-18T13:00:00+05:30", hard: true },
  ],
};

export const learningConcepts = [
  { id: "field", label: "Electric field", status: "mastered", x: 0, y: 80 },
  { id: "work", label: "Work & energy", status: "understood", x: 0, y: 190 },
  { id: "potential", label: "Electric potential", status: "misconception", x: 230, y: 90 },
  { id: "equipotential", label: "Equipotential", status: "practicing", x: 470, y: 20 },
  { id: "capacitance", label: "Capacitance", status: "exposed", x: 470, y: 160 },
  { id: "dielectrics", label: "Dielectrics", status: "not_started", x: 710, y: 160 },
];

export const diagnosticQuestions = [
  {
    id: "item_potential_1",
    prompt: "A +2 C charge and a +5 C charge are placed at the same point in an electric field. Which quantity is the same for both?",
    choices: ["Potential energy", "Electric potential", "Work done to bring them", "Force on the charge"],
    correct: 1,
  },
  {
    id: "item_potential_2",
    prompt: "Moving along an equipotential surface requires…",
    choices: ["positive work", "negative work", "zero work", "work that depends on charge"],
    correct: 2,
  },
  {
    id: "item_potential_3",
    prompt: "If electric potential at a point is 12 V, the potential energy of a 3 C charge there is…",
    choices: ["4 J", "12 J", "15 J", "36 J"],
    correct: 3,
  },
];

export const masteryBefore = [
  { label: "Exposure", value: 88 },
  { label: "Understanding", value: 52 },
  { label: "Transfer", value: 28 },
  { label: "Retention", value: 46 },
];

export const masteryAfter = [
  { label: "Exposure", value: 92 },
  { label: "Understanding", value: 78 },
  { label: "Transfer", value: 66 },
  { label: "Retention", value: 60 },
];

export const researchProject = {
  id: "project_hdab",
  title: "Cross-marker spatial association",
  subtitle: "Methods paper · Serial H-DAB tissue sections",
  phase: "Methods validation",
  progress: 58,
  goal: "Define and validate a defensible method for quantifying cross-marker spatial association across serial sections.",
  decision: "Use patient-grouped held-out validation",
  decisionReason: "Random patch splitting can leak patient-specific morphology into validation and inflate reported generalization.",
  unresolved: "How sensitive is nearest-neighbour association to section-to-section registration error above 12 µm?",
  nextTask: "Run registration perturbation analysis at 4, 8, 12, and 16 µm",
};

export const papers = [
  { id: "paper_1", title: "Spatial validation in serial histology", authors: "Huang et al.", year: 2024, tag: "validation", sourceId: "source_huang" },
  { id: "paper_2", title: "Patient-aware evaluation of pathology models", authors: "Mendez & Rao", year: 2023, tag: "leakage", sourceId: "source_mendez" },
  { id: "paper_3", title: "Registration uncertainty in tissue mapping", authors: "Okafor et al.", year: 2025, tag: "registration", sourceId: "source_okafor" },
];

export const researchClaims = [
  {
    id: "claim_grouped",
    text: "Patient-grouped validation is necessary to estimate cross-patient generalization without morphology leakage.",
    status: "Direct support",
    evidence: [
      { id: "evidence_mendez_2", source: "Mendez & Rao (2023)", passage: "Passage 2 · Validation design", text: "When image patches from one patient occur in both training and validation sets, patient-specific staining and morphology can create optimistic performance estimates. Grouped partitioning at the patient level prevents this pathway of leakage." },
      { id: "evidence_huang_4", source: "Huang et al. (2024)", passage: "Passage 4 · Study protocol", text: "All serial-section pairs belonging to a patient were assigned to a single fold before any patch extraction. This preserves independence between evaluation units." },
    ],
    verifier: "Featherless specialist · independently verified",
  },
  {
    id: "claim_registration",
    text: "Association estimates remain stable under small registration perturbations, but the tolerance boundary is unresolved.",
    status: "Indirect support",
    evidence: [
      { id: "evidence_okafor_3", source: "Okafor et al. (2025)", passage: "Passage 3 · Sensitivity analysis", text: "Neighbourhood association was stable under simulated displacement up to 8 µm. Beyond that range, effects varied with marker density and tissue architecture." },
    ],
    verifier: "AI Gateway verifier · qualified support",
  },
];

export const memories = [
  { id: "memory_1", type: "Learning", title: "Potential vs potential energy confusion", detail: "Confirmed by diagnostic Q1 and Q3", time: "8 min ago", source: "Diagnostic checkpoint", status: "Current" },
  { id: "memory_2", type: "Decision", title: "Use patient-grouped held-out validation", detail: "Accepted for the H-DAB methods project", time: "Yesterday", source: "Research workspace", status: "Current" },
  { id: "memory_3", type: "Goal", title: "Physics assessment target: 85%+", detail: "Deadline tomorrow at 9:00 AM", time: "2 days ago", source: "Onboarding", status: "Current" },
  { id: "memory_4", type: "Preference", title: "Prefers intuition before formal derivation", detail: "Confirmed in tutoring preferences", time: "1 week ago", source: "Profile", status: "Current" },
  { id: "memory_5", type: "Question", title: "Registration error tolerance above 12 µm", detail: "Unresolved methodological question", time: "Yesterday", source: "Research workspace", status: "Current" },
];

export const activity = [
  { id: "a1", type: "route", title: "Diagnostic classified", detail: "Groq fast route · schema valid", time: "09:04", icon: "route" },
  { id: "a2", type: "memory", title: "Misconception recorded", detail: "Append-only learning event · evt_learning_21", time: "09:05", icon: "memory" },
  { id: "a3", type: "schedule", title: "Review block proposed", detail: "Deterministic solver · awaiting calendar confirmation", time: "09:06", icon: "calendar" },
  { id: "a4", type: "research", title: "Claim support verified", detail: "Featherless specialist + independent AI Gateway verifier", time: "Yesterday", icon: "shield" },
  { id: "a5", type: "mcp", title: "Claude read project context", detail: "research:read · 6 compact records · 1.2k tokens", time: "Yesterday", icon: "link" },
];

export const routes = [
  { task: "Schedule optimization", route: "Deterministic", model: "Constraint solver v1", reason: "Dates and dependencies must be exact", verification: "Rules checked", cost: "No tokens", color: "green" },
  { task: "Misconception diagnosis", route: "Fast model", model: "Groq · fast classifier", reason: "Bounded classification with Zod output", verification: "Schema passed", cost: "Low", color: "blue" },
  { task: "Claim entailment", route: "Specialist", model: "Featherless · reasoning", reason: "Research-critical evidence check", verification: "Independent verifier passed", cost: "Medium", color: "orange" },
  { task: "Source retrieval", route: "Retrieval", model: "pgvector · exact passage", reason: "Claims require source evidence", verification: "Chunk IDs present", cost: "No generation", color: "purple" },
];

export const integrations = [
  { name: "Claude", description: "Read goals, research, memory, and today’s plan through MCP.", status: "Connected", scopes: "6 read · 2 propose", lastSync: "2 min ago", color: "clay", enabled: true },
  { name: "ChatGPT", description: "Standards-compliant MCP app contract for developer mode.", status: "Ready to connect", scopes: "Choose on connect", lastSync: "Not connected", color: "ink", enabled: true },
  { name: "Obsidian", description: "Export durable academic memory as linked Markdown.", status: "Preview", scopes: "Export only", lastSync: "Not connected", color: "violet", enabled: false },
  { name: "Google Calendar", description: "Read commitments and commit approved study blocks.", status: "Feature flagged", scopes: "Free/busy · confirmed writes", lastSync: "Off for demo", color: "blue", enabled: false },
  { name: "Zotero", description: "Import papers and citation metadata into research projects.", status: "Feature flagged", scopes: "Library read", lastSync: "Off for demo", color: "red", enabled: false },
  { name: "NotebookLM", description: "Export a source and study pack for optional exploration.", status: "Export ready", scopes: "No account access", lastSync: "On demand", color: "yellow", enabled: true },
];

export const learningResources = [
  { id: "resource_native", type: "Native tutor", title: "Potential vs energy micro-lesson", authority: "Curriculum aligned", why: "Best match for the misconception just detected", time: "6 min", selected: true },
  { id: "resource_ncert", type: "Official source", title: "NCERT chapter: Electrostatic Potential", authority: "Official", why: "Use for canonical definitions and derivations", time: "18 min", selected: false },
  { id: "resource_phet", type: "Simulation", title: "Charges and Fields", authority: "University of Colorado", why: "Useful for field-to-potential intuition", time: "10 min", selected: false },
];
