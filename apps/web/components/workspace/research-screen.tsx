"use client";

import {
  ArrowUpRight,
  Beaker,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Database,
  FileCheck2,
  FileText,
  FlaskConical,
  FolderKanban,
  Lightbulb,
  Link2,
  LoaderCircle,
  NotebookPen,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge, Button, Card, LoadingButton, Modal } from "@/components/ui";
import { formatLabel, sourceTypeLabel, statusTone } from "@/lib/labels";
import type { NormalizedScholarlyWork, ScholarlySearchMode } from "@/lib/scholarly";
import { workspacePath } from "@/lib/workspace-routes";
import { PageIntro } from "./page-intro";
import { formatDate, list, postState, text, type Row, type WorkspaceState } from "./types";

type Toast = (message: string | null) => void;
type Panel = "project" | "source" | "decision";
type ResearchTab = "overview" | "discovery" | "papers" | "notes" | "claims" | "experiments" | "decisions" | "drafts";
type ProviderStatus = { provider: "openalex" | "crossref" | "semantic-scholar"; status: "live" | "unconfigured" | "failed"; message?: string };
type DiscoveryResponse = { results: NormalizedScholarlyWork[]; providers: ProviderStatus[]; scholarHandoffUrl: string; error?: string };

const tabs: Array<{ id: ResearchTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "discovery", label: "Discovery" },
  { id: "papers", label: "Papers" },
  { id: "notes", label: "Notes" },
  { id: "claims", label: "Claims" },
  { id: "experiments", label: "Experiments" },
  { id: "decisions", label: "Decisions" },
  { id: "drafts", label: "Drafts" },
];

function scoped(rows: Row[], projectId: string) {
  return rows.filter((row) => text(row, "projectId") === projectId);
}

function authorLine(work: NormalizedScholarlyWork) {
  if (!work.authors.length) return "Authors unavailable";
  return work.authors.length > 4 ? `${work.authors.slice(0, 4).join(", ")} +${work.authors.length - 4}` : work.authors.join(", ");
}

