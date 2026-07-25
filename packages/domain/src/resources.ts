import {
  resourceRecommendationSchema,
  resourceRegistryEntrySchema,
  type ResourceRecommendation,
  type ResourceRegistryEntry,
} from "@continuum/schemas";

export type ResourceNeed =
  | "diagnosis"
  | "conceptual_intuition"
  | "canonical_explanation"
  | "guided_practice"
  | "official_exam_simulation"
  | "source_exploration"
  | "research_evidence"
  | "coding_practice";

export interface ResourceRequest {
  id: string;
  topic: string;
  goalId?: string;
  conceptId?: string;
  goalType?: "school" | "exam" | "university" | "research" | "coding";
  need: ResourceNeed;
  level?: string;
  minutesAvailable?: number;
  costPreference?: "free_only" | "free_preferred" | "any";
  region?: string;
  preferredFormats?: string[];
  excludeResourceIds?: string[];
  rejectionReasons?: string[];
  feedback?: string;
  accessibility?: string[];
  now?: string;
}

const reviewedAt = "2026-07-19T00:00:00.000Z";

export const curatedResourceRegistry: ResourceRegistryEntry[] = [
  {
    id: "resource_native_potential",
    title: "Potential vs energy contrastive micro-lesson",
    provider: "Continuum",
    description: "A six-minute source-locked explanation targeted to the potential-versus-potential-energy misconception.",
    authority: "expert_curated",
    cost: "free",
    level: ["CBSE Class 12", "high school"],
    curriculumTags: ["CBSE", "Physics", "Electrostatic Potential and Capacitance"],
    topicTags: ["electric potential", "potential energy", "voltage", "electrostatics"],
    formats: ["adaptive_tutor", "text", "math"],
    url: "https://continuum.local/learn/electric-potential",
    embedAllowed: true,
    deepLinkAllowed: true,
    accessibility: ["screen_reader", "keyboard", "reduced_motion"],
    qualityScore: 0.88,
    lastReviewedAt: reviewedAt,
    accessRequirements: ["Continuum account"],
    regions: ["global"],
    languages: ["en"],
    estimatedMinutes: 6,
    exactLocator: { section: "Same place. Same potential. Different energy." },
    bestFor: ["targeted misconception repair", "short time windows", "source-locked explanation"],
    notBestFor: ["interactive spatial intuition", "official exam simulation"],
    focusInstructions: ["Distinguish the location property V from the charge-dependent quantity U=qV."],
    completionInstructions: ["Teach the distinction back in one sentence.", "Complete the unseen checkpoint."],
    verification: { kind: "checkpoint", prompt: "Using k = 9×10⁹, what is V at 0.75 m from a +2 nC point charge? Give the answer in volts.", expectedAnswer: "24", passingScore: 1 },
    nativeContent: [
      { heading: "Potential belongs to the place", body: "Electric potential V describes the source charges and a location. It is the potential energy available per unit test charge: V = U/q. Changing the test charge does not change V at that fixed point." },
      { heading: "Energy belongs to the charge at that place", body: "Potential energy is U = qV. At the same point, doubling q doubles U, while V stays fixed. The sign of q can reverse the sign of U even though the location's potential is unchanged." },
      { heading: "Use the contrast", body: "Ask two separate questions: what potential does this location have, and what energy does this particular charge have there? Keeping those nouns separate prevents the common voltage-versus-energy misconception." },
    ],
    officialFor: [],
    native: true,
    active: true,
  },
  {
    id: "resource_phet_charges_fields",
    title: "Charges and Fields",
    provider: "PhET · University of Colorado Boulder",
    description: "An interactive simulation for manipulating charges and inspecting fields, voltage, and equipotential behavior.",
    authority: "institutional",
    cost: "free",
    level: ["high school", "university introductory"],
    curriculumTags: ["Physics", "Electrostatics"],
    topicTags: ["electric potential", "voltage", "equipotential", "electric field", "charges"],
    formats: ["interactive_simulation", "visual"],
    url: "https://phet.colorado.edu/en/simulations/charges-and-fields",
    embedAllowed: true,
    deepLinkAllowed: true,
    accessibility: ["keyboard", "audio_description", "interactive_description"],
    qualityScore: 0.97,
    lastReviewedAt: reviewedAt,
    accessRequirements: ["Modern browser", "JavaScript"],
    regions: ["global"],
    languages: ["en", "hi", "es", "fr"],
    estimatedMinutes: 10,
    exactLocator: { activity: "Place one positive source charge, enable Values and Voltage, then compare two locations before changing the test setup." },
    bestFor: ["conceptual intuition", "field-to-potential connection", "equipotential exploration"],
    notBestFor: ["full exam scoring", "formal derivation only"],
    focusInstructions: [
      "Keep the source charge fixed and inspect the voltage at two locations.",
      "Move the sensor along one equipotential line and notice what remains constant.",
      "Explain why voltage belongs to the location and source configuration, not to a test charge.",
    ],
    completionInstructions: ["Record one observation comparing field direction and equipotential lines.", "Return to Continuum for the unseen numerical checkpoint."],
    verification: { kind: "checkpoint", prompt: "At a fixed point, does doubling a test charge double electric potential V?", expectedAnswer: "no", passingScore: 1 },
    officialFor: [],
    native: false,
    active: true,
  },
  {
    id: "resource_openstax_potential",
    title: "Physics 18.4 · Electric Potential",
    provider: "OpenStax",
    description: "A stable open textbook section with definitions, worked relationships, misconception warnings, and practice problems.",
    authority: "institutional",
    cost: "free",
    level: ["high school", "university introductory"],
    curriculumTags: ["Physics", "Electrostatics"],
    topicTags: ["electric potential", "potential energy", "voltage"],
    formats: ["textbook", "practice"],
    url: "https://openstax.org/books/physics/pages/18-4-electric-potential",
    embedAllowed: false,
    deepLinkAllowed: true,
    accessibility: ["screen_reader", "printable"],
    qualityScore: 0.94,
    lastReviewedAt: reviewedAt,
    accessRequirements: ["Web browser"],
    regions: ["global"],
    languages: ["en"],
    estimatedMinutes: 18,
    exactLocator: { section: "Electric Potential; Misconception Alert; Practice Problems 19–20" },
    bestFor: ["canonical explanation", "worked equations", "independent practice"],
    notBestFor: ["rapid diagnosis", "interactive spatial intuition"],
    focusInstructions: ["Read the definition V=U/q and the misconception alert.", "Work Practice Problem 19 without viewing the answer."],
    completionInstructions: ["Save the result of Practice Problem 19.", "Return for a transfer check."],
    verification: { kind: "checkpoint", prompt: "Provide your answer and working for Practice Problem 19.", passingScore: 0.8 },
    officialFor: [],
    native: false,
    active: true,
  },
  {
    id: "resource_bluebook_sat",
    title: "Bluebook full-length SAT practice",
    provider: "College Board",
    description: "The official test application and full-length scored practice environment for the digital SAT.",
    authority: "official",
    cost: "free",
    level: ["SAT"],
    curriculumTags: ["SAT", "Digital SAT"],
    topicTags: ["SAT", "full length practice", "official exam simulation"],
    formats: ["official_exam_platform", "timed_assessment"],
    url: "https://bluebook.collegeboard.org/students/practice",
    embedAllowed: false,
    deepLinkAllowed: true,
    accessibility: ["approved_accommodations", "assistive_technology"],
    qualityScore: 1,
    lastReviewedAt: reviewedAt,
    accessRequirements: ["Bluebook app", "College Board account for scoring", "Supported device"],
    regions: ["global"],
    languages: ["en"],
    estimatedMinutes: 134,
    exactLocator: { section: "Practice and Prepare → Full-Length Practice Test" },
    bestFor: ["official exam simulation", "timing practice", "official scoring"],
    notBestFor: ["five-minute concept repair"],
    focusInstructions: ["Reproduce test-day timing and approved accommodations.", "Do not pause to study during the attempt."],
    completionInstructions: ["Finish the selected full-length test.", "Return with the test number, section scores, and missed-skill report."],
    verification: { kind: "score_import", prompt: "Enter the Bluebook test number and section scores.", passingScore: 0 },
    officialFor: ["SAT", "PSAT"],
    native: false,
    active: true,
  },
  {
    id: "resource_khan_sat",
    title: "Official Digital SAT Prep",
    provider: "Khan Academy · College Board",
    description: "Free official skill practice, lessons, hints, and test strategy created with College Board.",
    authority: "official",
    cost: "free",
    level: ["SAT"],
    curriculumTags: ["SAT", "Digital SAT"],
    topicTags: ["SAT", "skill practice", "math", "reading", "writing"],
    formats: ["course", "guided_practice", "video"],
    url: "https://www.khanacademy.org/digital-sat",
    embedAllowed: false,
    deepLinkAllowed: true,
    accessibility: ["captions", "keyboard"],
    qualityScore: 0.98,
    lastReviewedAt: reviewedAt,
    accessRequirements: ["Web browser", "Optional Khan Academy account for progress tracking"],
    regions: ["global"],
    languages: ["en"],
    estimatedMinutes: 25,
    exactLocator: { activity: "Open the skill matching the latest Bluebook missed-skill report and complete one practice set." },
    bestFor: ["official targeted SAT remediation", "guided practice"],
    notBestFor: ["full test-day simulation"],
    focusInstructions: ["Practice only the highest-impact missed skill from the latest official test."],
    completionInstructions: ["Complete one skill set.", "Record the mastery level or correct count."],
    verification: { kind: "score_import", prompt: "Enter the skill name and correct/attempted count.", passingScore: 0.7 },
    officialFor: ["SAT"],
    native: false,
    active: true,
  },
  {
    id: "resource_notebooklm_pack",
    title: "NotebookLM source exploration pack",
    provider: "Google NotebookLM",
    description: "An optional export workflow for exploring a bounded collection of user-selected sources.",
    authority: "expert_curated",
    cost: "free",
    level: ["university", "research"],
    curriculumTags: [],
    topicTags: ["source exploration", "research synthesis", "papers"],
    formats: ["specialist_tool", "source_notebook"],
    url: "https://notebooklm.google.com/",
    embedAllowed: false,
    deepLinkAllowed: true,
    accessibility: ["browser"],
    qualityScore: 0.86,
    lastReviewedAt: reviewedAt,
    accessRequirements: ["Google account", "Manual upload of the Continuum export pack"],
    regions: ["global"],
    languages: ["en"],
    estimatedMinutes: 20,
    exactLocator: { activity: "Create a new notebook and upload the Continuum source pack; do not add unrelated sources." },
    bestFor: ["multi-source exploration", "audio overview", "question generation"],
    notBestFor: ["claim verification without returning exact evidence", "automatic backend processing"],
    focusInstructions: ["Keep every observation tied to a source in the exported pack."],
    completionInstructions: ["Export or copy the useful note back to Continuum with its source references."],
    verification: { kind: "artifact", prompt: "Return a note containing at least one exact source reference." },
    officialFor: [],
    native: false,
    active: true,
  },
  {
    id: "resource_ncert_electrostatic_potential",
    title: "NCERT Physics XII · Electrostatic Potential and Capacitance",
    provider: "NCERT · Government of India",
    description: "The official Class XII textbook chapter used for canonical definitions, derivations, examples, and end-of-chapter exercises.",
    authority: "official",
    cost: "free",
    level: ["CBSE Class 12"],
    curriculumTags: ["CBSE", "Physics", "Electrostatic Potential and Capacitance"],
    topicTags: ["electric potential", "potential energy", "capacitance", "equipotential"],
    formats: ["textbook", "practice", "official_curriculum"],
    url: "https://www.ncert.nic.in/textbook/pdf/leph102.pdf",
    embedAllowed: false,
    deepLinkAllowed: true,
    accessibility: ["downloadable_pdf", "printable"],
    qualityScore: 0.99,
    lastReviewedAt: reviewedAt,
    accessRequirements: ["PDF reader"],
    regions: ["global", "IN"],
    languages: ["en"],
    estimatedMinutes: 22,
    exactLocator: { section: "Chapter 2 · Sections 2.2–2.8: potential, point charges, equipotential surfaces, and potential energy" },
    bestFor: ["official CBSE definitions", "canonical derivations", "board-aligned exercises"],
    notBestFor: ["interactive spatial intuition", "rapid misconception diagnosis"],
    focusInstructions: ["Read the definition of potential as work per unit test charge.", "Compare the potential and potential-energy equations before attempting the worked example."],
    completionInstructions: ["Complete one worked example without copying the solution.", "Return with the exercise number and working for an unseen transfer check."],
    verification: { kind: "checkpoint", prompt: "Solve a new V=kQ/r item with different values.", expectedAnswer: "24", passingScore: 1 },
    officialFor: ["CBSE Class 12 Physics"],
    native: false,
    active: true,
  },
  {
    id: "resource_mit_ocw_electric_potential",
    title: "MIT OpenCourseWare · Electric Field and Electric Potential",
    provider: "MIT OpenCourseWare",
    description: "A university-level worked note connecting electric field, work, potential difference, and potential.",
    authority: "institutional",
    cost: "free",
    level: ["university introductory"],
    curriculumTags: ["Electricity and Magnetism", "8.02"],
    topicTags: ["electric field", "electric potential", "potential difference", "electrostatics"],
    formats: ["university_notes", "worked_examples"],
    url: "https://ocw.mit.edu/courses/8-02x-physics-ii-electricity-magnetism-with-an-experimental-focus-spring-2005/79a842b71ed61abd7039eb37f61a8b31_3_04_2002_edited.pdf",
    embedAllowed: false,
    deepLinkAllowed: true,
    accessibility: ["downloadable_pdf"],
    qualityScore: 0.95,
    lastReviewedAt: reviewedAt,
    accessRequirements: ["PDF reader"],
    regions: ["global"],
    languages: ["en"],
    estimatedMinutes: 25,
    exactLocator: { section: "Electric Field and Electric Potential" },
    bestFor: ["university-level field-to-potential derivation", "worked conceptual examples"],
    notBestFor: ["official CBSE wording", "interactive simulation"],
    focusInstructions: ["Track the sign convention between work, field direction, and potential difference."],
    completionInstructions: ["Reproduce one derivation in your own notation.", "Return for a sign-convention transfer problem."],
    verification: { kind: "checkpoint", prompt: "Explain the sign of ΔV when moving along the electric field.", expectedAnswer: "negative", passingScore: 1 },
    officialFor: [],
    native: false,
    active: true,
  },
  {
    id: "resource_google_colab",
    title: "Google Colab notebook",
    provider: "Google Colaboratory",
    description: "A hosted Jupyter notebook environment requiring no local setup, with a free-of-charge but limited compute tier.",
    authority: "official",
    cost: "free",
    level: ["school", "university", "research"],
    curriculumTags: ["Programming", "Data science"],
    topicTags: ["python", "coding", "data analysis", "machine learning", "notebook"],
    formats: ["coding_environment", "notebook"],
    url: "https://colab.research.google.com/",
    embedAllowed: false,
    deepLinkAllowed: true,
    accessibility: ["browser"],
    qualityScore: 0.93,
    lastReviewedAt: reviewedAt,
    accessRequirements: ["Google account for saving notebooks", "Internet connection", "Free compute is limited and not guaranteed"],
    regions: ["global"],
    languages: ["en"],
    estimatedMinutes: 30,
    exactLocator: { activity: "Create a new Python 3 notebook and complete only the specified coding task in one named cell." },
    bestFor: ["zero-setup Python execution", "shareable notebooks", "data and ML practice"],
    notBestFor: ["offline or private data", "guaranteed long-running compute"],
    focusInstructions: ["Write and run the solution yourself before using any generated code.", "Keep inputs, outputs, and dependency versions in the notebook."],
    completionInstructions: ["Run all task cells successfully.", "Return the notebook link or exported .ipynb plus the test output."],
    verification: { kind: "artifact", prompt: "Attach the notebook or a repository commit with passing test output." },
    officialFor: [],
    native: false,
    active: true,
  },
  {
    id: "resource_claude_science",
    title: "Claude Science workbench",
    provider: "Anthropic",
    description: "A specialist scientific workbench for auditable computational research workflows, reusable pipelines, connected tools, and compute.",
    authority: "official",
    cost: "subscription",
    level: ["research", "graduate"],
    curriculumTags: ["Scientific computing", "Life sciences"],
    topicTags: ["research synthesis", "scientific computing", "papers", "pipelines", "life sciences"],
    formats: ["specialist_tool", "scientific_workbench", "coding_environment"],
    url: "https://www.anthropic.com/news/claude-science-ai-workbench",
    embedAllowed: false,
    deepLinkAllowed: true,
    accessibility: ["desktop_app"],
    qualityScore: 0.9,
    lastReviewedAt: reviewedAt,
    accessRequirements: ["Eligible Claude account", "Public beta availability and plan limits may apply"],
    regions: ["global"],
    languages: ["en"],
    estimatedMinutes: 45,
    exactLocator: { activity: "Open a bounded project with only the selected sources, data, and an explicit analysis objective." },
    bestFor: ["multi-step scientific computing", "auditable research artifacts", "reusable analysis pipelines"],
    notBestFor: ["a single factual lookup", "free-only workflows", "claim acceptance without exact source evidence"],
    focusInstructions: ["Define the analysis objective and accepted evidence before running a pipeline.", "Keep generated artifacts and source references auditable."],
    completionInstructions: ["Export the pipeline or artifact.", "Sync the outcome receipt and unresolved questions back to Continuum."],
    verification: { kind: "artifact", prompt: "Return an auditable artifact with source references and the reusable pipeline or method." },
    officialFor: [],
    native: false,
    active: true,
  },
].map((resource) => resourceRegistryEntrySchema.parse(resource));

