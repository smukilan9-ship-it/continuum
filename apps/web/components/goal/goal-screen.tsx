"use client";

import {
  ArrowRight,
  Archive,
  BookOpen,
  CalendarClock,
  Check,
  CircleDot,
  FileText,
  FlaskConical,
  HelpCircle,
  ListTodo,
  MoreHorizontal,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Banner, Button, Card, ConfirmationDialog, EmptyState, LoadingState, Menu } from "@/components/ui";
import { useAssistant } from "@/components/assistant/use-assistant";
import { AskQuestionDialog } from "@/components/workspace/ask-question-dialog";
import { ConceptMap } from "@/components/workspace/concept-map";
import { formatDate, list, normalizeWorkspaceState, number, text, type Row } from "@/components/workspace/types";
import { conceptLabel, formatLabel, masteryLabel, statusTone } from "@/lib/labels";
import type { WorkspaceView } from "@/lib/workspace-routes";
import { GoalHeader } from "./goal-header";
import "./goal.css";

type Toast = (message: string | null) => void;
export type GoalView = "overview" | "plan" | "study" | "sources";

const VIEWS: Array<{ id: GoalView; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "plan", label: "Plan" },
  { id: "study", label: "Study" },
  { id: "sources", label: "Sources" },
];

function isGoalView(value: unknown): value is GoalView {
  return VIEWS.some((entry) => entry.id === value);
}

/** The weakest of the three mastery dimensions, named rather than averaged (X8). */
function weakestDimension(state: Row) {
  const dimensions = [
    { label: "transfer", value: number(state, "transfer", 0) },
    { label: "recall", value: number(state, "retention", 0) },
    { label: "exposure", value: number(state, "exposure", 0) },
  ];
  return dimensions.sort((left, right) => left.value - right.value)[0]!;
}

type ViewPayload = Record<string, unknown> & { goal?: Row };

/**
 * `/g/[goalId]` — the place a user works (§9.6).
 *
 * Each view fetches only its own data from `GET /api/goals/[id]?view=`, so
 * switching tabs cannot refetch the header (AC-G3) and no other goal's objects
 * can reach the screen (AC-G1). The header comes from shell data and renders
 * immediately; only the panel below it skeletons.
 */