function EmptyTab({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <div className="research-empty-tab"><span>{icon}</span><h3>{title}</h3><p>{body}</p></div>;
}

export function ResearchScreen({ state, showToast, onRefresh }: { state: WorkspaceState; showToast: Toast; onRefresh: () => Promise<void> }) {
  const [panel, setPanel] = useState<Panel>();
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<ResearchTab>("overview");
  const [projectId, setProjectId] = useState(() => text(state.projects[0], "id"));
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ScholarlySearchMode>("keywords");
  const [provider, setProvider] = useState<"all" | "openalex" | "crossref">("all");
  const [openAccess, setOpenAccess] = useState(false);
  const [fromYear, setFromYear] = useState("");
  const [toYear, setToYear] = useState("");
  const [searching, setSearching] = useState(false);
  const [discovery, setDiscovery] = useState<DiscoveryResponse>();
  const [searchError, setSearchError] = useState<string>();
  const [savingPaper, setSavingPaper] = useState<string>();
  const [sourceDirty, setSourceDirty] = useState(false);

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

  async function deleteSource(sourceId: string, title: string) {
    if (!window.confirm(`Remove “${title}” from Continuum retrieval? The audit record is retained.`)) return;
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

  async function runDiscovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setSearchError(undefined);
    const params = new URLSearchParams({ q: query, mode, provider });
    if (openAccess) params.set("openAccess", "true");
    if (fromYear) params.set("fromYear", fromYear);
    if (toYear) params.set("toYear", toYear);
    try {
      const response = await fetch(`/api/research/discovery?${params}`);
      const body = await response.json() as DiscoveryResponse;
      if (!response.ok) throw new Error(body.error ?? "Paper discovery could not be completed.");
      setDiscovery(body);
    } catch (error) { setSearchError(error instanceof Error ? error.message : "Paper discovery could not be completed."); }
    finally { setSearching(false); }
  }

  async function saveDiscoveredPaper(work: NormalizedScholarlyWork) {
    if (!projectId) return;
    setSavingPaper(`${work.sourceProvider}:${work.providerId}`);
    try {
      const response = await fetch("/api/research/discovery", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", projectId, work }) });
      const body = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error ?? "The paper could not be saved.");
      showToast(body.message ?? "Paper saved.");
      await onRefresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "The paper could not be saved."); }
    finally { setSavingPaper(undefined); }
  }

  function chooseProject(nextProjectId: string) {
    setProjectId(nextProjectId);
    setActiveTab("overview");
  }

  return (
    <div className="screen research-screen">
      <PageIntro eyebrow="RESEARCH" title="Evidence, not browser tabs." description="Discover papers, preserve exact sources, test claims, and keep decisions attached to the project they change." action={<><a className="button button-secondary" href={workspacePath.integrations}><Link2 size={16} />Connect tools</a><Button className="button-primary" onClick={() => setPanel(panel === "project" ? undefined : "project")}><Plus size={16} />New project</Button></>} />

      {panel === "project" ? <Card className="inline-form-card"><div className="inline-form-heading"><div><h2>Create a research project</h2><p>Give it a bounded purpose and an honest current phase.</p></div><button onClick={() => setPanel(undefined)}>Cancel</button></div><form className="workspace-form form-grid" onSubmit={createProject}><label>Project title<input name="title" required minLength={3} maxLength={200} /></label><label>Phase<input name="phase" defaultValue="Discovery" maxLength={100} /></label><label>Linked goal<select name="goalId"><option value="">No linked goal</option>{state.goals.map((goal) => <option key={text(goal, "id")} value={text(goal, "id")}>{text(goal, "title")}</option>)}</select></label><label className="full-field">Purpose<textarea name="purpose" required minLength={3} maxLength={1000} /></label><div className="form-actions"><Button className="button-primary" disabled={busy}>{busy ? "Saving…" : "Create project"}</Button></div></form></Card> : null}

      <Modal
        open={panel === "source"}
        onOpenChange={(open) => { if (!open) { setPanel(undefined); setSourceDirty(false); } }}
        title="Add a source"
        description="Add a PDF or readable text file to this project’s source library."
        dirty={sourceDirty && !busy}
        dirtyMessage="Discard this selected source? It has not been uploaded yet."
        footer={<><Button className="button-secondary" type="button" disabled={busy} onClick={() => { if (!sourceDirty || window.confirm("Discard this selected source?")) { setSourceDirty(false); setPanel(undefined); } }}>Cancel</Button><LoadingButton form="source-upload-form" className="button-primary" loading={busy} loadingLabel="Indexing source…"><Upload size={15} />Add and index source</LoadingButton></>}
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

      {panel === "decision" ? <Card className="inline-form-card"><div className="inline-form-heading"><div><h2>Record an accepted decision</h2><p>Use this only for a decision you reviewed and accepted.</p></div><button onClick={() => setPanel(undefined)}>Cancel</button></div><form className="workspace-form form-grid" onSubmit={saveDecision}><input type="hidden" name="projectId" value={projectId} /><label className="full-field">Decision<textarea name="text" required minLength={3} maxLength={2000} /></label><label className="full-field">Reasoning<textarea name="reasoning" required minLength={3} maxLength={5000} /></label>{projectSources.length ? <fieldset className="source-choice full-field"><legend>Supporting sources</legend>{projectSources.map((source) => <label key={text(source, "id")}><input type="checkbox" name="sourceIds" value={text(source, "id")} />{text(source, "title")}</label>)}</fieldset> : null}<div className="form-actions"><Button className="button-primary" disabled={busy}><CheckCircle2 size={15} />{busy ? "Saving…" : "Save accepted decision"}</Button></div></form></Card> : null}

      {selectedProject ? <>
        <Card className="research-project-hero">
          <div className="research-project-switcher">
            <label htmlFor="research-project">Active project</label>
            <div><FolderKanban size={17} /><select id="research-project" value={projectId} onChange={(event) => chooseProject(event.target.value)}>{state.projects.map((project) => <option key={text(project, "id")} value={text(project, "id")}>{text(project, "title")}</option>)}</select><ChevronDown size={16} /></div>
          </div>
          <div className="research-project-title"><div><Badge tone="blue">{formatLabel(text(selectedProject, "phase", "Discovery"))}</Badge><h2>{text(selectedProject, "title")}</h2><p>{text(selectedProject, "purpose")}</p></div><div className="research-project-actions"><Button className="button-secondary" onClick={() => setPanel(panel === "source" ? undefined : "source")}><Upload size={15} />Add source</Button><Button className="button-secondary" onClick={() => setPanel(panel === "decision" ? undefined : "decision")}><ShieldCheck size={15} />Record decision</Button></div></div>
          <div className="research-project-metrics"><span><strong>{projectPapers.length}</strong> papers</span><span><strong>{projectSources.length}</strong> indexed sources</span><span><strong>{projectClaims.length}</strong> claims</span><span><strong>{projectDecisions.length}</strong> decisions</span></div>
        </Card>

        <div className="research-tabs-shell">
          <nav className="research-tabs" aria-label="Research workspace sections">{tabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? "active" : ""} aria-current={activeTab === tab.id ? "page" : undefined} onClick={() => setActiveTab(tab.id)}>{tab.label}{tab.id === "papers" && projectPapers.length ? <span>{projectPapers.length}</span> : null}</button>)}</nav>

          <div className="research-tab-panel">
            {activeTab === "overview" ? <div className="research-overview-grid">
              <Card className="research-focus-card"><div className="research-card-kicker"><Sparkles size={16} />NEXT MILESTONE</div><h3>{text(nextTask, "title", "Define the next evidence-producing task")}</h3><p>{text(nextTask, "description", "Connect a concrete task to this project so Continuum can carry it into the weekly plan.")}</p><div className="research-focus-meta"><span>{nextTask ? `${String(nextTask.estimatedMinutes ?? "—")} min` : "No estimate"}</span><span>{nextTask?.deadline ? `Due ${formatDate(nextTask.deadline, { dateStyle: "medium" })}` : "No deadline"}</span><Badge tone={statusTone(text(nextTask, "status", "planned"))}>{formatLabel(text(nextTask, "status", "planned"))}</Badge></div></Card>
              <Card className="research-status-card"><div className="research-card-kicker"><FolderKanban size={16} />PROJECT STATE</div><dl><div><dt>Linked goal</dt><dd>{text(projectGoal, "title", "No linked goal")}</dd></div><div><dt>Target</dt><dd>{projectGoal?.targetDate ? formatDate(projectGoal.targetDate, { dateStyle: "medium" }) : "Not set"}</dd></div><div><dt>Evidence base</dt><dd>{projectSources.length + projectPapers.length} records</dd></div></dl></Card>
              <Card className="research-warning-card"><div className="research-card-kicker"><ShieldCheck size={16} />LATEST ACCEPTED DECISION</div>{projectDecisions[0] ? <><h3>{text(projectDecisions[0], "text")}</h3><p>{text(projectDecisions[0], "reasoning")}</p><button onClick={() => setActiveTab("decisions")}>View decision ledger <ArrowUpRight size={14} /></button></> : <EmptyTab icon={<ShieldCheck size={20} />} title="No accepted decision" body="Record decisions only after you review the evidence and accept the reasoning." />}</Card>
              <Card className="research-library-card"><div className="research-section-heading"><div><div className="research-card-kicker"><Database size={16} />SOURCE LIBRARY</div><h3>{projectSources.length} indexed source{projectSources.length === 1 ? "" : "s"}</h3></div><Button className="button-secondary compact-button" onClick={() => setPanel("source")}><Plus size={14} />Add</Button></div>{projectSources.slice(0, 4).map((source) => <div className="research-source-row" key={text(source, "id")}><FileText size={17} /><div><strong>{text(source, "title")}</strong><span>{sourceTypeLabel(text(source, "mimeType", "document"))} · v{String(source.sourceVersion ?? 1)}</span></div><button disabled={busy} onClick={() => void deleteSource(text(source, "id"), text(source, "title"))} aria-label={`Delete ${text(source, "title")}`}><Trash2 size={15} /></button></div>)}{!projectSources.length ? <EmptyTab icon={<FileText size={20} />} title="No indexed sources" body="Upload a PDF or text source to create stable, citeable passages." /> : null}</Card>
            </div> : null}

            {activeTab === "discovery" ? <div className="research-discovery">
              <div className="research-section-heading"><div><div className="research-card-kicker"><Search size={16} />PAPER DISCOVERY</div><h3>Search scholarly metadata</h3><p>OpenAlex and Crossref results are normalized and deduplicated. Saving preserves provider provenance.</p></div></div>
              <form className="discovery-form" onSubmit={runDiscovery}>
                <label className="discovery-query"><span>Query</span><div><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} maxLength={500} required placeholder="Methods, title, author, or DOI" /><Button className="button-primary" disabled={searching}>{searching ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}{searching ? "Searching…" : "Search"}</Button></div></label>
                <div className="discovery-filters"><label>Search by<select value={mode} onChange={(event) => setMode(event.target.value as ScholarlySearchMode)}><option value="keywords">Keywords</option><option value="title">Title</option><option value="author">Author</option><option value="doi">DOI</option></select></label><label>Provider<select value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)}><option value="all">OpenAlex + Crossref</option><option value="openalex">OpenAlex</option><option value="crossref">Crossref</option></select></label><label>From year<input inputMode="numeric" pattern="[0-9]*" value={fromYear} onChange={(event) => setFromYear(event.target.value)} placeholder="2018" /></label><label>To year<input inputMode="numeric" pattern="[0-9]*" value={toYear} onChange={(event) => setToYear(event.target.value)} placeholder="2026" /></label><label className="discovery-check"><input type="checkbox" checked={openAccess} onChange={(event) => setOpenAccess(event.target.checked)} />Open access only</label></div>
              </form>
              {searchError ? <div className="research-callout error"><CircleAlert size={17} /><span>{searchError}</span></div> : null}
              {discovery ? <><div className="provider-status-row">{discovery.providers.map((entry) => <span key={entry.provider} className={`provider-status ${entry.status}`} title={entry.message}><i />{entry.provider === "openalex" ? "OpenAlex" : entry.provider === "semantic-scholar" ? "Semantic Scholar" : "Crossref"}: {entry.status}</span>)}<a href={discovery.scholarHandoffUrl} target="_blank" rel="noreferrer">Search Google Scholar manually <ArrowUpRight size={13} /></a></div><div className="discovery-results"><div className="discovery-result-count">{discovery.results.length} deduplicated result{discovery.results.length === 1 ? "" : "s"}</div>{discovery.results.map((work) => { const key = `${work.sourceProvider}:${work.providerId}`; const alreadySaved = projectPapers.some((paper) => (work.doi && text(paper, "doi").toLowerCase() === work.doi) || text(paper, "title").toLowerCase() === work.title.toLowerCase()); return <article className="paper-result" key={key}><div className="paper-result-main"><div className="paper-result-badges"><Badge tone={work.openAccess ? "green" : "neutral"}>{work.openAccess ? "Open access" : "Metadata"}</Badge><span>{work.sourceProvider === "openalex" ? "OpenAlex" : work.sourceProvider === "semantic-scholar" ? "Semantic Scholar" : "Crossref"}</span>{work.type ? <span>{formatLabel(work.type)}</span> : null}</div><h4>{work.title}</h4><p className="paper-authors">{authorLine(work)}</p><p className="paper-venue">{[work.venue, work.year].filter(Boolean).join(" · ") || "Publication details unavailable"}{work.citedByCount !== undefined ? ` · ${work.citedByCount} citations` : ""}</p>{work.abstract ? <p className="paper-abstract">{work.abstract}</p> : <p className="paper-abstract unavailable">Abstract unavailable from this provider.</p>}{work.topics.length ? <div className="paper-topics">{work.topics.slice(0, 4).map((topic) => <span key={topic}>{topic}</span>)}</div> : null}</div><div className="paper-result-actions">{work.landingPageUrl ? <a className="button button-secondary" href={work.landingPageUrl} target="_blank" rel="noreferrer">Open <ArrowUpRight size={14} /></a> : null}<Button className="button-primary" disabled={alreadySaved || savingPaper === key} onClick={() => void saveDiscoveredPaper(work)}>{savingPaper === key ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}{alreadySaved ? "Saved" : savingPaper === key ? "Saving…" : "Save"}</Button></div></article>;})}{!discovery.results.length ? <EmptyTab icon={<Search size={22} />} title="No matching metadata" body="Try a broader query, remove filters, or use the Google Scholar search handoff." /> : null}</div></> : <EmptyTab icon={<BookOpen size={22} />} title="Start with a precise query" body="Search by keywords, exact title, author, or DOI. No paper is added until you choose Save." />}
            </div> : null}

            {activeTab === "papers" ? <div className="research-record-list"><div className="research-section-heading"><div><div className="research-card-kicker"><BookOpen size={16} />SAVED PAPERS</div><h3>{projectPapers.length} paper{projectPapers.length === 1 ? "" : "s"}</h3></div><Button className="button-primary compact-button" onClick={() => setActiveTab("discovery")}><Search size={14} />Discover papers</Button></div>{projectPapers.map((paper) => <article className="research-record" key={text(paper, "id")}><span><BookOpen size={18} /></span><div><h4>{text(paper, "title")}</h4><p>{list(paper, "authors").join(", ") || "Authors unavailable"}</p><small>{[paper.year, text(paper, "doi") ? `doi:${text(paper, "doi")}` : undefined].filter(Boolean).join(" · ")}</small></div><Badge tone={paper.sourceId ? "green" : "neutral"}>{paper.sourceId ? "Full source" : "Metadata"}</Badge></article>)}{!projectPapers.length ? <EmptyTab icon={<BookOpen size={22} />} title="No saved papers" body="Use Discovery to search OpenAlex and Crossref, then save only relevant records." /> : null}</div> : null}

            {activeTab === "notes" ? <div className="research-record-list"><div className="research-section-heading"><div><div className="research-card-kicker"><NotebookPen size={16} />RESEARCH NOTES</div><h3>{projectNotes.length} note{projectNotes.length === 1 ? "" : "s"}</h3></div></div>{projectNotes.map((note) => <article className="research-record note" key={text(note, "id")}><span><NotebookPen size={18} /></span><div><p>{text(note, "text")}</p><small>{text(note, "sourceId") ? "Linked to an exact project source" : "Project note"} · {formatLabel(text(note, "createdBy", "user"))}</small></div></article>)}{!projectNotes.length ? <EmptyTab icon={<NotebookPen size={22} />} title="No research notes" body="Notes created from exact source passages will appear here with their provenance." /> : null}</div> : null}

            {activeTab === "claims" ? <div className="research-record-list"><div className="research-section-heading"><div><div className="research-card-kicker"><FileCheck2 size={16} />CLAIM LEDGER</div><h3>{projectClaims.length} claim{projectClaims.length === 1 ? "" : "s"}</h3></div></div>{projectClaims.map((claim) => <article className="research-record" key={text(claim, "id")}><span><Lightbulb size={18} /></span><div><h4>{text(claim, "text")}</h4><small>Created by {formatLabel(text(claim, "createdBy", "user"))}{text(claim, "verificationModel") ? ` · checked by ${text(claim, "verificationModel")}` : " · awaiting independent verification"}</small></div><Badge tone={statusTone(text(claim, "status", "unverified"))}>{formatLabel(text(claim, "status", "unverified"))}</Badge></article>)}{!projectClaims.length ? <EmptyTab icon={<FileCheck2 size={22} />} title="No evidence-linked claims" body="Claims remain visibly unverified until exact supporting or contradicting passages are attached." /> : null}</div> : null}

            {activeTab === "experiments" ? <EmptyTab icon={<Beaker size={23} />} title="No experiment record yet" body="Experiment artifacts and bounded computational runs will appear here when saved to this project." /> : null}

            {activeTab === "decisions" ? <div className="research-record-list"><div className="research-section-heading"><div><div className="research-card-kicker"><ShieldCheck size={16} />DECISION LEDGER</div><h3>Accepted and superseded choices</h3></div><Button className="button-primary compact-button" onClick={() => setPanel("decision")}><Plus size={14} />Record decision</Button></div>{projectDecisions.map((decision) => <article className="research-record decision" key={text(decision, "id")}><span><ShieldCheck size={18} /></span><div><h4>{text(decision, "text")}</h4><p>{text(decision, "reasoning")}</p><small>{list(decision, "sourceIds").length} linked sources · {formatDate(decision.createdAt)}</small></div><Badge tone={statusTone(text(decision, "status", "accepted"))}>{formatLabel(text(decision, "status", "accepted"))}</Badge></article>)}{!projectDecisions.length ? <EmptyTab icon={<ShieldCheck size={22} />} title="No accepted decisions" body="Record a choice only after you have reviewed and accepted its evidence and reasoning." /> : null}</div> : null}

            {activeTab === "drafts" ? <EmptyTab icon={<FileText size={23} />} title="No saved draft" body="Generated text must be reviewed before it becomes a project artifact; drafts stay separate from accepted findings." /> : null}
          </div>
        </div>
      </> : <Card className="research-no-project"><FlaskConical size={28} /><h2>Create your first research project</h2><p>A project gives every paper, source, claim, note, and decision a durable home.</p><Button className="button-primary" onClick={() => setPanel("project")}><Plus size={16} />New project</Button></Card>}
    </div>
  );
}
