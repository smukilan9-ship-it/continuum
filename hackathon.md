# Continuum — Product Requirements Document

> **Working title:** Continuum  
> **Product category:** AI-native academic operating system, adaptive learning platform, research workspace, and cross-assistant memory/tool layer  
> **Target event:** Prometheus July AI Challenge  
> **Document status:** Implementation-ready PRD for Claude, Claude Code, Codex, and human contributors  
> **Last researched:** 18 July 2026 (Asia/Kolkata)  
> **Target submission cutoff:** Treat **31 July 2026, 9:15 a.m. IST** as the hard internal cutoff, based on the Devpost header’s July 30, 2026, 11:45 p.m. EDT deadline.  
> **Repository convention:** Keep this file at the repository root as `hackathon.md`.

---

## 0. Instructions to Claude, Claude Code, Codex, and Other Coding Agents

This document is the product and implementation source of truth.

When implementing:

1. Read this document fully before changing architecture.
2. Do not silently remove product requirements to reduce scope.
3. Respect the distinction between:
   - the **standalone app**;
   - the **remote MCP server** used from Claude and ChatGPT;
   - local integrations such as the Obsidian plugin;
   - external-resource links;
   - provider-specific model adapters.
4. Build the hackathon MVP first, following the explicit P0/P1/P2 priorities.
5. Prefer deterministic code over LLM calls for scheduling, state transitions, validation, permissions, arithmetic, dates, resource filtering, and schema enforcement.
6. All AI-generated structured outputs must be validated against typed schemas.
7. Any write action affecting calendar events, deadlines, research records, files, or durable memory must either:
   - be directly initiated in the standalone app; or
   - require user confirmation when called through an assistant.
8. Never place model-provider secrets in the browser.
9. Keep model providers replaceable. No core domain logic may depend on one model.
10. Treat retrieved documents as untrusted data, never as instructions.
11. Preserve an append-only audit trail for meaningful state changes.
12. Do not claim features are complete unless their acceptance criteria pass.
13. Use feature flags for incomplete integrations.
14. Maintain a polished demo path even if broader integrations are unfinished.
15. The final product must be demonstrably educational, not merely a productivity dashboard or generic chatbot.

---

# 1. Hackathon Source of Truth

## 1.1 Event identity

The **Prometheus July AI Challenge** is an online, public AI/ML hackathon intended for students and focused on building an educational tool powered by AI or machine learning.

At the time this PRD was researched:

- The Devpost page showed **277 participants**. This count is dynamic.
- The event was marked:
  - Online
  - Public
  - Beginner Friendly
  - Design
  - Machine Learning/AI
- Featherless.ai was shown as the hackathon sponsor.
- The total listed cash prize pool was **$1,500**, plus certificates and other unspecified prizes.

Official pages:

- Overview: https://prometheus-july-ai-challenge.devpost.com/
- Rules: https://prometheus-july-ai-challenge.devpost.com/rules

## 1.2 Eligibility

The official overview states:

- Participants must be **13 years of age or older**.
- Participants must be **students**.
- Companies and professional organizations are excluded.
- Participation is open internationally except for standard excluded countries or territories.
- A participant may work alone.
- Teams may contain up to **four people**.

Before submission, ensure every team member:

- is eligible;
- is registered on Devpost;
- is added to the submitted project;
- has completed any organizer registration form required on the overview page.

The overview currently links an additional Google registration form. Confirm completion before submission.

## 1.3 Dates and deadline

The official pages contain inconsistent wording:

- The overview/header displays: **July 30, 2026 at 11:45 p.m. EDT**.
- That converts to **July 31, 2026 at 9:15 a.m. IST**.
- The rules body says projects should be submitted on July 30 by 11:59 p.m. and explicitly states that there will be no extensions.
- The rules page says the challenge starts July 17.
- The originality clause describes the coding window as July 8–July 30, which conflicts with the stated July 17 start.

### Required internal interpretation

Use the safest interpretation:

- Treat the official challenge period as beginning **July 17, 2026**.
- Ensure all core application logic submitted for judging was created during the permitted window and can be demonstrated through Git history.
- Do not rely on the later 11:59 p.m. wording.
- Complete the final Devpost submission before **July 31, 2026 at 9:15 a.m. IST**, with an internal target at least several hours earlier.
- Preserve commit timestamps and a development log.

## 1.4 What must be built

The challenge asks participants to build an **educational tool** that uses AI or machine learning to improve how people:

- learn;
- teach;
- understand;
- access;
- engage with; or
- personalize information and knowledge.

For this project, the educational outcome must remain visible in every primary user journey. Cross-assistant memory, model routing, scheduling, and research tooling are supporting mechanisms for better learning and academic execution—not the final educational value by themselves.

## 1.5 Submission requirements

The official listing requires:

- a working prototype;
- source code, such as a GitHub repository;
- a demonstration video no longer than **two minutes**.

Judges will not evaluate content after the two-minute mark. Therefore:

- final video duration target: **1:50–1:57**;
- no lengthy logo sequence;
- show the product operating immediately;
- demonstrate the educational problem, intelligence, technical depth, and outcome;
- captions must be readable;
- avoid relying on narration alone;
- never show broken or loading states.

## 1.6 Originality requirement

The rules require the core application logic to be newly created during the event window. Open-source libraries and pretrained AI models are permitted and encouraged.

Accordingly:

- Do not reuse Study Assist or another existing product as the submission codebase.
- Fresh scaffolding, domain logic, workflows, UI, data model, and integration code must be created for this submission.
- Standard libraries, frameworks, SDKs, pretrained models, UI primitives, and open educational resources may be used subject to their licenses.
- Keep a `THIRD_PARTY.md` or equivalent attribution file.
- Keep a `BUILD_LOG.md` showing major development milestones.

## 1.7 Prizes

The official listing gives:

- **1st place:** $1,000 cash and certificate
- **2nd place:** $400 cash and certificate
- **3rd place:** $100 cash and certificate
- **4th and 5th places:** special certificate
- **6th–10th places:** honorable-mention certificate

The overview UI uses singular “winner” labels in places where the rank grouping implies multiple placements. Treat the written rank descriptions as the intended award structure and verify again before submission.

## 1.8 Judges shown on the overview

The Devpost overview lists the following judges at the time of research:

- Sidhaanth Kapoor — Co-Founder of Prometheus
- Soumitra Mehrotra
- Gayathri Chilukala
- Sunil Kumar Paidi
- Nanda Kishore Kande
- Saylee Mhatre
- Sri Laasya
- Khush Patel
- Sohail Shaikh
- Nilesh D
- Mandar Chaudhari
- Divyaraj Singh Jatav

Judge membership may change. Do not design the product around assumptions about an individual judge.

## 1.9 Judging criteria

The judging system contains four equally weighted criteria.

### Educational Impact — 25 points

Judges assess whether the product addresses a genuine educational problem and materially helps a user learn, teach, or understand.

**How Continuum earns this score:**

- Diagnoses what a learner does not understand before teaching.
- Builds goal-specific, curriculum-aware plans.
- Measures demonstrated mastery rather than passive activity.
- Connects research and learning to real completion outcomes.
- Reduces repeated setup and context loss across AI tools.
- Uses authoritative existing resources when they are stronger than generated alternatives.

### Creative Use of AI/ML — 25 points

Judges assess whether AI is essential, meaningful, and intelligently integrated rather than added superficially.

**How Continuum earns this score:**

- Maintains a persistent learner/project memory graph.
- Retrieves only task-relevant context.
- Routes tasks to models based on modality, complexity, cost, and reliability.
- Uses independent verification for high-risk academic outputs.
- Diagnoses misconceptions and adapts future learning.
- Exposes the same academic state to Claude and ChatGPT through MCP.
- Converts unstructured academic activity into structured progress events.

