"use client";

import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  Database,
  FileCheck2,
  FileText,
  FlaskConical,
  FolderKanban,
  Lightbulb,
  Link2,
  NotebookPen,
  Plus,
  Clock3,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge, Button, Card, ConfirmationDialog, LoadingButton, Modal, SegmentedNavigation } from "@/components/ui";
import { formatLabel, sourceTypeLabel, statusTone } from "@/lib/labels";
import { workspacePath } from "@/lib/workspace-routes";
import { PageHeader } from "./page-header";
import { formatDate, list, postState, text, type Row, type WorkspaceState } from "./types";
import "../project/project.css";
// The Research overview grid shares its markup — and therefore its classes —
// with the project screen, where the styles live. Without this import the whole
// overview rendered as unstyled stacked text in production: kickers, headings
// and metadata running together with no card, on the flagship research screen.

import "./research-screen.css";

type Toast = (message: string | null) => void;
type Panel = "project" | "source" | "decision";
type ResearchTab = "overview" | "discovery" | "papers" | "notes" | "claims" | "experiments" | "decisions" | "drafts";

/**
 * The tab bar carries only destinations that do something.
 *
 * Papers and Notes are two views of one project library and share a tab.
 * Experiments and Drafts had no backing feature at all — two of eight tabs were
 * dead ends. They are gone entirely rather than advertised as an unbuilt
 * "Coming next" block inside the product.
 */
const tabs: Array<{ id: ResearchTab; label: string }> = [
  { id: "overview", label: "Overview" },
  // "Find papers", not "Discovery": the tab is now a route to the Library's one
  // search surface, and naming it after a place that no longer exists here was
  // half the reason two surfaces drifted apart.
  { id: "discovery", label: "Find papers" },
  { id: "papers", label: "Library" },
  { id: "claims", label: "Claims" },
  { id: "decisions", label: "Decisions" },
];

/** Starting points that remove the blank-page problem on a new project. */
const projectTemplates: Array<{ title: string; phase: string; purpose: string }> = [
  { title: "Literature review", phase: "Discovery", purpose: "Map what is already known about the question, and record where the evidence disagrees." },
  { title: "Lab notebook", phase: "Experiment", purpose: "Keep runs, parameters, and observations attached to the decisions they justify." },
  { title: "Methods validation", phase: "Validation", purpose: "Establish that the method behaves correctly on a known case before trusting it on a new one." },
];

function scoped(rows: Row[], projectId: string) {
  return rows.filter((row) => text(row, "projectId") === projectId);
}