function normalizedTerms(value: string) {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2));
}

function overlapScore(query: string, resource: ResourceRegistryEntry) {
  const wanted = normalizedTerms(query);
  const available = normalizedTerms([
    resource.title,
    resource.description,
    ...resource.topicTags,
    ...resource.curriculumTags,
    ...resource.bestFor,
    ...resource.officialFor,
  ].join(" "));
  if (!wanted.size) return 0;
  return [...wanted].filter((term) => available.has(term)).length / wanted.size;
}

function needScore(need: ResourceNeed, resource: ResourceRegistryEntry) {
  const formats = new Set(resource.formats);
  const bestFor = resource.bestFor.join(" ").toLowerCase();
  if (need === "official_exam_simulation") return resource.authority === "official" && (formats.has("official_exam_platform") || bestFor.includes("official exam")) ? 1 : 0;
  if (need === "conceptual_intuition") return formats.has("interactive_simulation") ? 1 : bestFor.includes("intuition") ? 0.8 : 0.35;
  if (need === "canonical_explanation") return formats.has("textbook") || resource.authority === "official" ? 1 : 0.5;
  if (need === "guided_practice") return formats.has("guided_practice") || formats.has("practice") ? 1 : 0.4;
  if (need === "source_exploration") return formats.has("source_notebook") ? 1 : 0.35;
  if (need === "research_evidence") return resource.authority === "peer_reviewed" ? 1 : formats.has("source_notebook") ? 0.45 : 0.2;
  if (need === "coding_practice") return formats.has("coding_environment") ? 1 : 0;
  return resource.native && formats.has("adaptive_tutor") ? 1 : 0.45;
}