### Technical Execution — 25 points

The rules page calls this **Technical Execution**. The overview contains a likely typo, “Technical Education,” but its description clearly evaluates execution.

Judges consider:

- functionality;
- stability;
- code quality;
- interface quality;
- intuitive use;
- overall user experience.

**How Continuum earns this score:**

- A functional standalone application.
- A real remote MCP server with authenticated tools.
- Typed structured memory and task schemas.
- Deterministic scheduling logic.
- Traceable citations and evidence links.
- Graceful model fallbacks.
- Visible routing/audit information.
- A polished, coherent demo rather than many disconnected mock screens.

### Pitch and Demo — 25 points

Judges assess whether the team clearly communicates the product’s purpose and operation in an engaging two-minute video.

**How Continuum earns this score:**

- Open with the universal problem: every AI chat starts from zero and study tools do not know what the student must finish.
- Show one concise end-to-end student story.
- Demonstrate both the standalone product and Claude/ChatGPT continuity.
- End with a measurable transformation: from fragmented resources and forgotten context to an evidence-backed plan and verified progress.

## 1.10 Copyright note about the listing

This PRD includes a complete, faithful **paraphrase and operational extraction** of the relevant overview and rules. It does not reproduce the entire Devpost listing word-for-word. The official Devpost pages remain the legal and operational source of truth and must be reviewed again before final submission.

---

# 2. Product Overview

## 2.1 One-line definition

**Continuum is a user-owned academic operating system that remembers a learner’s goals, knowledge, research, evidence, schedule, and completed work; then uses that context across its own adaptive-learning app, Claude, ChatGPT, and other MCP-compatible assistants.**

## 2.2 Product promise

> **One academic memory that follows you across every AI tool—and turns that memory into the next best action.**

## 2.3 Core thesis

Students do not primarily lack content. They lack:

- continuity across tools;
- trustworthy context;
- diagnosis before explanation;
- a realistic path from goal to completion;
- scheduling that adapts when real life changes;
- evidence that they actually learned;
- a reliable way to resume complex work;
- visibility into what AI knows, assumes, or cannot support.

Most AI education products generate answers, notes, flashcards, summaries, or plans. Continuum must instead close the gap between:

> “I worked on this”  
> and  
> “I can independently use it, and I know what to do next.”

## 2.4 Strategic differentiation

Continuum is not:

- another “upload a PDF and chat” product;
- a generic AI tutor;
- an AI calendar;
- an Obsidian wrapper;
- a model comparison website;
- a thesis-writing bot;
- a platform that duplicates already excellent educational resources.

It is the orchestration and continuity layer connecting:

1. **Goals**
2. **Knowledge**
3. **Evidence**
4. **Research**
5. **Tasks**
6. **Time**
7. **External resources**
8. **AI assistants**
9. **Specialist models**
10. **Verified outcomes**

## 2.5 Product surfaces

Continuum has four complementary surfaces.

### A. Standalone web application

The complete product for users who want a dedicated learning and research environment.

Contains:

- onboarding;
- goals;
- adaptive learning;
- knowledge map;
- research library;
- scheduler;
- daily plan;
- progress;
- model routing;
- memory management;
- integrations;
- audit trail.

### B. Remote MCP server

A publicly reachable, authenticated MCP server that users connect to supported assistants.

Primary hosts:

- Claude consumer app;
- ChatGPT through an MCP-backed ChatGPT app/plugin;
- Claude Desktop;
- Claude mobile where supported;
- Claude Science where compatible;
- Claude Code;
- Codex;
- other MCP-compatible clients.

The MCP server gives assistants access to the user’s Continuum context and approved tools. It does not proxy or share the user’s Claude or ChatGPT subscription.

### C. Obsidian companion plugin

A local plugin that synchronizes selected durable academic memory between the user’s Continuum account and an Obsidian vault.

Obsidian is the user-owned, human-readable knowledge layer, not the operational source of truth.

### D. External-resource broker

A curated layer that directs users to authoritative or genuinely better existing resources, such as:

- official exam practice;
- open textbooks;
- interactive simulations;
- course materials;
- paper databases;
- NotebookLM workflows;
- videos or tools that satisfy a specific learning need better than generated content.

---

# 3. Users and Jobs to Be Done

## 3.1 Primary persona: school student

Examples:

- CBSE Grade 12 student preparing for board assessments.
- SAT or entrance-exam candidate.
- Student juggling school, projects, extracurriculars, and tests.

Jobs:

- “Tell me what I should study today based on my actual deadlines and weaknesses.”
- “Teach me at the correct board and grade level.”
- “Do not give me the answer before checking what I know.”
- “Remember my mistakes across sessions.”
- “Send me to official practice when it is better than AI-generated questions.”
- “Adapt the schedule when I miss a session.”

## 3.2 Secondary persona: university student

Jobs:

- “Turn a syllabus and lecture material into an executable study path.”
- “Track prerequisites and mastery across a semester.”
- “Explain at university depth.”
- “Help me understand, not merely summarize.”
- “Keep papers, notes, assignments, and deadlines connected.”

## 3.3 Researcher or thesis student

Jobs:

- “Remember the current research question, decisions, and rejected approaches.”
- “Find the evidence behind a claim.”
- “Separate direct evidence, inference, and speculation.”
- “Track papers, methods, datasets, experiments, and unresolved questions.”
- “Resume work through Claude or ChatGPT without restating the project.”
- “Turn research milestones into a flexible daily execution plan.”

## 3.4 Teacher or mentor — future persona

Jobs:

- “Understand where a learner is struggling.”
- “Assign targeted resources.”
- “Review evidence of mastery.”
- “Create curriculum-aligned activities.”
- “Avoid exposing private student data.”

Teacher dashboards are not required for the hackathon MVP.

---

# 4. Product Principles

1. **Diagnose before teaching.**
2. **Demonstrated mastery beats perceived confidence.**
3. **Retrieve context; do not resend history.**
4. **Evidence outranks model fluency.**
5. **Use existing authoritative resources when they are better.**
6. **Plans must survive real life.**
7. **Deterministic systems decide constraints; models explain and assist.**
8. **The user owns and can export their knowledge.**
9. **Every important state change is traceable.**
10. **One backend, many AI interfaces.**
11. **Models are replaceable tools, not the product.**
12. **Writing actions require more trust than reading actions.**
13. **The experience must help students think, not outsource thinking.**
14. **The MVP should feel deep, not broad and hollow.**

---

# 5. Goals and Non-Goals

## 5.1 Hackathon goals

- Ship a functioning standalone app.
- Demonstrate a persistent academic memory.
- Demonstrate adaptive planning tied to a real goal.
- Demonstrate source-grounded retrieval.
- Demonstrate meaningful model routing.
- Expose core context and actions through a real remote MCP endpoint.
- Connect the MCP to at least Claude during development.
- Build the ChatGPT-compatible MCP/Apps SDK contract and demonstrate it where account access permits.
- Show an educational flow with measurable mastery or task progress.
- Produce a stable two-minute demo.

## 5.2 Long-term goals

- Support school curricula, entrance exams, university courses, professional learning, and research.
- Become the cross-assistant continuity layer for academic work.
- Provide user-owned export through Obsidian and standard formats.
- Support scalable model routing and bring-your-own-provider options.
- Build a trusted resource and curriculum registry.
- Develop rigorous learning and retention analytics.

## 5.3 Non-goals for the hackathon

