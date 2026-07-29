"use client";

/**
 * The Backlog and Goals views (redesign.md §14.2).
 *
 * Backlog is unscheduled work grouped by goal, each row with `Schedule` and
 * `Edit`. Goals is a flat list with progress, target date, and task counts.
 * Neither is a board: Continuum's planning is study scheduling, not project
 * management (§14.2 role decision), so there are no columns to drag between.
 */
import { CalendarPlus, Clock3, Pencil } from "lucide-react";
import { Button, EmptyState, List, ProgressBar, Row, StatusChip } from "@/components/ui";
import { formatLabel, priorityLabel, statusTone } from "@/lib/labels";
import { formatDate, number, text, type Row as StateRow } from "@/components/workspace/types";

const TONES: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  green: "success",
  orange: "warning",
  red: "danger",
  blue: "info",
  neutral: "neutral",
};

const tone = (status: string) => TONES[statusTone(status)] ?? "neutral";

export function BacklogView({
  tasks,
  goals,
  onSchedule,
  onEdit,
  onAddTask,
}: {
  tasks: StateRow[];
  goals: StateRow[];
  onSchedule: (task: StateRow) => void;
  onEdit: (task: StateRow) => void;
  onAddTask: () => void;
}) {
  if (!tasks.length) {
    return <EmptyState title="Nothing in the backlog" body="Every task you have is either done or already scheduled." action={<Button variant="primary" size="sm" onClick={onAddTask}>Add a task</Button>} />;
  }

  const grouped = goals
    .map((goal) => ({ goal, items: tasks.filter((task) => text(task, "goalId") === text(goal, "id")) }))
    .filter((group) => group.items.length);
  const orphans = tasks.filter((task) => !goals.some((goal) => text(goal, "id") === text(task, "goalId")));

  return (
    <div className="plan-backlog">
      {[...grouped, ...(orphans.length ? [{ goal: undefined, items: orphans }] : [])].map((group) => (
        <section key={group.goal ? text(group.goal, "id") : "unlinked"}>
          <h3>{group.goal ? text(group.goal, "title") : "Not linked to a goal"}</h3>
          <List label={`Unscheduled tasks for ${group.goal ? text(group.goal, "title") : "no goal"}`}>
            {group.items.map((task) => (
              <Row
                key={text(task, "id")}
                density="compact"
                title={text(task, "title")}
                meta={
                  <span className="plan-backlog-meta">
                    <Clock3 size={11} aria-hidden="true" />{number(task, "estimatedMinutes", 30)} min
                    {" · "}{priorityLabel(task.priority as number | string)}
                    {task.deadline ? ` · due ${formatDate(task.deadline, { dateStyle: "medium" })}` : ""}
                  </span>
                }
                trailing={<StatusChip tone={tone(text(task, "status", "backlog"))} label={formatLabel(text(task, "status", "backlog"))} />}
                actions={
                  <>
                    <Button variant="secondary" size="sm" onClick={() => onSchedule(task)}><CalendarPlus size={13} aria-hidden="true" />Schedule</Button>
                    <Button variant="quiet" size="sm" onClick={() => onEdit(task)}><Pencil size={13} aria-hidden="true" />Edit</Button>
                  </>
                }
              />
            ))}
          </List>
        </section>
      ))}
    </div>
  );
}

export function GoalsView({
  goals,
  tasks,
  onOpen,
  onAddGoal,
}: {
  goals: StateRow[];
  tasks: StateRow[];
  onOpen: (goalId: string) => void;
  onAddGoal: () => void;
}) {
  if (!goals.length) {
    return <EmptyState title="No goals yet" body="Create the outcome first — every task and study block hangs off one." action={<Button variant="primary" size="sm" onClick={onAddGoal}>New goal</Button>} />;
  }

  return (
    <List label="Goals" className="plan-goal-list">
      {goals.map((goal) => {
        const goalTasks = tasks.filter((task) => text(task, "goalId") === text(goal, "id"));
        const done = goalTasks.filter((task) => text(task, "status") === "done").length;
        const progress = Math.round(Math.max(number(goal, "progress"), goalTasks.length ? done / goalTasks.length : 0) * 100);
        return (
          <Row
            key={text(goal, "id")}
            title={text(goal, "title")}
            meta={
              <span className="plan-goal-meta">
                <ProgressBar value={progress} label={`${text(goal, "title")} progress`} valueText={`${progress}% complete`} />
                <span>{progress}% · {done} of {goalTasks.length} task{goalTasks.length === 1 ? "" : "s"} · {formatDate(goal.targetDate ?? goal.date, { dateStyle: "medium" })}</span>
              </span>
            }
            actions={<Button variant="secondary" size="sm" onClick={() => onOpen(text(goal, "id"))}>Open</Button>}
          />
        );
      })}
    </List>
  );
}
