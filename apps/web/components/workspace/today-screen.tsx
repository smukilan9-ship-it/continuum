"use client";

import { ArrowRight, CalendarClock, Check, Clock3, FileCheck2, Link2, Play, Target } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { PageIntro } from "./page-intro";
import { formatDate, list, text, type Row, type WorkspaceState } from "./types";
import type { WorkspaceView } from "@/lib/workspace-routes";

type PlanPreview = { proposalId?: string; items: Row[]; assumptions: string[] };

export function TodayScreen({ state, userName, onNavigate, onRefresh }: { state: WorkspaceState; userName: string; onNavigate: (view: WorkspaceView) => void; onRefresh: () => Promise<void> }) {
  const nextTask = state.tasks.find((task) => text(task, "status") !== "done");
  const upcoming = state.schedule.filter((block) => new Date(text(block, "end", text(block, "endsAt", "0"))).valueOf() > Date.now());
  const nextBlock = upcoming[0];
  const latestReceipt = state.receipts[0];
  const recentExternal = state.resourceActivities.find((activity) => !["verified", "abandoned"].includes(text(activity, "status")));
  const [plan, setPlan] = useState<PlanPreview>();
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState("");

  async function proposePlan() {
    setPlanBusy(true);
    setPlanError("");
    try {
      const response = await fetch("/api/schedule", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "propose" }) });
      const body = await response.json() as { proposalId?: string; items?: Row[]; assumptions?: string[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "The plan could not be generated");
      setPlan({ proposalId: body.proposalId, items: body.items ?? [], assumptions: body.assumptions ?? [] });
    } catch (error) { setPlanError(error instanceof Error ? error.message : "The plan could not be generated"); }
    finally { setPlanBusy(false); }
  }

  async function commitPlan() {
    if (!plan?.proposalId) return;
    setPlanBusy(true);
    setPlanError("");
    try {
      const response = await fetch("/api/schedule", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "commit", proposalId: plan.proposalId, confirmedAt: new Date().toISOString() }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The plan could not be committed");
      setPlan(undefined);
      setPlanBusy(false);
      await onRefresh();
    } catch (error) { setPlanError(error instanceof Error ? error.message : "The plan could not be committed"); setPlanBusy(false); }
  }

  if (!state.goals.length) return <OnboardingScreen userName={userName} onRefresh={onRefresh} />;

  return (
    <div className="screen">
      <PageIntro eyebrow="TODAY" title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${userName}.`} description="Resume from verified state, not from a blank chat. Your plan and connected assistants use the same current context." />

      <section className="today-grid">
        <Card className="next-action-card">
          <div className="card-kicker"><Target size={16} /><span>Best next action</span></div>
          <h2>{nextTask ? text(nextTask, "title") : "Choose the next outcome"}</h2>
          <p>{nextTask ? text(nextTask, "description", text(nextTask, "completionEvidence", "Complete the task and record evidence.")) : "No unfinished task is recorded. Add a task to an active goal."}</p>
          {nextTask ? <div className="action-evidence"><FileCheck2 size={15} /><span>{text(nextTask, "completionEvidence", "Record completion evidence")}</span></div> : null}
          <Button className="button-primary button-large" onClick={() => onNavigate(nextTask ? "learn" : "goals")}><Play size={16} />{nextTask ? "Find the best resource" : "Open goals"}</Button>
        </Card>

        <Card className="summary-card">
          <div className="card-heading-row"><div><p className="eyebrow">CURRENT STATE</p><h2>At a glance</h2></div><Badge tone="blue">Shared</Badge></div>
          <div className="workspace-metrics"><div><strong>{state.goals.filter((goal) => text(goal, "status", "active") === "active").length}</strong><span>active goals</span></div><div><strong>{state.tasks.filter((task) => text(task, "status") !== "done").length}</strong><span>open tasks</span></div><div><strong>{state.projects.length}</strong><span>projects</span></div><div><strong>{state.receipts.length}</strong><span>receipts</span></div></div>
        </Card>

        <Card className="schedule-card">
          <div className="card-heading-row"><div><p className="eyebrow">SCHEDULE</p><h2>{nextBlock ? "Next block" : "Plan your work"}</h2></div><CalendarClock size={20} /></div>
          {nextBlock ? <div className="next-block"><strong>{text(nextBlock, "title")}</strong><span><Clock3 size={14} />{formatDate(nextBlock.start ?? nextBlock.startsAt)}</span><small>{text(nextBlock, "completionEvidence", "Completion evidence required")}</small></div> : <p>No block is committed. Generate a deterministic proposal; nothing changes until you confirm it.</p>}
          {!nextBlock && !plan ? <Button className="button-secondary" disabled={planBusy || !nextTask} onClick={() => void proposePlan()}>{planBusy ? "Planning…" : "Generate proposal"}<ArrowRight size={15} /></Button> : null}
          {plan ? <div className="plan-preview"><div><strong>{plan.items.length} proposed block{plan.items.length === 1 ? "" : "s"}</strong><button onClick={() => setPlan(undefined)}>Discard</button></div>{plan.items.slice(0, 4).map((item) => <span key={text(item, "id")}>{text(item, "time")} · {text(item, "title")}</span>)}{plan.assumptions.map((assumption) => <small key={assumption}>{assumption}</small>)}{plan.proposalId ? <Button className="button-primary" disabled={planBusy} onClick={() => void commitPlan()}><Check size={15} />{planBusy ? "Committing…" : "Confirm and commit"}</Button> : <small>This local seeded workspace previews the solver without writing a schedule.</small>}</div> : null}
          {planError ? <p className="form-error" role="alert">{planError}</p> : null}
        </Card>

        <Card className="resume-card">
          <div className="card-heading-row"><div><p className="eyebrow">RESUME WHERE YOU STOPPED</p><h2>{recentExternal ? "External work is waiting" : latestReceipt ? "Latest checkpoint" : "No checkpoint yet"}</h2></div><Link2 size={20} /></div>
          {recentExternal ? <><p>You started an external resource and have not completed its return check.</p><Button className="button-secondary" onClick={() => onNavigate("learn")}>Resume handoff<ArrowRight size={15} /></Button></> : latestReceipt ? <><p>{text(latestReceipt, "summary")}</p>{list(latestReceipt, "nextActions").length ? <ul>{list(latestReceipt, "nextActions").slice(0, 3).map((action) => <li key={action}>{action}</li>)}</ul> : null}<span className="subtle-meta">Saved {formatDate(latestReceipt.createdAt)}</span></> : <p>Completing a session in Continuum or through MCP creates a compact receipt with decisions, evidence, unresolved questions, and next actions.</p>}
        </Card>
      </section>
    </div>
  );
}

function OnboardingScreen({ userName, onRefresh }: { userName: string; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const subjects = String(form.get("subjects") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    const preferredTimes = form.getAll("preferredTimes").map(String);
    try {
      // One deterministic call builds the goal, milestones, actionable tasks with
      // dependencies, and a committed initial schedule. Retries are idempotent.
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          academicLevel: String(form.get("academicLevel") ?? ""),
          subjects: subjects.length ? subjects : ["General"],
          primarySubject: subjects[0],
          goalTitle: String(form.get("goalTitle") ?? ""),
          goalOutcome: String(form.get("goalOutcome") ?? ""),
          goalType: String(form.get("goalType") ?? "exam"),
          deadline: String(form.get("deadline") ?? ""),
          weeklyHours: Number(form.get("weeklyHours") ?? 8),
          preferredTimes,
          confidence: String(form.get("confidence") ?? "medium"),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Onboarding could not be completed");
      setBusy(false);
      await onRefresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Onboarding could not be completed"); setBusy(false); }
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="screen onboarding-screen">
      <PageIntro eyebrow="GET STARTED" title={`Let's build your real plan, ${userName}.`} description="Continuum turns this into a goal, milestones, tasks, and a first-week schedule — shared context for the app and every assistant you authorize." />
      <Card className="onboarding-card">
        <div><Badge tone="blue">One step</Badge><h2>Tell us about your goal.</h2><p>We generate milestones, actionable tasks, and an initial schedule deterministically. High-impact assistant changes always stay pending until you approve them.</p></div>
        <form onSubmit={submit} className="workspace-form">
          <label>Academic level<input name="academicLevel" minLength={1} maxLength={120} required placeholder="e.g. CBSE Class 12" /></label>
          <label>Subjects (comma-separated)<input name="subjects" required placeholder="Physics, Mathematics" /></label>
          <label>Goal title<input name="goalTitle" minLength={3} maxLength={120} required placeholder="Ace the Class 12 Physics board exam" /></label>
          <label>Successful outcome<textarea name="goalOutcome" minLength={3} maxLength={500} required placeholder="Score 90%+ and explain the hard concepts independently" /></label>
          <label>Goal type<select name="goalType" defaultValue="exam"><option value="exam">Exam</option><option value="school">School</option><option value="university">University</option><option value="research">Research</option><option value="coding">Coding</option></select></label>
          <label>Deadline<input name="deadline" type="date" required min={today} /></label>
          <label>Weekly study hours<input name="weeklyHours" type="number" min={1} max={80} defaultValue={8} required /></label>
          <label>Starting confidence<select name="confidence" defaultValue="medium"><option value="low">Low — start slow</option><option value="medium">Medium</option><option value="high">High — move fast</option></select></label>
          <fieldset className="onboarding-times"><legend>Preferred study times</legend>{["morning", "afternoon", "evening", "night"].map((slot) => (<label key={slot} className="checkbox-inline"><input type="checkbox" name="preferredTimes" value={slot} />{slot}</label>))}</fieldset>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <Button className="button-primary button-large" disabled={busy}>{busy ? "Building your plan…" : "Generate my plan"}<ArrowRight size={16} /></Button>
        </form>
      </Card>
    </div>
  );
}