- Complete coverage of every board, grade, exam, university, and profession.
- Full automatic Obsidian bidirectional conflict resolution.
- Writing a thesis on the user’s behalf.
- Replacing Zotero as a citation manager.
- Replacing Bluebook, Khan Academy, NotebookLM, OpenStax, PhET, or institutional LMS products.
- Building a native mobile app.
- Building a social network.
- Building teacher administration.
- Training a foundation model.
- Implementing billing.
- Perfect long-term spaced-repetition science.
- Automatically making irreversible calendar changes without confirmation.

---

# 6. Core Product System

## 6.1 The academic state model

Continuum maintains a structured, evolving representation of:

- who the user is;
- what the user wants to accomplish;
- what the user knows;
- what the user has done;
- what sources support their work;
- what remains unresolved;
- what time is available;
- what action should occur next.

The system should not rely on one giant profile prompt.

State is divided into:

### Profile state

- education level;
- board/institution;
- courses;
- exams;
- timezone;
- availability preferences;
- accessibility preferences;
- preferred explanation styles;
- consent settings;
- connected services.

### Goal state

- desired outcome;
- deadline;
- success metric;
- milestones;
- dependencies;
- risk;
- progress;
- current blocker;
- next actions.

### Learning state

- concept;
- exposure;
- understanding;
- transfer;
- retention;
- misconception;
- confidence;
- evidence;
- last practiced;
- recommended intervention.

### Project state

- purpose;
- current phase;
- accepted decisions;
- superseded decisions;
- milestones;
- tasks;
- artifacts;
- blockers;
- activity history.

### Research state

- papers;
- notes;
- claims;
- evidence passages;
- support status;
- contradictions;
- methods;
- datasets;
- unresolved questions;
- citation metadata.

### Execution state

- calendar constraints;
- task estimates;
- energy needs;
- study blocks;
- completion evidence;
- missed work;
- replanning history.

---

# 7. Functional Requirements

## 7.1 Onboarding and goal creation

### P0 requirements

The user must be able to create an account and select a primary goal type:

- school subject or curriculum;
- competitive/entrance exam;
- university course;
- research paper or thesis;
- learn-anything project.

The onboarding flow captures:

- goal title;
- target date;
- target outcome;
- current level;
- available weekly time;
- fixed commitments;
- relevant curriculum or sources;
- preferred mode of help.

The system generates:

- a concise goal definition;
- milestone graph;
- initial tasks;
- initial diagnostic or research intake;
- first daily plan.

### Acceptance criteria

- New user reaches a useful dashboard in under five minutes.
- User can edit every inferred field.
- Goal creation does not require uploading a file.
- The system marks uncertain assumptions visibly.
- Generated tasks are stored as structured records.

---

## 7.2 Adaptive learning workspace

### Core modes

#### Diagnostic mode

The platform asks a small number of high-information questions before beginning a lesson.

It attempts to identify:

- missing prerequisites;
- conceptual confusion;
- procedural weakness;
- recall gap;
- notation error;
- misreading;
- overconfidence;
- inability to transfer knowledge.

#### Tutor mode

Teaching styles:

- intuition;
- formal derivation;
- Socratic questioning;
- worked example;
- board/exam style;
- university depth;
- rapid revision;
- teach-back;
- guided practice.

#### Arena mode

Assessment modes:

- adaptive questions;
- numericals;
- short answers;
- essays;
- coding;
- oral/viva-style questioning;
- source analysis;
- unseen transfer problems.

#### Knowledge map

Concept nodes show:

- not started;
- exposed;
- understood;
- practicing;
- mastered;
- decaying;
- misconception detected.

Mastery must not be represented by one opaque percentage alone.

### P0 hackathon implementation

Implement one polished learning domain:

- recommended: **CBSE Class 12 Physics — Electrostatic Potential and Capacitance**, because it supports concepts, derivations, numericals, misconceptions, and visual interactions.

Required demo flow:

1. User states exam goal.
2. System performs a short diagnostic.
3. System identifies a specific misconception.
4. Knowledge state updates.
5. Tutor provides targeted instruction.
6. User answers an unseen question.
7. Mastery state changes.
8. Scheduler incorporates the next review.

### Acceptance criteria

- Diagnostic output is schema-valid.
- The app explains why it selected the intervention.
- The system does not mark mastery based only on reading or watching.
- A later independent question is required for transfer.
- The lesson cites the curriculum source or user source when source-locked mode is enabled.

---

## 7.3 Curriculum and scope engine

The long-term system must support:

- board;
- country;
- grade;
- course;
- subject;
- chapter;
- learning outcome;
- prerequisite;
- assessment pattern;
- terminology;
- permitted formulae or methods;
- official resources.

### Hackathon scope

Seed one curriculum slice manually and support generic ingestion for one additional curriculum document.

Data schema:

```ts
interface CurriculumNode {
  id: string;
  authority: string;
  boardOrInstitution: string;
  level: string;
  subject: string;
  unit?: string;
  topic: string;
  outcomes: string[];
  prerequisites: string[];
  assessmentForms: string[];
  sourceIds: string[];
  version: string;
}
```

### Requirements

- A model may assist extraction.
- A human-review flag must exist.
- Version and source must be recorded.
- Curriculum memory must not be silently overwritten by model output.

---

## 7.4 Source-grounded knowledge vault

Users can create workspaces containing:

- textbooks;
- syllabus documents;
- notes;
- papers;
- lecture files;
- web references;
- generated summaries;
- personal observations.

### Required functions

- upload source;
- parse metadata;
- chunk;
- embed;
- retrieve;
- cite exact passages;
- ask source-locked questions;
- compare sources;
- label unsupported claims;
- preserve source version and hash.

### Evidence states

Every generated factual claim should be capable of carrying:

- `direct_support`;
- `indirect_support`;
- `model_inference`;
- `user_hypothesis`;
- `contradicted`;
- `unverified`.

### P0

- PDF/text upload.
- Chunked retrieval.
- Exact source title and passage reference.
- “Answer only from sources” switch.
- At least one comparison between two retrieved passages.

### Non-negotiable behavior

When no supporting passage exists, the system must say so instead of fabricating a citation.

---

## 7.5 Research workspace

### Research objects

- paper;
- author;
- DOI;
- collection;
- note;
- claim;
- evidence;
- method;
- dataset;
- experiment;
- result;
- limitation;
- unresolved question;
- decision;
- artifact.

### Claim ledger

Each research claim stores:

