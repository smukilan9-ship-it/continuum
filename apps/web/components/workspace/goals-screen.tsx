"use client";

import { CalendarClock, Check, CheckCircle2, Circle, Flag, Plus, Target } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card } from "@/components/ui";
import { PageIntro } from "./page-intro";
import { formatDate, number, postState, text, type WorkspaceState } from "./types";

type Toast = (message: string | null) => void;

export function GoalsScreen({ state, showToast }: { state: WorkspaceState; showToast: Toast }) {
  const router = useRouter();
  const [form, setForm] = useState<"goal" | "task">();
  const [busy, setBusy] = useState(false);

  async function submitGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await postState("goal.created", "Created a goal in the standalone app.", { title: String(data.get("title")), outcome: String(data.get("outcome")), date: String(data.get("date")) });
      setForm(undefined);
      setBusy(false);
      showToast("Goal saved to the shared academic state.");
      router.refresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "The goal could not be saved"); setBusy(false); }
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const deadline = String(data.get("deadline"));
    try {
      await postState("task.created", "Created a goal-linked task in the standalone app.", {
        goalId: String(data.get("goalId")),
        title: String(data.get("title")),
        description: String(data.get("description")) || undefined,
        estimatedMinutes: Number(data.get("estimatedMinutes")),
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
        priority: Number(data.get("priority")),
        completionEvidence: String(data.get("completionEvidence")) || undefined,
      });
      setForm(undefined);
      setBusy(false);
      showToast("Task saved. It is available to the scheduler and connected assistants.");
      router.refresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "The task could not be saved"); setBusy(false); }
  }

  async function completeTask(taskId: string) {
    setBusy(true);
    try {
      await postState("task.progress.recorded", "Marked a task complete in the standalone app.", { entityId: taskId, status: "done" });
      setBusy(false);
      showToast("Task completed and recorded in shared state.");
      router.refresh();
    } catch (error) { showToast(error instanceof Error ? error.message : "The task could not be updated"); setBusy(false); }
  }

  return (
    <div className="screen">
      <PageIntro eyebrow="GOALS" title="Outcomes, tasks, and proof of completion." description="Goals are shared with authorized assistants. Tasks stay concrete: time estimate, deadline, priority, and the evidence that counts as done." action={<><Button className="button-secondary" onClick={() => setForm(form === "task" ? undefined : "task")} disabled={!state.goals.length}><Plus size={16} />New task</Button><Button className="button-primary" onClick={() => setForm(form === "goal" ? undefined : "goal")}><Plus size={16} />New goal</Button></>} />

      {form === "goal" ? <Card className="inline-form-card"><div className="inline-form-heading"><div><h2>Create a goal</h2><p>Define the outcome before creating work.</p></div><button onClick={() => setForm(undefined)}>Cancel</button></div><form className="workspace-form form-grid" onSubmit={submitGoal}><label>Goal title<input name="title" required minLength={3} maxLength={120} placeholder="Complete the statistics module" /></label><label>Target date<input name="date" type="date" required /></label><label className="full-field">Successful outcome<textarea name="outcome" required minLength={3} maxLength={500} placeholder="Pass the final assessment and explain each core method" /></label><div className="form-actions"><Button className="button-primary" disabled={busy}>{busy ? "Saving…" : "Save goal"}</Button></div></form></Card> : null}

      {form === "task" ? <Card className="inline-form-card"><div className="inline-form-heading"><div><h2>Add a task</h2><p>Give the scheduler enough information to place real work.</p></div><button onClick={() => setForm(undefined)}>Cancel</button></div><form className="workspace-form form-grid" onSubmit={submitTask}><label>Goal<select name="goalId" required>{state.goals.map((goal) => <option key={text(goal, "id")} value={text(goal, "id")}>{text(goal, "title")}</option>)}</select></label><label>Task title<input name="title" required minLength={3} maxLength={200} /></label><label className="full-field">Description<input name="description" maxLength={500} placeholder="What specifically needs to happen?" /></label><label>Estimated minutes<input name="estimatedMinutes" type="number" min="5" max="1440" defaultValue="30" required /></label><label>Deadline<input name="deadline" type="datetime-local" /></label><label>Priority<select name="priority" defaultValue="3"><option value="5">Highest</option><option value="4">High</option><option value="3">Normal</option><option value="2">Low</option><option value="1">Lowest</option></select></label><label>Completion evidence<input name="completionEvidence" maxLength={500} placeholder="Pass two unseen problems" /></label><div className="form-actions"><Button className="button-primary" disabled={busy}>{busy ? "Saving…" : "Save task"}</Button></div></form></Card> : null}

      <section className="goal-list">
        {state.goals.map((goal) => {
          const goalId = text(goal, "id");
          const tasks = state.tasks.filter((task) => text(task, "goalId") === goalId);
          const completed = tasks.filter((task) => text(task, "status") === "done").length;
          const progress = Math.max(number(goal, "progress"), tasks.length ? completed / tasks.length : 0);
          return (
            <Card className="goal-card" key={goalId}>
              <div className="goal-card-head"><div><Badge tone={text(goal, "status", "active") === "active" ? "blue" : "neutral"}>{text(goal, "status", "active")}</Badge><h2>{text(goal, "title")}</h2><p>{text(goal, "outcome")}</p></div><div className="goal-progress"><strong>{Math.round(progress * 100)}%</strong><span>progress</span></div></div>
              <div className="goal-meta"><span><CalendarClock size={15} />Due {formatDate(goal.targetDate ?? goal.date, { dateStyle: "medium" })}</span><span><Flag size={15} />{tasks.length} task{tasks.length === 1 ? "" : "s"}</span><span><CheckCircle2 size={15} />{completed} complete</span></div>
              <div className="goal-progress-track"><span style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }} /></div>
              <div className="task-list">
                {tasks.map((task) => {
                  const done = text(task, "status") === "done";
                  return <div className="task-row" key={text(task, "id")}><span className={done ? "task-check done" : "task-check"}>{done ? <Check size={14} /> : <Circle size={14} />}</span><div><strong>{text(task, "title")}</strong><span>{number(task, "estimatedMinutes", 30)} min · {text(task, "completionEvidence", "No evidence rule set")}</span></div><Badge tone={done ? "green" : text(task, "status") === "blocked" ? "orange" : "neutral"}>{text(task, "status", "backlog")}</Badge>{!done ? <button className="task-complete" disabled={busy} onClick={() => void completeTask(text(task, "id"))}>Mark done</button> : null}</div>;
                })}
                {!tasks.length ? <div className="empty-inline"><Target size={18} /><span>No tasks yet. Add the first concrete step.</span></div> : null}
              </div>
            </Card>
          );
        })}
        {!state.goals.length ? <Card className="empty-record"><Target size={25} /><h2>No goals yet</h2><p>Create the first outcome. Continuum will keep it available to this app and every authorized assistant.</p></Card> : null}
      </section>
    </div>
  );
}