export function GoalScreen({
  goalId,
  shellGoal,
  serverNow,
  showToast,
  onNavigate,
  onRefresh,
}: {
  goalId: string;
  /** From `getShellData`, so the header never waits on the view fetch. */
  shellGoal: { id: string; title: string; progress: number; targetDate: string; status: string } | undefined;
  serverNow: string;
  showToast: Toast;
  onNavigate: (view: WorkspaceView) => void;
  onRefresh: () => Promise<void>;
}) {
  const router = useRouter();
  const assistant = useAssistant();
  const [view, setView] = useState<GoalView>("overview");
  const [payload, setPayload] = useState<ViewPayload>();
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "missing">("loading");
  const [askTarget, setAskTarget] = useState<{ selection: string; conceptId: string }>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cache = useRef(new Map<GoalView, ViewPayload>());
  const tabsRef = useRef<HTMLElement>(null);
  const now = Date.parse(serverNow);

  /**
   * AC-G3/AC-G4: the view is a URL parameter, so it is linkable, and Back
   * returns to the previous *view* rather than leaving the page. `replaceState`
   * on first load avoids pushing an entry for the default.
   */
  useEffect(() => {
    const apply = () => {
      const requested = new URLSearchParams(window.location.search).get("view");
      setView(isGoalView(requested) ? requested : "overview");
    };
    apply();
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, []);

  const load = useCallback(async (target: GoalView) => {
    const cached = cache.current.get(target);
    if (cached) { setPayload(cached); setStatus("ready"); return; }
    setStatus("loading");
    try {
      const response = await fetch(`/api/goals/${encodeURIComponent(goalId)}?view=${target}`, { cache: "no-store" });
      if (response.status === 404) { setStatus("missing"); return; }
      const body = await response.json() as { data?: ViewPayload; error?: string };
      if (!response.ok || !body.data) throw new Error(body.error ?? "This goal could not be opened");
      cache.current.set(target, body.data);
      setPayload(body.data);
      setStatus("ready");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "This goal could not be opened");
      setStatus("error");
    }
  }, [goalId, showToast]);

  useEffect(() => { void load(view); }, [load, view]);

  function selectView(next: GoalView) {
    setView(next);
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.pushState({ view: next }, "", url);
  }

  /** §9.6: a real tab set — arrow keys, Home and End. */
  function onTabKeyDown(event: React.KeyboardEvent) {
    const index = VIEWS.findIndex((entry) => entry.id === view);
    const move = (next: number) => {
      event.preventDefault();
      const target = VIEWS[(next + VIEWS.length) % VIEWS.length]!;
      selectView(target.id);
      tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role='tab']")[(next + VIEWS.length) % VIEWS.length]?.focus();
    };
    if (event.key === "ArrowRight") move(index + 1);
    else if (event.key === "ArrowLeft") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(VIEWS.length - 1);
  }

  const goal = (payload?.goal ?? shellGoal) as Row | undefined;
  const archived = text(goal, "status") === "archived";

  async function patchGoal(changes: Record<string, unknown>, successMessage: string) {
    try {
      const response = await fetch(`/api/goals/${encodeURIComponent(goalId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(changes),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "This goal could not be updated");
      cache.current.clear();
      if (changes.deleted) { router.push("/plan"); return; }
      await load(view);
      showToast(successMessage);
      await onRefresh();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "This goal could not be updated");
    }
  }

  async function openConceptSession(conceptId: string) {
    try {
      const response = await fetch("/api/learning/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goalId, conceptId }),
      });
      const body = await response.json() as { session?: { id: string }; error?: string };
      if (!response.ok || !body.session) throw new Error(body.error ?? "This study session could not be opened");
      router.push(`/study/${body.session.id}` as Route);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "This study session could not be opened");
    }
  }

  if (status === "missing" || (!goal && status !== "loading")) {
    return (
      <div className="screen goal-screen">
        <EmptyState
          title="This goal isn’t here"
          body="It may have been deleted, or it belongs to another account."
          action={<Button className="button-primary compact-button" onClick={() => onNavigate("goals")}>Back to your plan</Button>}
        />
      </div>
    );
  }

  return (
    <div className="screen goal-screen">
      <GoalHeader
        goal={goal}
        now={now}
        onRename={(title) => void patchGoal({ title }, "Goal renamed.")}
        actions={
          <Menu
            label="Goal actions"
            trigger={<button className="icon-button" aria-label="More goal actions"><MoreHorizontal size={16} /></button>}
            items={[
              { label: "Ask about this goal", icon: <Sparkles size={14} />, onSelect: () => assistant.askFromPage({ page: { kind: "goal", id: goalId, label: `Goal: ${text(goal, "title")}` } }) },
              archived
                ? { label: "Restore", icon: <Archive size={14} />, onSelect: () => void patchGoal({ status: "active" }, "Goal restored.") }
                : { label: "Archive", icon: <Archive size={14} />, onSelect: () => void patchGoal({ status: "archived" }, "Goal archived.") },
              { label: "Delete", icon: <Trash2 size={14} />, destructive: true, onSelect: () => setConfirmDelete(true) },
            ]}
          />
        }
      >
        <nav ref={tabsRef} className="section-tabs" role="tablist" aria-label="Goal sections" onKeyDown={onTabKeyDown}>
          {VIEWS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              id={`goal-tab-${entry.id}`}
              aria-selected={view === entry.id}
              aria-controls={`goal-panel-${entry.id}`}
              tabIndex={view === entry.id ? 0 : -1}
              className={view === entry.id ? "active" : ""}
              onClick={() => selectView(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </nav>
      </GoalHeader>

      {archived ? (
        <Banner tone="warning" title="This goal is archived">
          Its plan and material are read-only until you restore it.
        </Banner>
      ) : null}

      <div id={`goal-panel-${view}`} role="tabpanel" aria-labelledby={`goal-tab-${view}`}>
        {status === "loading" && !payload ? <LoadingState label={`Loading ${view}`} /> : null}
        {status === "ready" || payload ? (
          <>
            {view === "overview" ? <Overview payload={payload!} goalId={goalId} onSelectView={selectView} onNavigate={onNavigate} onOpenConcept={openConceptSession} onAsk={setAskTarget} /> : null}
            {view === "plan" ? <Plan payload={payload!} onNavigate={onNavigate} /> : null}
            {view === "study" ? <Study payload={payload!} onOpenConcept={openConceptSession} onNavigate={onNavigate} /> : null}
            {view === "sources" ? <Sources payload={payload!} goalId={goalId} onNavigate={onNavigate} /> : null}
          </>
        ) : null}
      </div>

      <ConfirmationDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${text(goal, "title")}”?`}
        description="The goal and its tasks are removed from your plan and from what Continuum retrieves. Sources and research projects are not deleted."
        confirmLabel="Delete goal"
        destructive
        onConfirm={() => { setConfirmDelete(false); void patchGoal({ deleted: true }, "Goal deleted."); }}
      />

      <AskQuestionDialog
        open={Boolean(askTarget)}
        onOpenChange={(open) => { if (!open) setAskTarget(undefined); }}
        selection={askTarget?.selection ?? ""}
        conceptId={askTarget?.conceptId ?? ""}
        onRefresh={onRefresh}
      />
    </div>
  );
}