```ts
interface ResearchClaim {
  id: string;
  projectId: string;
  text: string;
  status:
    | "directly_supported"
    | "indirectly_supported"
    | "contradicted"
    | "unverified"
    | "user_hypothesis";
  evidenceIds: string[];
  sourceIds: string[];
  createdBy: "user" | "assistant" | "import";
  verificationModel?: string;
  supersedesId?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Required workflows

- add paper manually;
- connect/import Zotero later;
- create a note from a passage;
- create a claim linked to evidence;
- compare papers;
- store unresolved questions;
- turn next research steps into tasks;
- expose project context through MCP.

### P0 hackathon demonstration

Use a compact sample project resembling a methods paper:

- project goal;
- three papers;
- two evidence-backed claims;
- one unresolved methodological question;
- one accepted decision;
- next task;
- retrieval from Claude through MCP.

### Academic-integrity constraint

The system may:

- help find and interpret sources;
- critique reasoning;
- structure work;
- generate questions;
- help revise user-written material;
- verify support.

The system must not present ghostwritten, unsupported work as the user’s original scholarship.

---

## 7.6 Persistent memory engine

### Memory types

1. Profile memory
2. Learning memory
3. Project memory
4. Research memory
5. Execution memory
6. Episodic checkpoint memory

### Event-first architecture

All meaningful actions are first represented as immutable events.

Example:

```json
{
  "id": "evt_01",
  "userId": "usr_01",
  "type": "learning.assessment.completed",
  "goalId": "goal_sat",
  "entityId": "concept_linear_equations",
  "timestamp": "2026-07-18T14:30:00+05:30",
  "payload": {
    "result": "incorrect",
    "errorType": "sign_error",
    "confidenceBefore": 0.8,
    "difficulty": 0.55
  },
  "source": {
    "surface": "standalone_app",
    "model": "provider/model",
    "sessionId": "session_01"
  }
}
```

Materialized views derive:

- current mastery;
- current goal progress;
- latest accepted decision;
- active schedule;
- current research state.

### Memory write policy

Do not save every conversational sentence.

Save only:

- explicit user facts with consent;
- accepted decisions;
- completed work;
- assessment results;
- confirmed preferences;
- meaningful project updates;
- evidence-backed research notes;
- unresolved questions;
- concise session checkpoints.

### Memory conflict handling

- New memories can supersede old memories.
- Never delete history when a decision changes.
- Current state points to the latest accepted record.
- Users can inspect, correct, or delete memories.
- Model-generated memory must be labeled.
- High-impact inferred memories require user confirmation.

### Context packing

Before a model call, a context assembler selects only:

- current objective;
- relevant goal state;
- relevant mastery nodes;
- latest decisions;
- top evidence passages;
- immediate schedule constraints;
- output schema;
- token budget.

It must not send the entire account history.

---

## 7.7 Obsidian integration

### Architectural rule

Obsidian is a synchronized, user-owned representation of durable knowledge. It is not the live operational database used by the scheduler or MCP.

### Why

- Obsidian vaults are local folders of Markdown files.
- Its official plugin API can access files visible in the vault.
- Remote Claude and ChatGPT hosts cannot directly read a local vault.
- The MCP therefore queries Continuum’s cloud state.
- A local plugin synchronizes approved notes between Continuum and Obsidian.

### Plugin functions

- authenticate to Continuum;
- choose folders;
- preview changes;
- pull created/updated notes;
- push approved edits;
- map frontmatter to Continuum entities;
- resolve conflicts;
- preserve backlinks;
- show sync status;
- allow one-way mode.

### Suggested vault structure

```text
Continuum/
  Profile/
  Goals/
  Learning/
  Projects/
  Research/
    Papers/
    Claims/
    Questions/
  Daily/
  Decisions/
```

### Example synced note

```md
---
continuum_id: decision_42
type: project-decision
project: OASIS
status: accepted
updated: 2026-07-18
sources:
  - source_11
---

# Validation decision

Use patient-grouped held-out validation rather than random patch splitting.

## Reason

Random patch splitting risks leakage between samples belonging to the same patient.

## Next actions

- Implement grouped validation
- Recalculate metrics
- Update limitations
```

### Hackathon scope

P1, not required for P0 live demo.

For MVP:

- generate export-ready Markdown;
- show a mocked or working local plugin proof;
- avoid spending core build time on complex bidirectional synchronization.

---

## 7.8 Flexible scheduler and execution engine

### Principle

The LLM may interpret goals and estimate tasks, but deterministic optimization schedules them.

### Inputs

- fixed calendar events;
- sleep;
- school/work blocks;
- deadlines;
- task dependencies;
- estimated duration;
- minimum/maximum block duration;
- energy demand;
- task priority;
- uncertainty;
- preferred times;
- spaced review;
- travel/buffer;
- missed sessions.

### Task schema

```ts
interface AcademicTask {
  id: string;
  goalId: string;
  title: string;
  description?: string;
  status: "backlog" | "planned" | "in_progress" | "blocked" | "done";
  estimatedMinutes: number;
  uncertaintyMinutes?: number;
  deadline?: string;
  priority: number;
  energyRequired: "low" | "medium" | "high";
  dependencies: string[];
  minimumBlockMinutes: number;
  maximumBlockMinutes: number;
  splittable: boolean;
  completionEvidence?: string;
  resourceIds: string[];
}
```

### Scheduling behavior

The optimizer should:

- satisfy hard constraints;
- minimize deadline risk;
- respect dependencies;
- reduce unnecessary context switching;
- place high-energy work in suitable periods;
- preserve buffer;
- maintain continuity;
- insert review;
- replan after misses;
- explain what changed.

### Completion evidence

A task is not necessarily complete because the user checked a box.

Examples:

- learning task: pass a checkpoint;
- research task: save evidence or artifact;
- practice task: submit results;
- writing task: attach a draft;
- administrative task: explicit confirmation is sufficient.

### P0 scheduler

Implement:

- availability input;
- fixed commitments;
- task durations;
- deadline;
- priority;
- dependency;
- flexible daily plan;
- missed-task replan;
- confirmation before calendar write.

OR-Tools CP-SAT is the preferred solver, but a deterministic heuristic is acceptable for the hackathon if CP-SAT threatens delivery. Keep the scheduler interface replaceable.

### Google Calendar integration

P1:

- OAuth;
- read free/busy;
- create proposed blocks;
- update after confirmation;
- reconcile external edits;
- never expose tokens to model providers.

---

## 7.9 Resource broker

### Principle

The platform should not regenerate inferior versions of excellent resources merely to retain attention.

### Resource registry fields

```ts
interface LearningResource {
  id: string;
  title: string;
  provider: string;
  authority:
    | "official"
    | "institutional"
    | "peer_reviewed"
    | "expert_curated"
    | "community"
    | "generated";
  cost: "free" | "paid" | "subscription";
  level: string[];
  curriculumTags: string[];
  topicTags: string[];
  formats: string[];
  url: string;
  embedAllowed: boolean;
  deepLinkAllowed: boolean;
  accessibility?: string[];
  qualityScore: number;
  lastReviewedAt: string;
}
```

### Selection factors

- user goal;
- topic;
- current mastery;
- authority;
- format preference;
- cost;
- time available;
- accessibility;
- licensing;
- region;
- freshness;
- whether the resource gives a better outcome than native generation.

### Examples

- Official SAT testing and practice should be preferred for full official simulations.
- Open textbooks can be used for stable foundational content.
- Interactive simulations can be selected for physical intuition.
- NotebookLM can be offered as an optional external source-exploration workflow rather than treated as an undocumented backend API.

### NotebookLM policy

- Do not automate the consumer product through unsupported methods.
- Allow users to export a learning/research pack for upload.
- Allow curated public notebook links where appropriate.
- Build source-grounded native capabilities independently.

### P0

Create a curated registry for the demo topic and one exam workflow. Show the system choosing between:

- native tutor;
- uploaded source;
- external official resource;
- simulation.

Explain why it selected the resource.

---

## 7.10 Model router

### Purpose

Route each AI task to the lowest-cost model or deterministic tool that can meet the required quality, modality, latency, context, and reliability.

### Provider adapters

Initial adapters:

- Featherless.ai
- Groq
- Gemini API
- DeepSeek API
- optional OpenRouter fallback
- optional user-provided keys later

The architecture must not assume a named model will remain available.

### Route decision sequence

1. Can deterministic code perform the task?
2. Is retrieval required?
3. What modality is present?
4. What minimum context is required?
5. What output schema is required?
6. Is strong reasoning required?
7. Is the task high-stakes or research-critical?
8. Is independent verification required?
9. Which providers are available and within budget?
10. Which candidate passed internal evaluation for this task class?

### Task classes

- classification;
- extraction;
- summarization;
- lesson generation;
- quiz generation;
- misconception diagnosis;
- mathematical reasoning;
- code reasoning;
- research synthesis;
- citation entailment;
- image understanding;
- document understanding;
- plan explanation;
- conversational support.

### Example policy

```yaml
classification:
  prefer: small_fast
  max_latency_ms: 2500
  verify: false

lesson_generation:
  prefer: mid_reasoning
  retrieval_required: true
  verify_if_source_locked: true