function authorityScore(authority: ResourceRegistryEntry["authority"]) {
  return { official: 1, institutional: 0.94, peer_reviewed: 0.96, expert_curated: 0.82, community: 0.6, generated: 0.48 }[authority];
}

function scoreResource(request: ResourceRequest, resource: ResourceRegistryEntry) {
  if (!resource.active) return Number.NEGATIVE_INFINITY;
  if (request.excludeResourceIds?.includes(resource.id)) return Number.NEGATIVE_INFINITY;
  if (request.costPreference === "free_only" && resource.cost !== "free") return Number.NEGATIVE_INFINITY;
  if (request.region && !resource.regions.includes("global") && !resource.regions.includes(request.region)) return Number.NEGATIVE_INFINITY;
  const topicalFit = overlapScore(`${request.topic} ${request.level ?? ""}`, resource);
  if (topicalFit === 0) return Number.NEGATIVE_INFINITY;
  const timeFit = request.minutesAvailable
    ? resource.estimatedMinutes <= request.minutesAvailable ? 1 : Math.max(0, request.minutesAvailable / resource.estimatedMinutes - 0.35)
    : 0.7;
  const formatFit = request.preferredFormats?.length
    ? Math.max(...request.preferredFormats.map((format) => resource.formats.includes(format) ? 1 : 0), 0)
    : 0.7;
  const accessibilityFit = request.accessibility?.length
    ? request.accessibility.filter((need) => resource.accessibility?.includes(need)).length / request.accessibility.length
    : 1;
  const costFit = resource.cost === "free" ? 1 : request.costPreference === "any" ? 0.75 : 0.35;
  const officialBoost = request.need === "official_exam_simulation" && resource.officialFor.length ? 0.25 : 0;
  const feedbackFit = request.feedback ? overlapScore(request.feedback, resource) * 0.08 : 0;
  const rejectedForAccess = request.rejectionReasons?.includes("cannot_access") && resource.accessRequirements.some((item) => /account|app|subscription|eligible|device/i.test(item)) ? -0.22 : 0;
  const difficultyFit = request.rejectionReasons?.includes("too_easy")
    ? resource.level.some((level) => /university|advanced|graduate/i.test(level)) ? 0.12 : -0.08
    : request.rejectionReasons?.includes("too_difficult")
      ? resource.level.some((level) => /school|introductory|class 12/i.test(level)) ? 0.12 : -0.08
      : 0;
  return Number((
    topicalFit * 0.24
    + needScore(request.need, resource) * 0.25
    + authorityScore(resource.authority) * 0.17
    + resource.qualityScore * 0.13
    + timeFit * 0.09
    + costFit * 0.05
    + formatFit * 0.04
    + accessibilityFit * 0.03
    + officialBoost
    + feedbackFit
    + rejectedForAccess
    + difficultyFit
  ).toFixed(4));
}

