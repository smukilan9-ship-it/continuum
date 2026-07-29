"use client";

import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  Check,
  CircleDot,
  Clock3,
  FileText,
  FlaskConical,
  ListTodo,
  Target,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { conceptLabel, formatLabel, masteryLabel, statusTone } from "@/lib/labels";
import type { WorkspaceView } from "@/lib/workspace-routes";
import { PageHeader } from "./page-header";
import { formatDate, list, number, text, type Row, type WorkspaceState } from "./types";

type Toast = (message: string | null) => void;
type GoalView = "overview" | "plan" | "study" | "sources";

const VIEWS: Array<{ id: GoalView; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "plan", label: "Plan" },
  { id: "study", label: "Study" },
  { id: "sources", label: "Sources" },
];

/** The weakest of the three mastery dimensions, named rather than averaged. */
function weakestDimension(state: Row) {
  const dimensions = [
    { key: "transfer", label: "transfer", value: number(state, "transfer", 0) },
    { key: "retention", label: "recall", value: number(state, "retention", 0) },
    { key: "exposure", label: "exposure", value: number(state, "exposure", 0) },
  ];
  return dimensions.sort((left, right) => left.value - right.value)[0]!;
}

function daysUntil(target: string, now: number) {
  const days = Math.ceil((Date.parse(target) - now) / 86_400_000);
  return Number.isFinite(days) ? days : undefined;
}