citation_entailment:
  prefer: strong_reasoning
  retrieval_required: true
  independent_verifier: true

image_understanding:
  require: multimodal

schedule_optimization:
  provider: deterministic
```

### Escalation

- Start with the cheapest qualified route.
- Validate output.
- If validation fails or confidence is below threshold, escalate.
- High-stakes outputs use a different verifier model/provider.
- Do not ask a model to evaluate its own answer in the same context and treat that as independent validation.

### Token-saving requirements

- retrieve only relevant chunks;
- use structured state;
- cache source summaries;
- cache stable system context;
- deduplicate documents by content hash;
- avoid sending tool results twice;
- use compact IDs and schemas;
- summarize completed sessions into checkpoints;
- do not include irrelevant memories;
- use deterministic tools wherever possible.

### User visibility

The app should expose a compact “Why this route?” panel showing:

- selected model/tool;
- reason;
- source mode;
- verification status;
- approximate token/cost class;
- fallback used.

Do not overwhelm normal users with raw infrastructure details.

### Featherless sponsor leverage

Use Featherless meaningfully in the demo, preferably for:

- a specialist reasoning task;
- a model-routing comparison;
- a verifier;
- a fallback.

Do not make the product a superficial sponsor wrapper. Demonstrate why routing through Featherless improves cost or quality.

---

## 7.11 Standalone assistant

The standalone app must work even when the user does not connect Claude or ChatGPT.

### Required capabilities

- chat/command bar;
- adaptive tutor;
- goal context;
- memory retrieval;
- research search;
- task creation;
- plan explanation;
- source-grounded answers;
- model routing;
- progress recording.

### Interaction contract

Every assistant response may include:

- concise answer;
- sources;
- next action;
- memory used;
- mastery impact;
- task impact;
- route information.

The user can disable memory writes for a session.

---

# 8. MCP Product Requirements

## 8.1 Purpose

The remote MCP server allows Claude, ChatGPT, and compatible hosts to use Continuum as the shared academic context, memory, evidence, and execution layer.

The user talks to the assistant they already prefer. The assistant calls Continuum when it needs:

- project context;
- academic memory;
- papers;
- claims;
- goals;
- schedule;
- mastery state;
- resource recommendations;
- actions.

## 8.2 Host support strategy

### Claude

Anthropic currently supports custom remote MCP connectors across Claude surfaces and plan types, subject to beta limitations. The server must be publicly reachable over HTTPS and use secure authentication.

### ChatGPT

Build an MCP-backed ChatGPT app using the OpenAI Apps SDK and standard MCP Apps conventions. Public consumer availability depends on OpenAI’s app/plugin review and distribution process. Private developer-mode support and write-capable custom MCP access vary by plan/workspace.

### Claude Science

Use the same MCP server where the host accepts custom connectors. Do not hard-code around beta-only behavior. Research records should be retrievable and writable through standard tools.

### Claude Code and Codex

These are supported secondary surfaces. They should use the same data contracts, not a separate developer-only memory system.

## 8.3 Authentication

- OAuth 2.1-style authorization flow suitable for remote MCP.
- PKCE where applicable.
- Per-user access tokens.
- Short-lived access tokens.
- Refresh-token rotation.
- Revocation.
- Explicit scopes.
- Host/client identification.
- No provider token passthrough.
- No shared user sessions.

Suggested scopes:

```text
memory:read
memory:write
goals:read
goals:write
learning:read
learning:write
research:read
research:write
schedule:read
schedule:propose
schedule:commit
resources:read
routing:invoke
```

## 8.4 MCP tools

Keep the initial tool set compact and understandable.

### Read tools

#### `get_current_context`

Returns:

- active goals;
- imminent deadlines;
- today’s plan;
- current blockers;
- recent accepted decisions;
- relevant learning state;
- recommended next actions.

Arguments:

```ts
{
  focus?: string;
  maxTokens?: number;
}
```

#### `search_academic_memory`

Arguments:

```ts
{
  query: string;
  types?: string[];
  goalId?: string;
  projectId?: string;
  limit?: number;
}
```

Returns compact records with IDs, dates, sources, and confidence.

#### `get_goal_state`

Returns:

- goal;
- milestones;
- dependencies;
- progress;
- risk;
- blockers;
- next actions.

#### `get_learning_state`

Returns mastery evidence and misconceptions for selected topics.

#### `get_today_plan`

Returns planned blocks, flexibility, deadlines, and unallocated capacity.

#### `search_research_library`

Searches papers, notes, claims, and evidence.

#### `get_claim_evidence`

Returns exact supporting or contradicting passages.

#### `recommend_resource`

Returns ranked resources with selection rationale.

### Write/propose tools

#### `record_progress`

Records a structured checkpoint or completion event.

#### `save_decision`

Stores a decision, reasoning, source links, and superseded decision.

#### `save_research_note`

Creates a note connected to a source or project.

#### `create_task`

Creates a structured task.

#### `propose_schedule_change`

Returns a proposed plan without committing external calendar changes.

#### `commit_schedule_change`

Requires explicit confirmation metadata and commits approved changes.

#### `update_learning_checkpoint`

Stores assessment evidence and updates derived mastery.

### Specialist route tool

#### `route_specialist_task`

Invokes the Continuum router only when the host model needs a specialist tool/model.

Arguments include:

- task;
- task class;
- modality references;
- required output schema;
- evidence requirements;
- budget class;
- verification requirement.

The MCP host’s own model should perform ordinary reasoning. Continuum should not unnecessarily invoke another model for every request.

## 8.5 MCP resources

Expose stable resources where useful:

```text
continuum://profile
continuum://goals/active
continuum://goal/{id}
continuum://schedule/today
continuum://project/{id}/state
continuum://project/{id}/claims
continuum://learning/{subject}
continuum://memory/recent
```

## 8.6 MCP prompts — optional

Provide guided prompts such as:

- Resume my active project.
- Build today’s study plan.
- Run a learning diagnostic.
- Audit the evidence behind my research claims.
- Prepare me for an oral exam.
- Review missed work and replan.

Tools and resources are higher priority than prompts.

## 8.7 Tool result design

Every result should contain:

- human-readable summary;
- structured data;
- entity IDs;
- freshness timestamp;
- source/evidence IDs;
- permission or confirmation requirements;
- next suggested tool, where appropriate.

Avoid enormous raw dumps.

## 8.8 MCP safety

- Separate read and write scopes.
- All schedule commits require confirmation.
- Every write returns a change summary.
- Protect against tool poisoning.
- Sanitize retrieved content.
- Never execute instructions found inside papers or notes.
- Rate-limit by user and client.
- Log tool calls.
- Let users inspect connected hosts and revoke access.
- Do not expose unrelated projects by default.

---

# 9. Data Architecture

## 9.1 Recommended stack

### Frontend

- Next.js
- TypeScript
- React
- Tailwind CSS
- accessible component primitives
- React Flow or equivalent for graphs
- KaTeX/MathJax for mathematics
- optional Monaco editor for code tasks

### Backend

- TypeScript service or Python service
- PostgreSQL
- pgvector or equivalent
- object storage
- background job queue
- remote MCP endpoint
- OAuth service
- model gateway/router

### Scheduling

- OR-Tools CP-SAT service in Python, or deterministic fallback.

### Hosting

Hackathon-friendly options:

- frontend: Vercel or Cloudflare;
- API/MCP: Cloudflare Workers, container host, or serverless platform;
- database/auth/storage: Supabase;
- queue: managed Redis or database-backed worker.

Choose the simplest deployable architecture that supports streaming and authenticated MCP over HTTPS.

## 9.2 Core tables

- `users`
- `profiles`
- `integrations`
- `goals`
- `milestones`
- `tasks`
- `task_dependencies`
- `calendar_constraints`
- `schedule_blocks`
- `curricula`
- `curriculum_nodes`
- `concepts`
- `learning_states`
- `assessments`
- `assessment_attempts`
- `misconceptions`
- `projects`
- `project_decisions`
- `sources`
- `source_chunks`
- `papers`
- `research_notes`
- `research_claims`
- `claim_evidence`
- `artifacts`
- `memory_events`
- `memory_records`
- `model_routes`
- `model_usage`
- `audit_log`
- `oauth_clients`
- `oauth_tokens`

## 9.3 ID and version rules

- Use stable opaque IDs.
- Include `created_at`, `updated_at`, and `version`.
- Soft-delete user-editable records.
- Preserve immutable events.
- Hash source files.
- Store source version and parser version.
- Store model/provider and prompt version for generated records.

---

# 10. User Experience

## 10.1 Primary navigation

1. **Today**
2. **Goals**
3. **Learn**
4. **Research**
5. **Memory**
6. **Integrations**
7. **Activity**

## 10.2 Today screen

Must answer:

- What should I do now?
- Why is this the priority?
- How long will it take?
- What happens if I skip it?
- Which resource should I use?
- How will completion be verified?

Components:

- current focus card;
- schedule timeline;
- upcoming deadline risk;
- flexible blocks;
- quick replan;
- progress capture;
- “Ask Continuum” command.

## 10.3 Goal workspace

Components:

- goal outcome;
- deadline;
- readiness/progress;
- milestone graph;
- blockers;
- next action;
- evidence;
- related resources;
- recent activity.

## 10.4 Learn workspace

Components:

- topic map;
- diagnostic;
- tutor panel;
- source panel;
- interactive activity;
- checkpoint;
- misconception explanation;
- mastery dimensions.

## 10.5 Research workspace

Components:

- project state;
- paper library;
- claim ledger;
- evidence viewer;
- unresolved questions;
- decisions;
- next experiment/task;
- assistant/MCP activity.

## 10.6 Memory screen

Users can:

- search memory;
- filter by type;
- view source;
- correct;
- mark obsolete;
- delete;
- export;
- inspect which memory was used in a response.

## 10.7 Integrations screen

Cards:

- Claude connector
- ChatGPT app
- Obsidian
- Zotero
- Google Calendar
- model providers
- NotebookLM export

Each card shows:

- connected state;
- scopes;
- last sync;
- revoke;
- setup instructions;
- data shared.

## 10.8 Activity screen

Show:

- tool calls;
- memory reads/writes;
- model routes;
- schedule changes;
- source ingestion;
- errors;
- cost/token class.

---

# 11. Hackathon MVP

## 11.1 P0 — must function in the judged demo

### Product

- Account or demo-user login.
- One real goal.
- One polished “Today” plan.
- One adaptive learning topic.
- One research project.
- Persistent structured memory.
- Source upload and cited retrieval.
- Model router with at least two meaningful routes.
- Remote MCP server.
- Claude connection demonstrated.
- ChatGPT-compatible Apps SDK/MCP implementation demonstrated where available.
- Safe write/propose workflow.
- Stable deployed URL.
- Public source repository.
- Two-minute demo.

### Recommended demo data

#### Learning goal

“Prepare for a CBSE Class 12 Physics assessment on Electrostatic Potential and Capacitance.”

Include:

- diagnostic;
- potential vs potential-energy misconception;
- targeted explanation;
- unseen numerical or conceptual transfer problem;
- mastery update;
- schedule update.

#### Research goal

“Complete a methods paper on cross-marker spatial association in serial H-DAB tissue sections.”

Include:

- project state;
- papers;
- claim/evidence link;
- methodological decision;
- unresolved question;
- next task;
- MCP retrieval in Claude.

### Routing demonstration

- Small/fast model or deterministic route for classification.
- Stronger Featherless-hosted model for a specialist reasoning or verification task.
- Gemini or other multimodal route only if image/PDF understanding is shown.
- Display route rationale.

## 11.2 P1 — build if P0 is stable

- Google Calendar read/free-busy.
- Calendar write after confirmation.
- Zotero import.
- Obsidian Markdown export or plugin proof.
- ChatGPT inline UI card.
- Interactive concept graph.
- External resource recommendation.
- NotebookLM export pack.
- Voice viva.

## 11.3 P2 — post-hackathon

- Full bidirectional Obsidian sync.
- Teacher dashboards.
- Native mobile app.
- Multiple curricula at scale.
- Public curriculum ingestion pipeline.
- Teams and collaboration.
- Full billing.
- Bring-your-own-key.
- Advanced spaced repetition.
- Automated paper discovery.
- Retraction/correction monitoring.
- Multi-agent research execution.

---

# 12. Two-Minute Demo Script

## 0:00–0:12 — Problem

Visual: rapid cuts between ChatGPT, Claude, a calendar, notes, papers, and an exam dashboard.

Narration concept:

> Students use powerful AI, but every tool forgets the rest of their academic life. They get answers and plans, yet still do not know what to do next—or whether they truly understand.

## 0:12–0:22 — Product

Show Continuum dashboard.

> Continuum is one persistent academic memory and execution engine across your own learning app, Claude, and ChatGPT.

## 0:22–0:50 — Educational impact

Open the Physics goal.

- Student has an assessment tomorrow.
- Continuum performs three diagnostic questions.
- It identifies confusion between electric potential and potential energy.
- Knowledge map changes.
- It gives one targeted explanation/activity.
- Student solves an unseen question.
- Mastery changes only after evidence.

Show concise labels:

- Diagnose
- Teach
- Verify
- Remember

## 0:50–1:10 — Scheduling

Open Today.

- The exam deadline, project work, and fixed commitments are visible.
- Continuum generates a feasible plan.
- Miss one block.
- Click replan.
- Show only affected tasks moving.
- Explain that constraints are optimized deterministically rather than guessed by the model.

## 1:10–1:32 — Research and evidence

Open research project.

- Select a claim.
- Show exact supporting passage.
- Show one unresolved methodological question.
- Show an accepted decision and next task.

## 1:32–1:48 — Cross-assistant MCP continuity

Open Claude.

Prompt:

> Resume my research project and tell me the most important next action.

Claude calls Continuum MCP and retrieves the project state.

Optionally show ChatGPT using the same backend:

> What should I study now?

## 1:48–1:57 — Routing and close

Show route panel:

- deterministic scheduler;
- fast model for classification;
- Featherless specialist model for verification;
- source retrieval for evidence.

Closing:

> Continuum does not replace the tools students love. It gives every tool the memory, evidence, and plan needed to move learning forward.

Keep total duration below two minutes.

---

# 13. Mapping to Judging Criteria

## 13.1 Educational Impact checklist

- [ ] The demo shows a real learner problem.
- [ ] Diagnosis changes the lesson.
- [ ] Mastery requires evidence.
- [ ] The schedule is tied to an academic goal.
- [ ] External resources are selected intentionally.
- [ ] The product works for more than note generation.
- [ ] The before/after outcome is obvious.

## 13.2 Creative AI/ML checklist

- [ ] Persistent structured memory.
- [ ] Retrieval-based context assembly.
- [ ] Misconception diagnosis.
- [ ] Model routing.
- [ ] Independent verification.
- [ ] MCP cross-assistant continuity.
- [ ] AI is not used for deterministic scheduling constraints.
- [ ] Featherless integration is meaningful.

## 13.3 Technical Execution checklist

- [ ] Deployed application.
- [ ] Functional MCP endpoint.
- [ ] OAuth or secure demo auth.
- [ ] Stable source retrieval.
- [ ] Typed schemas.
- [ ] Error and loading states.
- [ ] Audit trail.
- [ ] Mobile-responsive interface.
- [ ] No exposed keys.
- [ ] Read/write permission separation.
- [ ] README setup works.
- [ ] Demo account works.

## 13.4 Pitch checklist

- [ ] Video under 2:00.
- [ ] Problem in first 10 seconds.
- [ ] Product visible by 15 seconds.
- [ ] No code walkthrough.
- [ ] One coherent learner story.
- [ ] Cross-assistant feature clearly shown.
- [ ] Sources and verification visible.
- [ ] End with product promise.
- [ ] Captions.
- [ ] Clear audio.
- [ ] Backup local recording.

---

# 14. Quality and Acceptance Tests

## 14.1 Memory

- A decision saved in the standalone app is retrievable through MCP.
- A decision written through MCP appears in the app.
- Superseded decisions do not appear as current.
- Search returns relevant memory without unrelated private records.
- User deletion removes the record from retrieval and queues vector deletion.

## 14.2 Retrieval

- Every cited answer maps to a stored source chunk.
- Deleted sources cannot be cited.
- Source-locked mode refuses unsupported claims.
- Duplicate uploads are detected.
- Passage references remain stable.

## 14.3 Learning

- A diagnostic creates a learning checkpoint.
- Wrong answers can create a misconception.
- Reading a lesson alone does not mark transfer mastery.
- An unseen question can update transfer.
- The user can inspect why mastery changed.

## 14.4 Scheduling

- No study block overlaps a hard calendar commitment.
- Dependencies are ordered.
- A missed block triggers a replan.
- Replanning preserves completed work.
- Calendar writes require explicit confirmation.
- Timezone conversion is correct.

## 14.5 Routing

- The router selects deterministic tools for scheduling.
- A failed provider falls back.
- Output schema failure triggers retry/escalation.
- High-risk claim verification uses an independent route.
- Usage is logged.
- Per-user budget caps work.

## 14.6 MCP

- Tools enumerate correctly.
- OAuth succeeds.
- Read scope cannot write.
- Tool results are concise and structured.
- Claude can retrieve current context.
- ChatGPT Apps SDK test client can connect.
- Revoked access fails immediately.
- Prompt-injection text in a paper cannot call tools.

## 14.7 UX

- New user can create a goal without documentation.
- Main demo completes without refresh.
- Empty states are helpful.
- Long model calls stream or show progress.
- Error messages offer recovery.
- Responsive design works on a common Android viewport.

---

# 15. Privacy, Safety, and Trust

## 15.1 Minors

The hackathon and product include student users, including minors.

Requirements:

- collect minimal personal data;
- age-appropriate language;
- no targeted advertising;
- no sale of student data;
- clear consent;
- allow deletion/export;
- avoid storing unnecessary school identifiers;
- separate private notes from shareable academic records.

## 15.2 Academic data

- Encrypt data in transit and at rest.
- Store provider keys only server-side in encrypted secret storage.
- Avoid sending confidential unpublished research to free-tier providers whose data terms are unsuitable.
- Let users see which provider receives a task.
- Provide a “private/local sources only” mode later.
- Redact secrets before model calls.

## 15.3 Prompt injection

All source content is untrusted.

The retrieval layer must:

- strip or mark embedded instructions;
- never let document text alter system policy;
- never execute URLs or tools because a document requests it;
- use allowlisted tool calls;
- enforce authorization server-side;
- validate all model arguments.

## 15.4 Hallucination controls

- Source-locked mode.
- Claim/evidence ledger.
- Independent verifier for high-risk claims.
- Confidence labels.
- Explicit unsupported state.
- Exact passage links.
- Model-route transparency.
- No fabricated citations.
- Deterministic metadata lookup where possible.

## 15.5 User control

Users can:

- disable memory for a session;
- inspect remembered information;
- correct it;
- delete it;
- export it;
- choose integrations;
- revoke host access;
- limit model providers;
- approve writes.

---

# 16. Cost Guardrails

## 16.1 Hackathon

Target additional infrastructure spend: near zero.

Use:

- free hosting tiers;
- free database/auth tier;
- existing Featherless subscription;
- limited free inference;
- demo data;
- strict request budgets.

## 16.2 Cost controls

- per-user daily token ceiling;
- per-route budget class;
- cached retrieval;
- compact context;
- deterministic scheduling;
- provider fallback;
- circuit breakers;
- source processing queue;
- max file size;
- limited concurrent specialist calls;
- no multi-model jury on every response.

## 16.3 Public beta strategy

Two modes:

### MCP-first

The host assistant performs most reasoning. Continuum supplies context and tools. Lowest marginal inference cost.

### Standalone

Continuum invokes providers. Requires usage limits, credits, subscription, BYOK, or paid plan before scaling.

---

# 17. Metrics

## 17.1 North-star outcome

**Verified progress toward an academic goal per active week.**

Not messages sent. Not notes generated.

## 17.2 Learning metrics

- diagnostic-to-mastery conversion;
- unseen-question success;
- misconception recurrence;
- retention after delay;
- planned vs completed learning blocks;
- resource completion;
- confidence calibration.

## 17.3 Execution metrics

- milestone completion;
- deadline-risk reduction;
- percentage of tasks with completion evidence;
- replan acceptance;
- estimate accuracy;
- missed-work recovery.

## 17.4 Research metrics

- claims with direct evidence;
- unsupported claims detected;
- unresolved questions closed;
- time to resume a project;
- decisions linked to evidence;
- citation-support pass rate.

## 17.5 Product metrics

- activation;
- goal created;
- first verified checkpoint;
- MCP connection;
- weekly retention;
- context retrieval success;
- tool-call success;
- model cost per active user.

## 17.6 Hackathon metrics to collect

Even with a small tester group:

- time saved resuming a task;
- diagnostic accuracy feedback;
- plan usefulness rating;
- percentage of retrieved context judged relevant;
- number of unsupported claims caught.

---

# 18. Risks and Mitigations

## Risk: Product is too broad

Mitigation:

- One learner story.
- One research story.
- Four polished screens.
- P0 freeze.
- Everything else behind feature flags.

## Risk: MCP integration consumes development time

Mitigation:

- Start with six read tools and three write tools.
- Use standard MCP contracts.
- Test with inspector before host integration.
- Keep host-specific UI optional.

## Risk: ChatGPT custom-app access is limited by plan/review

Mitigation:

- Build standards-compliant Apps SDK integration.
- Demonstrate with available developer tooling.
- Show architecture and actual server responses.
- Do not falsely claim universal availability before publication.

## Risk: Obsidian sync complexity

Mitigation:

- P0 Markdown export.
- P1 one-way plugin.
- Full bidirectional sync after hackathon.

## Risk: Model limits

Mitigation:

- provider router;
- Featherless sponsor usage;
- free/cheap fallbacks;
- caching;
- deterministic tools;
- demo request prewarming where allowed;
- local fallback demo recording.

## Risk: Hallucinated educational content

Mitigation:

- seeded curriculum;
- source-locked mode;
- evidence viewer;
- verifier;
- curated demo material.

## Risk: Scheduler produces absurd plans

Mitigation:

- hard constraints;
- minimum/maximum block sizes;
- buffers;
- user-editable estimates;
- deterministic solver;
- explanation;
- preview before commit.

## Risk: Judges see a productivity tool rather than education

Mitigation:

- lead with diagnosis and mastery;
- show scheduling only after learning impact;
- frame research as education and academic completion;
- keep AI routing technical but secondary.

## Risk: Originality dispute

Mitigation:

- fresh repository;
- event-window commits;
- build log;
- third-party attribution;
- no reuse of old project code.

---

# 19. Development Plan

Dates assume work begins July 18, 2026.

## July 18

- Freeze product thesis.
- Create repository.
- Add this PRD.
- Create build log.
- Scaffold app/API.
- Define schemas.
- Seed demo stories.

## July 19

- Auth/demo user.
- Goal/project/task database.
- Today and Goal screens.
- Event ledger.

## July 20

- Source upload, chunking, embeddings, retrieval.
- Evidence viewer.
- Research claim model.

## July 21

- Learning diagnostic.
- Misconception schema.
- Tutor flow.
- Mastery update.

## July 22

- Scheduler.
- Daily plan.
- Replan flow.

## July 23

- Model gateway.
- Featherless adapter.
- Second provider adapter.
- Route logs and fallback.

## July 24

- MCP server.
- Auth scopes.
- Context and research tools.
- Claude connection.

## July 25

- Write/propose tools.
- Audit log.
- Prompt-injection hardening.
- ChatGPT Apps SDK compatibility.

## July 26

- UI polish.
- Graph and route panel.
- External resource broker.
- Mobile responsiveness.

## July 27

- Full demo integration.
- Seed content.
- Acceptance testing.
- Remove unstable extras.

## July 28

- User testing.
- Fix highest-impact issues.
- Collect metrics/testimonials.
- Draft Devpost content.

## July 29

- Record demo video.
- Repository documentation.
- Deployment hardening.
- Backup recording.

## July 30

- Final QA.
- Verify all links.
- Verify eligibility and team.
- Submit several hours before the earlier deadline.
- Confirm video duration and repository visibility.

---

# 20. Devpost Submission Checklist

## Registration

- [ ] Joined Devpost challenge
- [ ] Organizer Google form completed
- [ ] Team members eligible
- [ ] Team members added
- [ ] Team size ≤ 4

## Repository

- [ ] Public or judge-accessible
- [ ] Clean README
- [ ] Setup instructions tested
- [ ] `.env.example`
- [ ] No secrets
- [ ] License
- [ ] Third-party attribution
- [ ] Build log
- [ ] Architecture diagram
- [ ] Screenshots
- [ ] Demo credentials
- [ ] Hackathon-window Git history

## Product

- [ ] Deployed URL works
- [ ] MCP endpoint works
- [ ] Demo account works
- [ ] Core flow works on fresh session
- [ ] Provider failure handled
- [ ] Privacy page
- [ ] No unsupported claims

## Video

- [ ] 1:50–1:57
- [ ] Captions
- [ ] Audio clear
- [ ] Problem immediately visible
- [ ] Educational impact demonstrated
- [ ] AI use demonstrated
- [ ] Technical execution visible
- [ ] Product URL visible
- [ ] No private information
- [ ] Backup uploaded

## Devpost text

- [ ] Inspiration
- [ ] What it does
- [ ] How it was built
- [ ] Challenges
- [ ] Accomplishments
- [ ] What was learned
- [ ] What is next
- [ ] Technology tags
- [ ] GitHub link
- [ ] Demo link
- [ ] Accurate feature claims
- [ ] Featherless usage described honestly

---

# 21. Recommended Repository Structure

```text
/
├── hackathon.md
├── README.md
├── BUILD_LOG.md
├── THIRD_PARTY.md
├── apps/
│   ├── web/
│   ├── mcp/
│   └── scheduler/
├── packages/
│   ├── domain/
│   ├── schemas/
│   ├── database/
│   ├── retrieval/
│   ├── router/
│   ├── integrations/
│   └── ui/
├── docs/
│   ├── architecture.md
│   ├── mcp-tools.md
│   ├── security.md
│   └── demo-script.md
├── seed/
│   ├── physics/
│   └── research/
└── tests/
```

---

# 22. Definition of Done

The hackathon build is done only when a judge can:

1. Open the deployed app.
2. See a real academic goal and plan.
3. Complete a diagnostic.
4. Observe a misconception-driven intervention.
5. Complete an unseen checkpoint.
6. See mastery and schedule update.
7. Open a research claim and exact evidence.
8. Ask Claude for the project’s next action through MCP.
9. See the same state reflected in the standalone app.
10. Understand why different tools/models were selected.
11. Watch the full story in under two minutes.
12. Access working source code.

---

# 23. Pitch Language

## One sentence

> Continuum gives students one evidence-backed academic memory and execution engine across its own adaptive-learning app, Claude, ChatGPT, and every MCP-compatible tool they use.

## Problem

> AI can answer almost anything, but it does not reliably know what a student has learned, what evidence supports their work, what deadline matters next, or what happened in another tool.

## Solution

> Continuum structures the learner’s goals, mastery, research, sources, decisions, and calendar; retrieves only the relevant context; and turns it into the next verified learning or execution step.

## Moat

> Portable academic state, evidence-linked memory, adaptive scheduling, and cross-assistant tool access—not a single prompt or model.

## Why now

> Students already use multiple AI assistants. The winning product does not force them into one chat; it makes every assistant more context-aware, trustworthy, and useful.

---

# 24. Authoritative Technical References

The following sources informed architecture and implementation. Recheck them because platform support changes quickly.

## Hackathon

- Prometheus July AI Challenge overview:  
  https://prometheus-july-ai-challenge.devpost.com/
- Prometheus July AI Challenge rules:  
  https://prometheus-july-ai-challenge.devpost.com/rules

## Claude and MCP

- Anthropic custom remote MCP connectors:  
  https://support.anthropic.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp
- Anthropic guidance on remote vs desktop connectors:  
  https://support.anthropic.com/en/articles/11725091-when-to-use-desktop-and-web-connectors
- Claude Science announcement:  
  https://www.anthropic.com/news/claude-science-ai-workbench
- Model Context Protocol documentation:  
  https://modelcontextprotocol.io/docs/getting-started/intro

## ChatGPT Apps and MCP

- OpenAI Apps SDK:  
  https://developers.openai.com/apps-sdk
- Build an MCP server for a ChatGPT app:  
  https://developers.openai.com/apps-sdk/build/mcp-server
- Connect from ChatGPT:  
  https://developers.openai.com/apps-sdk/deploy/connect-chatgpt
- MCP Apps compatibility:  
  https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt
- Developer mode and MCP apps:  
  https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt
- Public app/plugin submission:  
  https://developers.openai.com/apps-sdk/deploy/submission

## Obsidian

- Obsidian Developer Documentation:  
  https://docs.obsidian.md/Home
- Obsidian Vault plugin API:  
  https://docs.obsidian.md/Plugins/Vault
- Vault TypeScript reference:  
  https://docs.obsidian.md/Reference/TypeScript%2BAPI/Vault

## Research and scheduling

- Zotero Web API:  
  https://www.zotero.org/support/dev/web_api/v3/start
- Google Calendar FreeBusy:  
  https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
- Google OR-Tools constraint optimization:  
  https://developers.google.com/optimization/cp
- OR-Tools CP-SAT:  
  https://developers.google.com/optimization/cp/cp_solver

## Model provider

- Featherless documentation:  
  https://featherless.ai/docs

---

# 25. Final Product Summary

Continuum is a standalone adaptive-learning and academic-execution platform with a remote MCP layer.

It:

- teaches at the correct level;
- diagnoses before explaining;
- verifies learning;
- remembers across sessions;
- grounds research in evidence;
- stores durable, user-owned notes;
- tracks goals and projects;
- optimizes daily work around real constraints;
- directs users to stronger existing resources;
- routes AI tasks intelligently;
- works natively;
- enhances Claude;
- integrates with ChatGPT through an MCP-backed app;
- supports Claude Code, Codex, and scientific workflows without making them the main product.

The hackathon version must prove one central idea:

> **A student should never have to restart their academic context—and every AI interaction should move a real learning or research goal measurably forward.**