function rows(payload: ViewPayload, key: string): Row[] {
  const value = payload[key];
  return Array.isArray(value) ? value as Row[] : [];
}

function Overview({ payload, goalId, onSelectView, onNavigate, onOpenConcept, onAsk }: {
  payload: ViewPayload;
  goalId: string;
  onSelectView: (view: GoalView) => void;
  onNavigate: (view: WorkspaceView) => void;
  onOpenConcept: (conceptId: string) => void;
  onAsk: (target: { selection: string; conceptId: string }) => void;
}) {
  const milestones = rows(payload, "milestones");
  const tasks = rows(payload, "tasks");
  const projects = rows(payload, "projects");
  const events = rows(payload, "events");
  const concepts = rows(payload, "concepts");
  const openQuestions = Array.isArray(payload.openQuestions) ? payload.openQuestions as string[] : [];
  const openTasks = tasks.filter((task) => text(task, "status") !== "done");
  const nextMilestone = milestones.find((milestone) => text(milestone, "status") !== "completed");

  // AC-G5: an empty goal is still a coherent page with three offered actions.
  if (!tasks.length && !projects.length && !concepts.length) {
    return (
      <div className="goal-empty">
        <h2>Nothing here yet</h2>
        <p>Pick one to get this goal moving.</p>
        <div>
          <Button className="button-primary" onClick={() => onNavigate("goals")}><ListTodo size={15} aria-hidden="true" />Add your first task</Button>
          <Button className="button-secondary" onClick={() => onNavigate("library")}><FileText size={15} aria-hidden="true" />Add material</Button>
          <Button className="button-secondary" onClick={() => onNavigate("research")}><FlaskConical size={15} aria-hidden="true" />Start a project</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="goal-overview">
      <Card className="goal-next-card goal-next-compact">
        <div className="card-kicker"><Target size={16} aria-hidden="true" /><span>{nextMilestone ? "Next milestone" : "Next task"}</span></div>
        <h2>{nextMilestone ? text(nextMilestone, "title") : text(openTasks[0], "title", "Nothing left to do")}</h2>
        <p>
          {nextMilestone
            ? `${milestones.filter((milestone) => text(milestone, "status") === "completed").length} of ${milestones.length} milestones complete.`
            : text(openTasks[0], "description", "Add a task so Continuum can plan the next step.")}
        </p>
        <Button className="button-primary" onClick={() => onSelectView("plan")}><ListTodo size={15} aria-hidden="true" />Open the plan</Button>
      </Card>

      {projects.length ? (
        <div className="goal-project-cards">
          {projects.map((project) => (
            <Card key={text(project, "id")}>
              <div className="card-kicker"><FlaskConical size={16} aria-hidden="true" /><span>Project</span></div>
              <h3>{text(project, "title")}</h3>
              <p>{text(project, "purpose", text(project, "phase", "Active"))}</p>
              {/* AC-P1: every project is reachable from its goal in one click. */}
              <Link className="goal-inline-link" href={`/g/${encodeURIComponent(goalId)}/p/${encodeURIComponent(text(project, "id"))}` as Route}>
                Open project <ArrowRight size={13} />
              </Link>
            </Card>
          ))}
        </div>
      ) : null}

      {/* §9.6 promotes the concept map to the primary artefact (fixes S8). */}
      {/* `normalizeWorkspaceState` fills every key the map reads. Hand-building
          a partial state here meant discovering each missing array as a
          runtime `undefined.filter`. */}
      <ConceptMap
        state={normalizeWorkspaceState({ ...payload, learningStates: concepts, goals: [payload.goal ?? {}] })}
        pinnedGoalId={goalId}
        onOpenLesson={(node) => onOpenConcept(node.id)}
        onAskQuestion={(node) => onAsk({ selection: node.description || node.name, conceptId: node.id })}
      />

      <div className="goal-overview-grid">
        {milestones.length ? (
          <Card>
            <div className="card-kicker"><CircleDot size={16} aria-hidden="true" /><span>Milestones</span></div>
            <ol className="goal-milestone-list">
              {milestones.map((milestone) => {
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
        <Card>
          <div className="card-kicker"><CalendarClock size={16} aria-hidden="true" /><span>Recent activity</span></div>
          {events.length ? (
            <ul className="goal-event-list">
              {events.map((event) => (
                <li key={text(event, "id")}>
                  <strong>{text(event, "summary")}</strong>
                  <small>{formatDate(event.occurredAt, { dateStyle: "medium" })}</small>
                </li>
              ))}
            </ul>
          ) : <p>Nothing has happened on this goal yet.</p>}
        </Card>
        <Card>
          <div className="card-kicker"><HelpCircle size={16} aria-hidden="true" /><span>Open questions</span></div>
          {openQuestions.length ? (
            <ul className="goal-question-list">{openQuestions.map((question) => <li key={question}>{question}</li>)}</ul>
          ) : <p>No unresolved questions were recorded for this goal.</p>}
        </Card>
      </div>
    </div>
  );
}

function Plan({ payload, onNavigate }: { payload: ViewPayload; onNavigate: (view: WorkspaceView) => void }) {
  const tasks = rows(payload, "tasks");
  const schedule = rows(payload, "schedule");
  const groups: Array<{ label: string; match: (task: Row) => boolean }> = [
    { label: "In progress", match: (task) => text(task, "status") === "in_progress" },
    { label: "Next", match: (task) => text(task, "status") === "ready" || text(task, "status") === "scheduled" },
    { label: "Backlog", match: (task) => text(task, "status") === "backlog" },
  ];
  const done = tasks.filter((task) => text(task, "status") === "done");
  const grouped = groups.map((group) => ({ ...group, tasks: tasks.filter(group.match) })).filter((group) => group.tasks.length);
  // Anything whose status is none of the above still has to appear somewhere.
  const uncategorised = tasks.filter((task) => text(task, "status") !== "done" && !groups.some((group) => group.match(task)));

  if (!tasks.length) {
    return (
      <EmptyState
        title="No tasks yet"
        body="Add a task and Continuum can schedule it into your week."
        action={<Button className="button-primary compact-button" onClick={() => onNavigate("goals")}>Add a task</Button>}
      />
    );
  }

  const taskRow = (task: Row) => {
    const block = schedule.find((candidate) => text(candidate, "taskId") === text(task, "id"));
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
  };

  return (
    <div className="goal-plan">
      {grouped.map((group) => (
        <section className="goal-task-group" key={group.label}>
          <h2>{group.label} · {group.tasks.length}</h2>
          {group.tasks.map(taskRow)}
        </section>
      ))}
      {uncategorised.length ? (
        <section className="goal-task-group">
          <h2>Open · {uncategorised.length}</h2>
          {uncategorised.map(taskRow)}
        </section>
      ) : null}
      {done.length ? (
        <details className="goal-done-group">
          <summary>{done.length} completed</summary>
          {done.map((task) => (
            <article className="goal-task-row is-done" key={text(task, "id")}>
              <span className="goal-task-mark" aria-hidden="true"><Check size={10} /></span>
              <div><strong>{text(task, "title")}</strong></div>
            </article>
          ))}
        </details>
      ) : null}
    </div>
  );
}

function Study({ payload, onOpenConcept, onNavigate }: { payload: ViewPayload; onOpenConcept: (conceptId: string) => void; onNavigate: (view: WorkspaceView) => void }) {
  const concepts = rows(payload, "learningStates");
  const banks = rows(payload, "questionBanks");

  return (
    <div className="goal-study">
      <section className="goal-study-section">
        <h2>What you are learning</h2>
        {concepts.length ? concepts.map((concept) => {
          const weakest = weakestDimension(concept);
          const status = text(concept, "status", "not_started");
          const conceptId = text(concept, "conceptId") || text(concept, "id");
          return (
            <article className="goal-concept-row" key={conceptId}>
              <div>
                <strong>{text(concept, "conceptLabel") || conceptLabel(conceptId)}</strong>
                <small>Weakest: {weakest.label} {Math.round(weakest.value * 100)}%</small>
              </div>
              <Badge tone={statusTone(status)}>{masteryLabel(status)}</Badge>
              <Button className="button-secondary compact-button" onClick={() => onOpenConcept(conceptId)}>
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
        {banks.length ? banks.map((bank) => (
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
  );
}

function Sources({ payload, goalId, onNavigate }: { payload: ViewPayload; goalId: string; onNavigate: (view: WorkspaceView) => void }) {
  const router = useRouter();
  const sources = rows(payload, "sources");
  const papers = rows(payload, "papers");

  if (!sources.length && !papers.length) {
    return (
      <EmptyState
        title="No material yet"
        body="Papers and files you save to this goal's projects appear here."
        action={<Button className="button-primary compact-button" onClick={() => router.push(`/library?tab=discover&target=${encodeURIComponent(goalId)}` as Route)}>Find papers</Button>}
      />
    );
  }

  return (
    <div className="goal-sources">
      <div className="goal-sources-actions">
        <Button className="button-secondary compact-button" onClick={() => onNavigate("library")}><FileText size={14} aria-hidden="true" />Add source</Button>
        <Button className="button-secondary compact-button" onClick={() => router.push(`/library?tab=discover&target=${encodeURIComponent(goalId)}` as Route)}><BookOpen size={14} aria-hidden="true" />Find papers</Button>
      </div>
      {papers.map((paper) => (
        <article className="goal-source-row" key={text(paper, "id")}>
          <span><BookOpen size={17} aria-hidden="true" /></span>
          <div>
            <strong>{text(paper, "title")}</strong>
            <small>{list(paper, "authors").join(", ") || "Authors unavailable"}{paper.year ? ` · ${String(paper.year)}` : ""}</small>
          </div>
          <Badge tone={paper.sourceId ? "green" : "neutral"}>{paper.sourceId ? "Full source" : "Metadata"}</Badge>
        </article>
      ))}
      {sources.map((source) => (
        <article className="goal-source-row" key={text(source, "id")}>
          <span><FileText size={17} aria-hidden="true" /></span>
          <div>
            <strong>{text(source, "title")}</strong>
            <small>{text(source, "mimeType", "document")}</small>
          </div>
          <Badge tone={text(source, "processingState", "ready") === "ready" ? "neutral" : "orange"}>
            {formatLabel(text(source, "processingState", "ready"))}
          </Badge>
        </article>
      ))}
    </div>
  );
}
