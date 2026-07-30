# Continuum — 120-Second Launch Film (Production Plan v2)

> **Superseded by [PLAN.md](PLAN.md)** — the v3 master implementation plan
> (2026-07-28). This file is kept for the creative rationale and the v1→v2
> corrections record; implementers should execute PLAN.md only.

Supersedes `Continuum_120_Second_Launch_Film_Plan.docx`. Every feature, route, and
brand value below was checked against the working tree on this branch, not against
the marketing copy.

---

## 1. What changed from v1, and why

### Identity

| v1 said | Reality | Source |
|---|---|---|
| "logo animation, continuous wave" | The mark has **no wave**. It is a lime rounded square holding four dark ascending bars, cut by a lime connective stroke with a node on it. | `apps/web/components/brand-mark.tsx` |
| — | Wordmark is **lowercase** `continuum`, locked up to the right of the mark. | `landing-page.tsx:104` |
| Implied dark cinematic grade | Continuum's default surface is **warm paper `#f7f6f0`**, not black. A black film is off-brand unless the darkness is the *problem* half of the story. | `landing.css:2` |
| Tagline: "Information is abundant. Learning is fragmented. Continuum transforms scattered resources into one continuous path from curiosity to mastery—where knowledge compounds." | That sentence **does not exist in the product**. It is a mashup of three separate real lines. | see §2 |

### Structure

- **v1 spends 20s on the problem.** That is 17% of the film on the thing judges
  already believe. Cut to 14s.
- **75s / 22 checklist items = 3.4s per feature.** Nothing is legible at that rate,
  and it directly contradicts v1's own note to "pause between major ideas to let
  the UI breathe." Restructured into **six surfaces × ~12s**, which is the same
  spine the landing page already commits to.
- **The Assistant is double-booked** in v1 — once in the 20–95s checklist and again
  in the 95–110s segment. It appears once, in the payoff.

### Feature list

Stale or wrong:

| v1 item | Correction |
|---|---|
| "Knowledge graph" as a screen | **No such screen ships.** `knowledge graph` appears only in landing copy and page metadata. The real surface is the **Concept Map** inside Learn — branches `Foundations / Practice / Apply & create / Review & proof`. Shoot that. (`workspace/concept-map.tsx`) |
| "OpenAlex search", "Source Library", "Zotero integration" as three beats | All **one Library screen** now. `/openalex` and `/zotero` are aliases that preselect a tab. (`lib/workspace-routes.ts:42`) |
| "Dashboard / Today" | It is **Today** — "your next action, current schedule, last verified checkpoint." Framing it as a dashboard undersells the one thing that differentiates it. |
| "Authentication (brief)" | Cut. It spends screen time proving you can build a login form. |

Missing entirely from v1, and all real:

| Surface | Why it earns time |
|---|---|
| **Plan** (`/goals`) | Outcomes, deadlines, calendar constraints, proof of completion. An entire nav section. |
| **Memory** (`/memory`) | "Durable academic context retrieved by relevance, not transcript replay." This is the differentiator the whole film is arguing for. |
| **Review** (`/activity`) | Approve assistant proposals before they land. Human-in-the-loop — strong for judges, and it makes the MCP segment safe rather than spooky. |
| **NotebookLM, Ollama, YouTube Data API** | Shipped connections; v1 lists only Zotero and Obsidian. |

---

## 2. Identity (authoritative)

Mirrored into `src/brand.ts`. Do not eyedrop from screenshots.

```
paper    #f7f6f0      ink      #101511      forest   #173d2e
surface  #ffffff      muted    #616a63      emerald  #467a61
accent   #d9ff2f      mark ink #171812
```

**Real product lines** — use these verbatim, do not paraphrase:

- `One Workspace. Infinite Learning.` — hero kicker and footer
- `Information is abundant. / Learning is fragmented.` — the problem section H2
- `Build knowledge that compounds.` — final CTA
- `Continuum fights for student outcomes, not screen time.`

The v1 mashup tagline should be retired. If the film needs one closing line, use
the kicker; it is the line the site actually signs off with.

---

## 3. Timeline

| Time | Segment | Source |
|---|---|---|
| 0–14 | Hook — fragmentation | Remotion |
| 14–22 | Continuum appears · Today | OBS |
| 22–92 | Six surfaces | OBS |
| 92–106 | Assistant → Review → Claude MCP | OBS |
| 106–120 | Close | Remotion |

### 0–14s — Hook (Remotion)

Cold open on paper white, not black. Windows accumulate — a chat, a PDF, a second
chat, a notes app, a terminal, a browser with nine tabs — each one arriving with
the same re-explained context pasted into it. The stack gets denser and the paper
gets colder until the frame is unreadable.

Typography beat at ~10s, in ink on paper:

> Information is abundant.
> Learning is fragmented.

Everything collapses inward to a single point.

### 14–22s — Continuum appears (OBS)

The point opens into **Today**. Silence on the track for a beat. Label: `Today`.
Hold on "your next action" and the reasoning underneath it — the point is that the
app has already decided, not that it has a dashboard.