function whyNotSelected(selected: ResourceRegistryEntry, alternative: ResourceRegistryEntry, request: ResourceRequest) {
  if (request.need === "official_exam_simulation" && alternative.authority !== "official") return "It cannot reproduce the official testing and scoring environment.";
  if (alternative.estimatedMinutes > (request.minutesAvailable ?? Number.POSITIVE_INFINITY)) return "It does not fit the available time window.";
  if (selected.formats.includes("interactive_simulation") && !alternative.formats.includes("interactive_simulation")) return "It explains the concept but provides less interactive spatial feedback for this need.";
  if (selected.authority === "official" && alternative.authority !== "official") return "An official resource is available for this exact workflow.";
  return "It is useful, but its format, authority, or verification path is a weaker fit for the current goal state.";
}

export function recommendBestResource(request: ResourceRequest, registry = curatedResourceRegistry): ResourceRecommendation {
  const ranked = registry
    .map((resource) => ({ resource, score: scoreResource(request, resource) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((left, right) => right.score - left.score || right.resource.qualityScore - left.resource.qualityScore || left.resource.id.localeCompare(right.resource.id));
  const winner = ranked[0];
  if (!winner) throw new Error("No eligible resource matches the user's access and cost constraints");
  const native = ranked.find((item) => item.resource.native);
  const externalWins = !winner.resource.native;
  const whyBetterThanNative = externalWins
    ? request.need === "official_exam_simulation"
      ? `${winner.resource.provider} is the authoritative testing environment; a native imitation would provide less valid timing and scoring evidence.`
      : winner.resource.formats.includes("interactive_simulation")
        ? `${winner.resource.provider} provides manipulable visual feedback that the native text tutor cannot reproduce as effectively.`
        : `${winner.resource.provider} has the strongest authority and activity format for this exact learning need.`
    : native
      ? "The native adaptive tutor is the best fit because it targets the detected misconception within the available time and can verify transfer immediately."
      : "The selected resource is the strongest eligible match.";
  return resourceRecommendationSchema.parse({
    id: request.id,
    goalId: request.goalId,
    conceptId: request.conceptId,
    selected: winner.resource,
    alternatives: ranked.slice(1, 4).map((item) => ({ resource: item.resource, score: item.score, whyNotSelected: whyNotSelected(winner.resource, item.resource, request) })),
    score: winner.score,
    decision: externalWins ? "external" : "native",
    whyBetterThanNative,
    connectedOutcome: `Completing this activity advances ${request.goalId ?? "the active goal"} by addressing ${request.topic}; progress is accepted only after the stated verification.` ,
    scheduleImpact: `Reserve ${winner.resource.estimatedMinutes} minutes for the activity plus a short Continuum return checkpoint.`,
    verificationPlan: winner.resource.verification.prompt,
    generatedAt: request.now ?? new Date().toISOString(),
  });
}
