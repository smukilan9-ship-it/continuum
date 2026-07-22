"use client";

import { CheckCircle2, Database, FileText, FlaskConical, Plus, ShieldCheck, Trash2, Upload } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { PageIntro } from "./page-intro";
import { formatLabel, sourceTypeLabel, statusTone } from "@/lib/labels";
import { formatDate, list, postState, text, type WorkspaceState } from "./types";

type Toast = (message: string | null) => void;

export function ResearchScreen({ state, showToast, onRefresh }: { state: WorkspaceState; showToast: Toast; onRefresh: () => Promise<void> }) {
  const [panel, setPanel] = useState<"project" | "source" | "decision">();
  const [busy, setBusy] = useState(false);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await postState("project.created", "Created a research project in the standalone app.", { title: String(data.get("title")), purpose: String(data.get("purpose")), phase: String(data.get("phase")), goalId: String(data.get("goalId")) || undefined });
      setPanel(undefined);
      setBusy(false);
      showToast("Project saved to shared state.");
      await onRefresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "The project could not be saved"); setBusy(false); }
  }

  async function uploadSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/sources", { method: "POST", body: new FormData(event.currentTarget) });
      const body = await response.json() as { duplicate?: boolean; source?: { title?: string }; error?: string };
      if (!response.ok) throw new Error(body.error ?? "The source could not be indexed");
      setPanel(undefined);
      setBusy(false);
      showToast(body.duplicate ? "That exact source is already indexed." : "Source indexed with stable passages and retrieval metadata.");
      await onRefresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "The source could not be indexed"); setBusy(false); }
  }

  async function saveDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await postState("research.decision.saved", "Saved an accepted research decision in the standalone app.", { projectId: String(data.get("projectId")), text: String(data.get("text")), reasoning: String(data.get("reasoning")), sourceIds: data.getAll("sourceIds").map(String), userApproved: true });
      setPanel(undefined);
      setBusy(false);
      showToast("Accepted decision saved with its source links.");
      await onRefresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "The decision could not be saved"); setBusy(false); }
  }

  async function deleteSource(sourceId: string, title: string) {
    if (!window.confirm(`Remove “${title}” from Continuum retrieval? The audit record is retained.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/sources?sourceId=${encodeURIComponent(sourceId)}`, { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The source could not be removed");
      setBusy(false);
      showToast("Source excluded from retrieval and cleanup queued.");
      await onRefresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "The source could not be removed"); setBusy(false); }
  }

  return (
    <div className="screen">
      <PageIntro eyebrow="RESEARCH" title="Projects where every claim can point back to evidence." description="Keep projects, sources, accepted decisions, unresolved questions, and assistant work in one user-scoped research state." action={<><Button className="button-secondary" onClick={() => setPanel(panel === "source" ? undefined : "source")} disabled={!state.projects.length}><Upload size={16} />Add source</Button><Button className="button-secondary" onClick={() => setPanel(panel === "decision" ? undefined : "decision")} disabled={!state.projects.length}><ShieldCheck size={16} />Record decision</Button><Button className="button-primary" onClick={() => setPanel(panel === "project" ? undefined : "project")}><Plus size={16} />New project</Button></>} />

      {panel === "project" ? <Card className="inline-form-card"><div className="inline-form-heading"><div><h2>Create a research project</h2><p>Give it a bounded purpose and an honest current phase.</p></div><button onClick={() => setPanel(undefined)}>Cancel</button></div><form className="workspace-form form-grid" onSubmit={createProject}><label>Project title<input name="title" required minLength={3} maxLength={200} /></label><label>Phase<input name="phase" defaultValue="Discovery" maxLength={100} /></label><label>Linked goal<select name="goalId"><option value="">No linked goal</option>{state.goals.map((goal) => <option key={text(goal, "id")} value={text(goal, "id")}>{text(goal, "title")}</option>)}</select></label><label className="full-field">Purpose<textarea name="purpose" required minLength={3} maxLength={1000} /></label><div className="form-actions"><Button className="button-primary" disabled={busy}>{busy ? "Saving…" : "Create project"}</Button></div></form></Card> : null}

      {panel === "source" ? <Card className="inline-form-card"><div className="inline-form-heading"><div><h2>Index a source</h2><p>PDF or text, up to 10 MB and 500,000 extracted characters. Content is treated as untrusted evidence, not instructions.</p></div><button onClick={() => setPanel(undefined)}>Cancel</button></div><form className="workspace-form form-grid" onSubmit={uploadSource}><label>Project<select name="projectId" required>{state.projects.map((project) => <option key={text(project, "id")} value={text(project, "id")}>{text(project, "title")}</option>)}</select></label><label>File<input name="file" type="file" accept="application/pdf,text/plain,.txt,.md" required /></label><div className="form-actions"><Button className="button-primary" disabled={busy}><Upload size={15} />{busy ? "Indexing…" : "Upload and index"}</Button></div></form></Card> : null}

      {panel === "decision" ? <Card className="inline-form-card"><div className="inline-form-heading"><div><h2>Record an accepted decision</h2><p>Only use this for a decision you have reviewed and accepted.</p></div><button onClick={() => setPanel(undefined)}>Cancel</button></div><form className="workspace-form form-grid" onSubmit={saveDecision}><label>Project<select name="projectId" required>{state.projects.map((project) => <option key={text(project, "id")} value={text(project, "id")}>{text(project, "title")}</option>)}</select></label><label className="full-field">Decision<textarea name="text" required minLength={3} maxLength={2000} /></label><label className="full-field">Reasoning<textarea name="reasoning" required minLength={3} maxLength={5000} /></label>{state.sources.length ? <fieldset className="source-choice full-field"><legend>Supporting sources</legend>{state.sources.map((source) => <label key={text(source, "id")}><input type="checkbox" name="sourceIds" value={text(source, "id")} />{text(source, "title")}</label>)}</fieldset> : null}<div className="form-actions"><Button className="button-primary" disabled={busy}><CheckCircle2 size={15} />{busy ? "Saving…" : "Save accepted decision"}</Button></div></form></Card> : null}

      <section className="research-layout">
        <div className="project-list">
          {state.projects.map((project) => {
            const projectId = text(project, "id");
            const decisions = state.decisions.filter((decision) => text(decision, "projectId") === projectId);
            const notes = state.notes.filter((note) => text(note, "projectId") === projectId);
            const sources = state.sources.filter((source) => text(source, "projectId") === projectId);
            return <Card className="project-card" key={projectId}><div className="project-card-heading"><span><FlaskConical size={19} /></span><Badge tone="blue">{formatLabel(text(project, "phase", "Discovery"))}</Badge></div><h2>{text(project, "title")}</h2><p>{text(project, "purpose")}</p><div className="project-counts"><span><Database size={14} />{sources.length} sources</span><span><ShieldCheck size={14} />{decisions.length} decisions</span><span><FileText size={14} />{notes.length} notes</span></div>{decisions[0] ? <div className="latest-decision"><strong>Current decision</strong><span>{text(decisions[0], "text")}</span><small>{formatDate(decisions[0].createdAt)}</small></div> : <div className="empty-inline">No accepted decision recorded yet.</div>}</Card>;
          })}
          {!state.projects.length ? <Card className="empty-record"><FlaskConical size={25} /><h2>No research project yet</h2><p>Create a bounded project here, or approve one proposed by Claude from Activity.</p></Card> : null}
        </div>

        <Card className="source-library"><div className="library-heading"><div><p className="eyebrow">SOURCE LIBRARY</p><h2>{state.sources.length} indexed source{state.sources.length === 1 ? "" : "s"}</h2></div><Database size={20} /></div>{state.sources.map((source) => <div className="source-row" key={text(source, "id")}><FileText size={18} /><div><strong>{text(source, "title")}</strong><span>{sourceTypeLabel(text(source, "mimeType", "document"))} · v{String(source.sourceVersion ?? 1)}</span><small>Indexed {formatDate(source.createdAt)}</small></div><button disabled={busy} onClick={() => void deleteSource(text(source, "id"), text(source, "title"))} aria-label={`Delete ${text(source, "title")}`}><Trash2 size={16} /></button></div>)}{!state.sources.length ? <div className="empty-inline"><FileText size={19} /><span>Add a PDF or text file to create stable, source-linked passages.</span></div> : null}</Card>
      </section>

      {state.decisions.length ? <section className="decision-ledger"><div className="section-heading"><div><p className="eyebrow">DECISION LEDGER</p><h2>Accepted and superseded choices</h2></div></div>{state.decisions.map((decision) => <Card className="decision-row" key={text(decision, "id")}><ShieldCheck size={18} /><div><strong>{text(decision, "text")}</strong><p>{text(decision, "reasoning")}</p><span>{list(decision, "sourceIds").length} linked sources · {formatDate(decision.createdAt)}</span></div><Badge tone={statusTone(text(decision, "status", "accepted"))}>{formatLabel(text(decision, "status", "accepted"))}</Badge></Card>)}</section> : null}
    </div>
  );
}