export function GoalScreen({
  state,
  goalId,
  serverNow,
  onNavigate,
}: {
  state: WorkspaceState;
  goalId: string;
  serverNow: string;
  showToast: Toast;
  onNavigate: (view: WorkspaceView) => void;
}) {
  const [view, setView] = useState<GoalView>("overview");
  const now = Date.parse(serverNow);

  const goal = state.goals.find((row) => text(row, "id") === goalId) ?? state.goals[0];
  const resolvedId = text(goal, "id");

  const goalTasks = useMemo(
    () => state.tasks.filter((task) => text(task, "goalId") === resolvedId),
    [state.tasks, resolvedId],
  );
  const goalMilestones = useMemo(
    () => state.milestones.filter((milestone) => text(milestone, "goalId") === resolvedId),
    [state.milestones, resolvedId],
  );
  const goalProjects = useMemo(
    () => state.projects.filter((project) => text(project, "goalId") === resolvedId),
    [state.projects, resolvedId],
  );
  const taskIds = useMemo(() => new Set(goalTasks.map((task) => text(task, "id"))), [goalTasks]);
  const goalBlocks = useMemo(
    () => state.schedule.filter((block) => taskIds.has(text(block, "taskId"))),
    [state.schedule, taskIds],
  );
  const projectIds = useMemo(() => new Set(goalProjects.map((project) => text(project, "id"))), [goalProjects]);
  const goalSources = useMemo(
    () => state.sources.filter((source) => projectIds.has(text(source, "projectId"))),
    [state.sources, projectIds],
  );
  const goalPapers = useMemo(
    () => state.papers.filter((paper) => projectIds.has(text(paper, "projectId"))),
    [state.papers, projectIds],
  );
  const goalBanks = useMemo(
    () => state.questionBanks.filter((bank) => !text(bank, "goalId") || text(bank, "goalId") === resolvedId),
    [state.questionBanks, resolvedId],
  );

  // Concepts are not goal-scoped in the schema, so the whole tracked set is
  // shown rather than inventing a link the data does not support.
  const concepts = state.learningStates;

  const openTasks = goalTasks.filter((task) => text(task, "status") !== "done");
  const doneTasks = goalTasks.filter((task) => text(task, "status") === "done");
  const nextMilestone = goalMilestones.find((milestone) => text(milestone, "status") !== "completed");
  const days = daysUntil(text(goal, "targetDate", ""), now);
  const progress = Math.round(number(goal, "progress") * 100);

  if (!goal) {
    return (
      <div className="screen">
        <PageHeader title="Goal not found" description="This goal may have been deleted, or it belongs to another account." />
        <EmptyState title="Nothing to show" body="Pick a goal from the sidebar, or create one." action={<Button className="button-primary compact-button" onClick={() => onNavigate("goals")}>Open plan</Button>} />
      </div>
    );
  }

  return (
    <div className="screen goal-screen">
      <PageHeader
        title={text(goal, "title")}
        description={text(goal, "outcome")}
        context={<Badge tone={statusTone(text(goal, "status", "active"))}>{formatLabel(text(goal, "status", "active"))}</Badge>}
      >
        <div className="goal-progress-strip">
          <div className="goal-progress-track"><i style={{ width: `${Math.max(2, progress)}%` }} /></div>
          <span>
            <strong>{progress}%</strong>
            {days !== undefined ? days > 0 ? ` · ${days} days left` : days === 0 ? " · due today" : ` · ${Math.abs(days)} days overdue` : ""}
          </span>
        </div>
        <nav className="section-tabs" role="tablist" aria-label="Goal sections">
          {VIEWS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={view === entry.id}
              className={view === entry.id ? "active" : ""}
              onClick={() => setView(entry.id)}
            >
              {entry.label}
              {entry.id === "plan" && openTasks.length ? <small>{openTasks.length}</small> : null}
            </button>
          ))}
        </nav>
      </PageHeader>

      {view === "overview" ? (
        <div className="goal-overview">
          <Card className="goal-next-card">
            <div className="card-kicker"><Target size={16} aria-hidden="true" /><span>{nextMilestone ? "Next milestone" : "Next task"}</span></div>
            <h2>{nextMilestone ? text(nextMilestone, "title") : text(openTasks[0], "title", "Nothing left to do")}</h2>
            <p>
              {nextMilestone
                ? `${goalMilestones.filter((m) => text(m, "status") === "completed").length} of ${goalMilestones.length} milestones complete.`
                : text(openTasks[0], "description", "Add a task so Continuum can plan the next step.")}
            </p>
            <Button className="button-primary" onClick={() => setView("plan")}>
              <ListTodo size={15} aria-hidden="true" />Open the plan
            </Button>
          </Card>

          {goalMilestones.length ? (
            <Card className="goal-milestones">
              <div className="card-kicker"><CircleDot size={16} aria-hidden="true" /><span>Milestones</span></div>
              <ol className="goal-milestone-list">
                {goalMilestones.map((milestone) => {
                  const status = text(milestone, "status", "upcoming");
                  return (
                    <li key={text(milestone, "id")} className={`is-${status}`}>
                      <span className="milestone-mark" aria-hidden="true">{status === "completed" ? <Check size={11} /> : null}</span>
                      <div>
                        <strong>{text(milestone, "title")}</strong>
                        <small>{formatLabel(status)}{milestone.dueAt ? ` · ${formatDate(milestone.dueAt, { dateStyle: "medium" })}` : ""}</small>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>
          ) : null}

          <div className="goal-overview-grid">
            <Card>
              <div className="card-kicker"><CalendarClock size={16} aria-hidden="true" /><span>Scheduled</span></div>
              <h3>{goalBlocks.length} block{goalBlocks.length === 1 ? "" : "s"}</h3>
              <p>{doneTasks.length} of {goalTasks.length} tasks done.</p>
              <button className="goal-inline-link" onClick={() => onNavigate("goals")}>Open the week <ArrowRight size={13} /></button>
            </Card>
            <Card>
              <div className="card-kicker"><FlaskConical size={16} aria-hidden="true" /><span>Projects</span></div>
              {goalProjects.length ? (
                <ul className="goal-project-list">
                  {goalProjects.map((project) => (
                    <li key={text(project, "id")}>
                      <strong>{text(project, "title")}</strong>
                      <small>{text(project, "phase", "Active")}</small>
                    </li>
                  ))}
                </ul>
              ) : <p>No research project is linked to this goal.</p>}
              <button className="goal-inline-link" onClick={() => onNavigate("research")}>Open research <ArrowRight size={13} /></button>
            </Card>
            <Card>
              <div className="card-kicker"><FileText size={16} aria-hidden="true" /><span>Material</span></div>
              <h3>{goalSources.length + goalPapers.length} item{goalSources.length + goalPapers.length === 1 ? "" : "s"}</h3>
              <p>{goalSources.length} source{goalSources.length === 1 ? "" : "s"} · {goalPapers.length} paper{goalPapers.length === 1 ? "" : "s"}</p>
              <button className="goal-inline-link" onClick={() => setView("sources")}>See material <ArrowRight size={13} /></button>
            </Card>
          </div>
        </div>
      ) : null}

      {view === "plan" ? (
        <div className="goal-plan">
          {openTasks.length || doneTasks.length ? (
            <>
              <section className="goal-task-group">
                <h2>Open · {openTasks.length}</h2>
                {openTasks.map((task) => {
                  const block = goalBlocks.find((candidate) => text(candidate, "taskId") === text(task, "id"));
                  return (
                    <article className="goal-task-row" key={text(task, "id")}>
                      <span className="goal-task-mark" aria-hidden="true" />
                      <div>
                        <strong>{text(task, "title")}</strong>
                        <small>
                          {number(task, "estimatedMinutes") ? `${number(task, "estimatedMinutes")} min` : "No estimate"}
                          {task.deadline ? ` · due ${formatDate(task.deadline, { dateStyle: "medium" })}` : ""}
                          {block ? ` · scheduled ${formatDate(block.start ?? block.startsAt, { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                        </small>
                      </div>
                      <Badge tone={statusTone(text(task, "status", "backlog"))}>{formatLabel(text(task, "status", "backlog"))}</Badge>
                    </article>
                  );
                })}
              </section>
              {doneTasks.length ? (
                <details className="goal-done-group">
                  <summary>{doneTasks.length} completed</summary>
                  {doneTasks.map((task) => (
                    <article className="goal-task-row is-done" key={text(task, "id")}>
                      <span className="goal-task-mark" aria-hidden="true"><Check size={10} /></span>
                      <div><strong>{text(task, "title")}</strong></div>
                    </article>
                  ))}
                </details>
              ) : null}
            </>
          ) : (
            <EmptyState
              title="No tasks yet"
              body="Add a task and Continuum can schedule it into your week."
              action={<Button className="button-primary compact-button" onClick={() => onNavigate("goals")}>Add a task</Button>}
            />
          )}
        </div>
      ) : null}

      {view === "study" ? (
        <div className="goal-study">
          <section className="goal-study-section">
            <h2>What you are learning</h2>
            {concepts.length ? concepts.map((concept) => {
              const weakest = weakestDimension(concept);
              const status = text(concept, "status", "not_started");
              return (
                <article className="goal-concept-row" key={text(concept, "id") || text(concept, "conceptId")}>
                  <div>
                    <strong>{text(concept, "conceptLabel") || conceptLabel(text(concept, "conceptId"))}</strong>
                    <small>Weakest: {weakest.label} {Math.round(weakest.value * 100)}%</small>
                  </div>
                  <Badge tone={statusTone(status)}>{masteryLabel(status)}</Badge>
                  <Button className="button-secondary compact-button" onClick={() => onNavigate("learn")}>
                    <BookOpen size={14} aria-hidden="true" />Study
                  </Button>
                </article>
              );
            }) : (
              <EmptyState
                title="Nothing tracked yet"
                body="Study a concept and Continuum records what the evidence shows."
                action={<Button className="button-primary compact-button" onClick={() => onNavigate("learn")}>Open Learn</Button>}
              />
            )}
          </section>

          <section className="goal-study-section">
            <h2>Practice sets</h2>
            {goalBanks.length ? goalBanks.map((bank) => (
              <article className="goal-concept-row" key={text(bank, "id")}>
                <div>
                  <strong>{text(bank, "title")}</strong>
                  <small>{list(bank, "questions").length || number(bank, "questionCount")} questions · {formatLabel(text(bank, "status", "ready"))}</small>
                </div>
                <Button className="button-secondary compact-button" onClick={() => onNavigate("learn")}>Practise</Button>
              </article>
            )) : <p className="goal-quiet-line">No practice set yet. You can build one from a source or a photo in Learn.</p>}
          </section>
        </div>
      ) : null}

      {view === "sources" ? (
        <div className="goal-sources">
          {goalSources.length || goalPapers.length ? (
            <>
              {goalPapers.map((paper) => (
                <article className="goal-source-row" key={text(paper, "id")}>
                  <span><BookOpen size={17} aria-hidden="true" /></span>
                  <div>
                    <strong>{text(paper, "title")}</strong>
                    <small>{list(paper, "authors").join(", ") || "Authors unavailable"}{paper.year ? ` · ${String(paper.year)}` : ""}</small>
                  </div>
                  <Badge tone={paper.sourceId ? "green" : "neutral"}>{paper.sourceId ? "Full source" : "Metadata"}</Badge>
                </article>
              ))}
              {goalSources.map((source) => (
                <article className="goal-source-row" key={text(source, "id")}>
                  <span><FileText size={17} aria-hidden="true" /></span>
                  <div>
                    <strong>{text(source, "title")}</strong>
                    <small>{text(source, "mimeType", "document")}</small>
                  </div>
                  <Badge tone="neutral">Indexed</Badge>
                </article>
              ))}
            </>
          ) : (
            <EmptyState
              title="No material yet"
              body="Papers and files you save to this goal's projects appear here."
              action={<Button className="button-primary compact-button" onClick={() => onNavigate("library")}>Find sources</Button>}
            />
          )}
        </div>
      ) : null}

      <footer className="goal-footer-meta">
        <span><Clock3 size={13} aria-hidden="true" />Target {formatDate(text(goal, "targetDate", ""), { dateStyle: "medium" })}</span>
      </footer>
    </div>
  );
}