function EmptyTab({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <div className="research-empty-tab"><span>{icon}</span><h2>{title}</h2><p>{body}</p></div>;
}

export function ResearchScreen({ state, showToast, onRefresh }: { state: WorkspaceState; showToast: Toast; onRefresh: () => Promise<void> }) {
  const [panel, setPanel] = useState<Panel>();
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<ResearchTab>("overview");
  const [projectId, setProjectId] = useState(() => text(state.projects[0], "id"));
  const [sourceDirty, setSourceDirty] = useState(false);
  const [libraryView, setLibraryView] = useState<"papers" | "notes">("papers");
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string }>();

  useEffect(() => {
    if (!state.projects.some((project) => text(project, "id") === projectId)) setProjectId(text(state.projects[0], "id"));
  }, [projectId, state.projects]);

  const selectedProject = state.projects.find((project) => text(project, "id") === projectId);
  const projectGoal = state.goals.find((goal) => text(goal, "id") === text(selectedProject, "goalId"));
  const projectTasks = useMemo(() => state.tasks.filter((task) => text(task, "goalId") === text(selectedProject, "goalId")), [selectedProject, state.tasks]);
  const projectSources = scoped(state.sources, projectId);
  const projectPapers = scoped(state.papers, projectId);
  const projectNotes = scoped(state.notes, projectId);
  const projectClaims = scoped(state.claims, projectId);
  const projectDecisions = scoped(state.decisions, projectId);
  const nextTask = projectTasks.find((task) => !["done", "completed"].includes(text(task, "status"))) ?? projectTasks[0];
  // Overview is a dashboard, not a landing page: what is next, what was decided,
  // what is still open, and what changed recently — each linking into its tab.
  const unresolvedQuestions = useMemo(
    () => [...new Set(state.receipts.filter((receipt) => text(receipt, "projectId") === projectId).flatMap((receipt) => list(receipt, "unresolvedQuestions")))],
    [state.receipts, projectId],
  );
  const projectEntityIds = useMemo(
    () => new Set([projectId, ...projectPapers.map((row) => text(row, "id")), ...projectSources.map((row) => text(row, "id")), ...projectDecisions.map((row) => text(row, "id"))].filter(Boolean)),
    [projectId, projectPapers, projectSources, projectDecisions],
  );
  const recentProjectEvents = useMemo(
    () => state.events.filter((event) => list(event, "entityIds").some((id) => projectEntityIds.has(id))),
    [state.events, projectEntityIds],
  );

  async function createProjectFromTemplate(template: { title: string; phase: string; purpose: string }) {
    setBusy(true);
    try {
      await postState("project.created", "Created a research project from a template in the standalone app.", { title: template.title, purpose: template.purpose, phase: template.phase });
      showToast("Project created. Everything in it is editable.");
      await onRefresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "The project could not be created"); }
    finally { setBusy(false); }
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await postState("project.created", "Created a research project in the standalone app.", { title: String(data.get("title")), purpose: String(data.get("purpose")), phase: String(data.get("phase")), goalId: String(data.get("goalId")) || undefined });
      setPanel(undefined);
      showToast("Project saved to shared state.");
      await onRefresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "The project could not be saved"); }
    finally { setBusy(false); }
  }

  async function uploadSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/sources", { method: "POST", body: new FormData(event.currentTarget) });
      const body = await response.json() as { duplicate?: boolean; error?: string };
      if (!response.ok) throw new Error(body.error ?? "The source could not be indexed");
      setSourceDirty(false);
      setPanel(undefined);
      showToast(body.duplicate ? "That exact source is already indexed." : "Source indexed with stable passages and retrieval metadata.");
      await onRefresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "The source could not be indexed"); }
    finally { setBusy(false); }
  }

  async function saveDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await postState("research.decision.saved", "Saved an accepted research decision in the standalone app.", { projectId: String(data.get("projectId")), text: String(data.get("text")), reasoning: String(data.get("reasoning")), sourceIds: data.getAll("sourceIds").map(String), userApproved: true });
      setPanel(undefined);
      showToast("Accepted decision saved with its source links.");
      await onRefresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "The decision could not be saved"); }
    finally { setBusy(false); }
  }

  function deleteSource(sourceId: string, title: string) {
    setConfirmDelete({ id: sourceId, title });
  }

  async function performDeleteSource(sourceId: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/sources?sourceId=${encodeURIComponent(sourceId)}`, { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The source could not be removed");
      showToast("Source excluded from retrieval and cleanup queued.");
      await onRefresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "The source could not be removed"); }
    finally { setBusy(false); }
  }

  function chooseProject(nextProjectId: string) {
    setProjectId(nextProjectId);
    setActiveTab("overview");
  }

  return (
    <div className="screen research-screen">
      <PageHeader
        title="Research"
        context={selectedProject ? <><span className="page-header-project">{text(selectedProject, "title")}</span><Badge tone="blue">{formatLabel(text(selectedProject, "phase", "Discovery"))}</Badge></> : undefined}
        description="Evidence, not browser tabs. Discover papers, preserve exact sources, test claims, and keep decisions attached to the project they change."
        stats={selectedProject ? [
          { label: "papers", value: projectPapers.length },
          { label: "sources", value: projectSources.length },
          { label: "claims", value: projectClaims.length },
          { label: "decisions", value: projectDecisions.length },
        ] : undefined}
        actions={<Button className="button-primary compact-button" onClick={() => setPanel(panel === "project" ? undefined : "project")}><Plus size={15} aria-hidden="true" />New project</Button>}
        overflow={<>
          {selectedProject ? <><Button className="button-quiet" onClick={() => setPanel(panel === "source" ? undefined : "source")}><Upload size={15} aria-hidden="true" />Add source</Button><Button className="button-quiet" onClick={() => setPanel(panel === "decision" ? undefined : "decision")}><ShieldCheck size={15} aria-hidden="true" />Record decision</Button></> : null}
          <a className="button button-quiet" href={workspacePath.integrations}><Link2 size={15} aria-hidden="true" />Connect tools</a>
        </>}
      >
        {state.projects.length > 1 ? <label className="research-project-switcher-inline"><span className="sr-only">Active project</span><FolderKanban size={15} aria-hidden="true" /><select value={projectId} onChange={(event) => chooseProject(event.target.value)} aria-label="Active project">{state.projects.map((project) => <option key={text(project, "id")} value={text(project, "id")}>{text(project, "title")}</option>)}</select></label> : null}
      </PageHeader>

      {panel === "project" ? <Card className="inline-form-card"><div className="inline-form-heading"><div><h2>Create a research project</h2><p>Give it a bounded purpose and an honest current phase.</p></div><button onClick={() => setPanel(undefined)}>Cancel</button></div><form className="workspace-form form-grid" onSubmit={createProject}><label>Project title<input name="title" required minLength={3} maxLength={200} /></label><label>Phase<input name="phase" defaultValue="Discovery" maxLength={100} /></label><label>Linked goal<select name="goalId"><option value="">No linked goal</option>{state.goals.map((goal) => <option key={text(goal, "id")} value={text(goal, "id")}>{text(goal, "title")}</option>)}</select></label><label className="full-field">Purpose<textarea name="purpose" required minLength={3} maxLength={1000} /></label><div className="form-actions"><Button type="submit" className="button-primary" disabled={busy}>{busy ? "Saving…" : "Create project"}</Button></div></form></Card> : null}

      <Modal
        open={panel === "source"}
        onOpenChange={(open) => { if (!open) { setPanel(undefined); setSourceDirty(false); } }}
        title="Add a source"
        description="Add a PDF or readable text file to this project’s source library."
        dirty={sourceDirty && !busy}
        dirtyMessage="Discard this selected source? It has not been uploaded yet."
        footer={<><Button className="button-secondary" type="button" disabled={busy} onClick={() => { setSourceDirty(false); setPanel(undefined); }}>Cancel</Button><LoadingButton form="source-upload-form" className="button-primary" loading={busy} loadingLabel="Indexing source…"><Upload size={15} />Add and index source</LoadingButton></>}
      >
        <form id="source-upload-form" className="workspace-form source-modal-form" onSubmit={uploadSource} onChange={() => setSourceDirty(true)}>
          <div className="source-type-options" aria-label="Supported source types">
            <span><FileText size={17} /><strong>PDF</strong><small>Up to 10 MB</small></span>
            <span><NotebookPen size={17} /><strong>Text or Markdown</strong><small>Readable UTF-8 files</small></span>
          </div>
          <label>Choose a file<input autoFocus name="file" type="file" accept="application/pdf,text/plain,.txt,.md,.markdown,.csv,.json,.yaml,.yml,.tex" required /></label>
          <label>Save to project<select name="projectId" required value={projectId} onChange={(event) => chooseProject(event.target.value)}>{state.projects.map((project) => <option key={text(project, "id")} value={text(project, "id")}>{text(project, "title")}</option>)}</select></label>
          <div className="source-index-explainer">
            <ShieldCheck size={18} />
            <div><strong>What happens after you add it</strong><p>Continuum extracts readable text, creates stable passages for precise citations, and links the source to this project. Source text is treated as evidence, never as instructions.</p></div>
          </div>
        </form>
      </Modal>

      {panel === "decision" ? <Card className="inline-form-card"><div className="inline-form-heading"><div><h2>Record an accepted decision</h2><p>Use this only for a decision you reviewed and accepted.</p></div><button onClick={() => setPanel(undefined)}>Cancel</button></div><form className="workspace-form form-grid" onSubmit={saveDecision}><input type="hidden" name="projectId" value={projectId} /><label className="full-field">Decision<textarea name="text" required minLength={3} maxLength={2000} /></label><label className="full-field">Reasoning<textarea name="reasoning" required minLength={3} maxLength={5000} /></label>{projectSources.length ? <fieldset className="source-choice full-field"><legend>Supporting sources</legend>{projectSources.map((source) => <label key={text(source, "id")}><input type="checkbox" name="sourceIds" value={text(source, "id")} />{text(source, "title")}</label>)}</fieldset> : null}<div className="form-actions"><Button type="submit" className="button-primary" disabled={busy}><CheckCircle2 size={15} />{busy ? "Saving…" : "Save accepted decision"}</Button></div></form></Card> : null}

      {selectedProject ? <>
        <div className="research-tabs-shell">
          <nav className="section-tabs" role="tablist" aria-label="Research workspace sections">{tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}>{tab.label}{tab.id === "papers" && projectPapers.length + projectNotes.length ? <small>{projectPapers.length + projectNotes.length}</small> : null}</button>)}</nav>

          <div className="research-tab-panel">
            {activeTab === "overview" ? <div className="research-overview-grid">
              <Card className="research-focus-card"><div className="research-card-kicker"><Sparkles size={16} />NEXT MILESTONE</div><h2>{text(nextTask, "title", "Define the next evidence-producing task")}</h2><p>{text(nextTask, "description", "Connect a concrete task to this project so Continuum can carry it into the weekly plan.")}</p><div className="research-focus-meta"><span>{nextTask ? `${String(nextTask.estimatedMinutes ?? "—")} min` : "No estimate"}</span><span>{nextTask?.deadline ? `Due ${formatDate(nextTask.deadline, { dateStyle: "medium" })}` : "No deadline"}</span><Badge tone={statusTone(text(nextTask, "status", "planned"))}>{formatLabel(text(nextTask, "status", "planned"))}</Badge></div></Card>
              <Card className="research-status-card"><div className="research-card-kicker"><FolderKanban size={16} />PROJECT STATE</div><dl><div><dt>Linked goal</dt><dd>{text(projectGoal, "title", "No linked goal")}</dd></div><div><dt>Target</dt><dd>{projectGoal?.targetDate ? formatDate(projectGoal.targetDate, { dateStyle: "medium" }) : "Not set"}</dd></div><div><dt>Evidence base</dt><dd>{projectSources.length + projectPapers.length} records</dd></div></dl></Card>
              <Card className="research-warning-card"><div className="research-card-kicker"><ShieldCheck size={16} />LATEST ACCEPTED DECISION</div>{projectDecisions[0] ? <><h2>{text(projectDecisions[0], "text")}</h2><p>{text(projectDecisions[0], "reasoning")}</p><button onClick={() => setActiveTab("decisions")}>View decision ledger <ArrowUpRight size={14} /></button></> : <EmptyTab icon={<ShieldCheck size={20} />} title="No accepted decision" body="Record decisions only after you review the evidence and accept the reasoning." />}</Card>
              <Card className="research-library-card"><div className="research-section-heading"><div><div className="research-card-kicker"><Database size={16} />SOURCE LIBRARY</div><h2>{projectSources.length} indexed source{projectSources.length === 1 ? "" : "s"}</h2></div><Button className="button-secondary compact-button" onClick={() => setPanel("source")}><Plus size={14} />Add</Button></div>{projectSources.slice(0, 4).map((source) => <div className="research-source-row" key={text(source, "id")}><FileText size={17} /><div><strong>{text(source, "title")}</strong><span>{sourceTypeLabel(text(source, "mimeType", "document"))} · v{String(source.sourceVersion ?? 1)}</span></div><button disabled={busy} onClick={() => deleteSource(text(source, "id"), text(source, "title"))} aria-label={`Delete ${text(source, "title")}`}><Trash2 size={15} /></button></div>)}{!projectSources.length ? <EmptyTab icon={<FileText size={20} />} title="No indexed sources" body="Upload a PDF or text source to create stable, citeable passages." /> : null}</Card>
              <Card className="research-unresolved-card"><div className="research-card-kicker"><CircleAlert size={16} />UNRESOLVED QUESTIONS</div>{unresolvedQuestions.length ? <ul>{unresolvedQuestions.slice(0, 4).map((question) => <li key={question}>{question}</li>)}</ul> : <p>No open question is recorded for this project. Continuum lists them here as receipts capture them.</p>}</Card>
              <Card className="research-activity-card"><div className="research-card-kicker"><Clock3 size={16} />RECENT ACTIVITY</div>{recentProjectEvents.length ? <ul>{recentProjectEvents.slice(0, 5).map((event) => <li key={text(event, "id")}><strong>{text(event, "summary")}</strong><small>{formatDate(event.occurredAt)}</small></li>)}</ul> : <p>Saved papers, indexed sources, and accepted decisions will appear here.</p>}</Card>

            </div> : null}

            {/* §13.2 moved discovery into the Library, and AC-P3 requires paper
                search to exist at exactly one URL. This tab used to be a second
                copy — its own query field, its own six filters, its own result
                row, its own error handling — which is precisely the drift the
                single-surface rule exists to stop. It now points at the one
                surface, with this project already chosen as the destination. */}
            {activeTab === "discovery" ? <div className="research-discovery">
              <div className="research-section-heading">
                <div><h2>Find papers</h2><p>Paper search lives in the Library, so there is one place to search and one place everything lands. Opening it from here files what you save into <strong>{text(selectedProject, "title")}</strong>.</p></div>
              </div>
              <Card className="research-discovery-handoff">
                <BookOpen size={22} aria-hidden="true" />
                <div>
                  <h3>Search 250M+ works from OpenAlex</h3>
                  <p>Keywords, a quoted title, an author, or a DOI — plus Crossref, citation links, and the papers already in your Zotero. Nothing is added until you choose Save.</p>
                </div>
                <a className="button button-primary" href={`${workspacePath.library}?tab=discover&target=p:${encodeURIComponent(projectId)}`}>
                  <Search size={15} aria-hidden="true" />Open Discover
                </a>
              </Card>
            </div> : null}

            {/* Papers and Notes are two views of one project library, switched with
                a segmented control rather than two top-level tabs. */}
            {activeTab === "papers" ? <div className="research-record-list">
              <div className="research-section-heading">
                <div><h2>Project library</h2></div>
                <SegmentedNavigation label="Library view" value={libraryView} onChange={setLibraryView} options={[{ value: "papers", label: `Papers (${projectPapers.length})` }, { value: "notes", label: `Notes (${projectNotes.length})` }]} />
                <Button className="button-primary compact-button" onClick={() => setActiveTab("discovery")}><Search size={14} aria-hidden="true" />Discover papers</Button>
              </div>
              {libraryView === "papers" ? <>
                {projectPapers.map((paper) => <article className="research-record" key={text(paper, "id")}><span><BookOpen size={18} aria-hidden="true" /></span><div><h3>{text(paper, "title")}</h3><p>{list(paper, "authors").join(", ") || "Authors unavailable"}</p><small>{[paper.year, text(paper, "doi") ? `doi:${text(paper, "doi")}` : undefined].filter(Boolean).join(" · ")}</small></div><Badge tone={paper.sourceId ? "green" : "neutral"}>{paper.sourceId ? "Full source" : "Metadata"}</Badge></article>)}
                {!projectPapers.length ? <EmptyTab icon={<BookOpen size={22} />} title="No saved papers" body="Use Discovery to search the scholarly graph, then save only relevant records." /> : null}
              </> : <>
                {projectNotes.map((note) => <article className="research-record note" key={text(note, "id")}><span><NotebookPen size={18} aria-hidden="true" /></span><div><p>{text(note, "text")}</p><small>{text(note, "sourceId") ? "Linked to an exact project source" : "Project note"} · {formatLabel(text(note, "createdBy", "user"))}</small></div></article>)}
                {!projectNotes.length ? <EmptyTab icon={<NotebookPen size={22} />} title="No research notes" body="Notes created from exact source passages will appear here with their provenance." /> : null}
              </>}
            </div> : null}

            {/* Papers and Notes are one project library, switched with a segmented
                control rather than two top-level tabs. */}

            {activeTab === "claims" ? <div className="research-record-list"><div className="research-section-heading"><div><div className="research-card-kicker"><FileCheck2 size={16} />CLAIM LEDGER</div><h2>{projectClaims.length} claim{projectClaims.length === 1 ? "" : "s"}</h2></div></div>{projectClaims.map((claim) => <article className="research-record" key={text(claim, "id")}><span><Lightbulb size={18} /></span><div><h3>{text(claim, "text")}</h3><small>Created by {formatLabel(text(claim, "createdBy", "user"))}{text(claim, "verificationModel") ? ` · checked by ${text(claim, "verificationModel")}` : " · awaiting independent verification"}</small></div><Badge tone={statusTone(text(claim, "status", "unverified"))}>{formatLabel(text(claim, "status", "unverified"))}</Badge></article>)}{!projectClaims.length ? <EmptyTab icon={<FileCheck2 size={22} />} title="No evidence-linked claims" body="Claims remain visibly unverified until exact supporting or contradicting passages are attached." /> : null}</div> : null}


            {activeTab === "decisions" ? <div className="research-record-list"><div className="research-section-heading"><div><div className="research-card-kicker"><ShieldCheck size={16} />DECISION LEDGER</div><h2>Accepted and superseded choices</h2></div><Button className="button-primary compact-button" onClick={() => setPanel("decision")}><Plus size={14} />Record decision</Button></div>{projectDecisions.map((decision) => <article className="research-record decision" key={text(decision, "id")}><span><ShieldCheck size={18} /></span><div><h3>{text(decision, "text")}</h3><p>{text(decision, "reasoning")}</p><small>{list(decision, "sourceIds").length} linked sources · {formatDate(decision.createdAt)}</small></div><Badge tone={statusTone(text(decision, "status", "accepted"))}>{formatLabel(text(decision, "status", "accepted"))}</Badge></article>)}{!projectDecisions.length ? <EmptyTab icon={<ShieldCheck size={22} />} title="No accepted decisions" body="Record a choice only after you have reviewed and accepted its evidence and reasoning." /> : null}</div> : null}

          </div>
        </div>
      </> : <Card className="research-no-project">
        <FlaskConical size={28} aria-hidden="true" />
        <h2>Create your first research project</h2>
        <p>A project gives every paper, source, claim, note, and decision a durable home.</p>
        <Button className="button-primary" onClick={() => setPanel("project")}><Plus size={16} aria-hidden="true" />New project</Button>
        {/* Templates remove the blank-page problem: each is a real starting shape,
            fully editable once created. */}
        <div className="research-templates">
          <p>Or start from a shape:</p>
          <div>
            {projectTemplates.map((template) => (
              <button type="button" key={template.title} disabled={busy} onClick={() => void createProjectFromTemplate(template)}>
                <strong>{template.title}</strong>
                <small>{template.purpose}</small>
              </button>
            ))}
          </div>
        </div>
      </Card>}

      <ConfirmationDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => { if (!open) setConfirmDelete(undefined); }}
        title={confirmDelete ? `Remove “${confirmDelete.title}”?` : ""}
        description="The source is removed from Continuum retrieval. Its audit record is retained, and claims already linked to it keep their provenance."
        confirmLabel="Remove source"
        destructive
        busy={busy}
        onConfirm={() => { const target = confirmDelete; setConfirmDelete(undefined); if (target) void performDeleteSource(target.id); }}
      />
    </div>
  );
}