### 22–92s — The six surfaces (70s)

Every segment gets a persistent corner label so judges can name what they are
looking at. One continuous OBS take, cut in Resolve.

| Time | Surface | Beats to hit |
|---|---|---|
| 22–34 | **Plan** `/goals` | Outcome → deadline → tasks against real calendar constraints → completion evidence |
| 34–48 | **Learn** `/learn` | "Find the best resource" from Today → ranked recommendation with the *reason* it won → concept map branches → mastery state changing → practice questions → a weakness getting caught |
| 48–62 | **Library + Research** | OpenAlex search → entity detail → traverse the citation graph → save → Zotero tab → PDF ingest → over to Research: a claim with its source attached, and an unresolved question |
| 62–72 | **Memory** `/memory` | Retrieval by relevance. Show a receipt from segment 34–48 surfacing here on its own. |
| 72–82 | **Code** `/code` | Paper → experiment. Run Python, hit an error, ask for help, get a source-aware fix |
| 82–92 | **Connections** `/integrations` | Obsidian sync, NotebookLM export, Ollama local route, YouTube key — then land on the Claude MCP card and its scoped permissions |

The 34–48 Learn block is the most important 14 seconds in the film. It is the only
place the full loop — question → evidence → path → test → recorded mastery — is
visible in one continuous motion. Do not trim it to buy time elsewhere.

### 92–106s — The payoff (OBS)

1. **Assistant** (92–99). Ask it to build a session for Friday's exam. It answers
   from mastery state and weak areas without being re-briefed. Show it proposing,
   not just asserting.
2. **Review** (99–102). The proposal lands in `/activity` for approval. Approve it.
   Three seconds, and it is what makes the next beat land as trustworthy.
3. **Claude Desktop** (102–106). Switch apps. Ask a plain question. Claude answers
   with the learner's real context over MCP — nothing pasted, nothing re-explained.
   Cut back to Continuum with the state already synchronized.

### 106–120s — Close (Remotion)

Return to the desk from the hook, now empty. Paper, not black. The mark builds —
tile, bars rising in sequence, connective stroke drawing through them, node landing
— then the wordmark slides into lockup and the line resolves.

> One Workspace. Infinite Learning.

Built: `src/LogoReveal.tsx` (180 frames). The build is driven by a single
`progress` prop on `src/BrandMark.tsx`, so the timing can be retimed against the
music without touching geometry.

---

## 4. Coverage check

Every capability in the v1 checklist, mapped to where it actually appears:

| Capability | Segment | Route |
|---|---|---|
| Today / next action | 14–22 | `/today` |
| Plan, deadlines, completion proof | 22–34 | `/goals` |
| Best Resource + ranking rationale | 34–48 | `/learn` |
| Concept map, mastery, practice, weakness detection | 34–48 | `/learn` |
| OpenAlex, citation graph, paper detail | 48–62 | `/library` |
| Zotero, PDF ingestion | 48–62 | `/library` |
| Claims, decisions, open questions | 48–62 | `/research` |
| Memory retrieval | 62–72 | `/memory` |
| Code workspace, run, AI debugging | 72–82 | `/code` |
| Obsidian, NotebookLM, Ollama, YouTube | 82–92 | `/integrations` |
| Assistant + personalized session | 92–99 | `/assistant` |
| Proposal approval | 99–102 | `/activity` |
| Claude MCP | 102–106 | Claude Desktop |

Dropped on purpose: standalone "knowledge graph" (does not exist),
"authentication" (low value per second), "resume learning" (folded into Today).

---

## 5. Voiceover

Record after picture lock. ~120 words across 120 seconds is deliberate — roughly
half the film carries no narration. Let the UI hold those gaps.

| Time | Line |
|---|---|
| 0–14 | "Every tool you use sees a sliver of your work. So you spend your best attention rebuilding context that already existed." |
| 14–22 | *(silent — let Today land)* |
| 22–48 | "Continuum starts from the outcome. It finds the evidence, builds the path, and tests whether you actually understood it." |
| 48–72 | "Sources, claims, decisions — connected, and still connected when you come back." |
| 72–92 | *(silent through Code; resume at Connections)* "It works with the tools you already have." |
| 92–106 | "So when you ask for help, nothing has to be explained twice — here, or in Claude." |
| 106–120 | "Information is abundant. Learning is fragmented. This is one workspace, where knowledge compounds." |

---

## 6. Capture notes

- Master format 1920×1080 @ 30fps, ProRes HQ 10-bit — already set in
  `remotion.config.ts`. Match OBS to it so Resolve never resamples.
- Record the 14–106s block as **one continuous take**. Cut it in Resolve; do not
  stitch separate recordings — the film's whole argument is continuity.
- Seed real-looking data first (`pnpm seed:demo`). Empty states read as unfinished.
- Light theme throughout. The dark theme exists but the paper surface is the
  identity.
- Corner feature labels: ink on paper, lowercase, small. Add in Resolve, not OBS.
