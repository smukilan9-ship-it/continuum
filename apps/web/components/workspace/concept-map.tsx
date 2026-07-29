"use client";

import { BookOpen, BrainCircuit, CheckCircle2, ChevronRight, GitBranch, HelpCircle, List, Minus, Move, Plus, RotateCcw, Route, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { formatDate, list, number, text, type Row, type WorkspaceState } from "./types";

type ConceptNode = {
  id: string;
  name: string;
  description: string;
  prerequisites: string[];
  dependents: string[];
  mastery: number;
  confidence: number;
  lastReviewed?: unknown;
  attempts: number;
  lessonComplete: boolean;
  resources: string[];
  misconception?: string;
  state: "Not started" | "Introduced" | "Developing" | "Proficient" | "Mastered" | "Needs review";
  nextAction: string;
  branch: ConceptBranch;
};
type ConceptBranch = "Foundations" | "Practice" | "Apply & create" | "Review & proof";

const branchOrder: ConceptBranch[] = ["Foundations", "Practice", "Apply & create", "Review & proof"];

function suggestedBranch(task: Row, index: number, total: number): ConceptBranch {
  const content = `${text(task, "title")} ${text(task, "description")} ${text(task, "completionEvidence")}`.toLowerCase();
  if (/review|test|mock|audit|verify|evidence|error log|check|benchmark|score/.test(content)) return "Review & proof";
  if (/build|write|draft|ship|publish|create|figure|project|cli|implement/.test(content)) return "Apply & create";
  if (/practice|drill|solve|compare|run|rework|exercise|timed/.test(content)) return "Practice";
  const phase = total <= 1 ? 0 : Math.min(2, Math.floor((index / total) * 3));
  return branchOrder[phase]!;
}

function taskState(task: Row, learning: Row | undefined): ConceptNode["state"] {
  const status = text(learning, "status");
  if (status === "mastered") return "Mastered";
  if (["decaying", "misconception_detected"].includes(status)) return "Needs review";
  if (text(task, "status") === "done") return "Proficient";
  if (text(task, "status") === "in_progress") return "Developing";
  if (text(task, "status") === "planned") return "Introduced";
  return "Not started";
}

function scoreFor(task: Row, learning: Row | undefined) {
  if (learning) return (number(learning, "understanding") + number(learning, "transfer") + number(learning, "retention")) / 3;
  return text(task, "status") === "done" ? .72 : text(task, "status") === "in_progress" ? .42 : text(task, "status") === "planned" ? .18 : 0;
}

function nodesForPath(state: WorkspaceState, goalId: string): ConceptNode[] {
  const tasks = state.tasks.filter((task) => text(task, "goalId") === goalId).slice(0, 12);
  const taskIds = new Set(tasks.map((task) => text(task, "id")));
  const dependencies = state.taskDependencies.filter((dependency) => taskIds.has(text(dependency, "taskId")) && taskIds.has(text(dependency, "dependsOnTaskId")));
  const prerequisites = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  for (const dependency of dependencies) {
    const taskId = text(dependency, "taskId");
    const dependsOnTaskId = text(dependency, "dependsOnTaskId");
    prerequisites.set(taskId, [...(prerequisites.get(taskId) ?? []), dependsOnTaskId]);
    dependents.set(dependsOnTaskId, [...(dependents.get(dependsOnTaskId) ?? []), taskId]);
  }
  const branches = tasks.map((task, index) => suggestedBranch(task, index, tasks.length));
  if (tasks.length > 1 && new Set(branches).size === 1) {
    tasks.forEach((_, index) => { branches[index] = branchOrder[Math.min(2, Math.floor((index / tasks.length) * 3))]!; });
  }
  return tasks.map((task, index) => {
    const learning = state.learningStates[index] ?? (index === 0 ? state.learningStates[0] : undefined);
    const resourceIds = state.resourceActivities.filter((activity) => text(activity, "goalId") === goalId || (learning && text(activity, "conceptId") === text(learning, "conceptId"))).map((activity) => text(activity, "resourceId")).filter(Boolean);
    const stateLabel = taskState(task, learning);
    return {
      id: text(task, "id", `concept_${index}`),
      name: text(task, "title", `Concept ${index + 1}`),
      description: text(task, "description", text(task, "completionEvidence", "Build understanding and produce evidence before moving on.")),
      prerequisites: prerequisites.get(text(task, "id")) ?? [],
      dependents: dependents.get(text(task, "id")) ?? [],
      mastery: scoreFor(task, learning),
      confidence: learning ? number(learning, "confidence") : stateLabel === "Proficient" ? .7 : .3,
      lastReviewed: learning?.lastPracticedAt,
      attempts: learning ? list(learning, "evidenceIds").length : 0,
      lessonComplete: learning ? number(learning, "exposure") >= .8 : text(task, "status") === "done",
      resources: [...new Set(resourceIds)],
      misconception: text(learning, "status") === "misconception_detected" ? text(learning, "explanation") : undefined,
      state: stateLabel,
      nextAction: stateLabel === "Needs review" ? "Answer a targeted question" : stateLabel === "Not started" ? "Open the lesson" : stateLabel === "Mastered" ? "Review again later" : "Complete the next checkpoint",
      branch: branches[index]!,
    };
  });
}

export function ConceptMap({ state, onOpenLesson, onAskQuestion }: { state: WorkspaceState; onOpenLesson: (node: ConceptNode) => void; onAskQuestion: (node: ConceptNode) => void }) {
  const [goalId, setGoalId] = useState(() => text(state.goals[0], "id"));
  const [view, setView] = useState<"map" | "outline">("map");
  const [selectedId, setSelectedId] = useState("");
  const [scale, setScale] = useState(.68);
  const [offset, setOffset] = useState({ x: 24, y: 48 });
  const drag = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const viewport = useRef<HTMLDivElement | null>(null);
  const track = useRef<HTMLDivElement | null>(null);
  const nodes = useMemo(() => nodesForPath(state, goalId), [goalId, state]);
  const branches = useMemo(() => branchOrder.map((name) => ({ name, nodes: nodes.filter((node) => node.branch === name) })).filter((branch) => branch.nodes.length), [nodes]);
  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0];
  const goal = state.goals.find((item) => text(item, "id") === goalId);

  /**
   * Fit the graph to the canvas instead of parking it at a fixed 0.68 scale in
   * the top-left corner, which left most of the canvas as empty dotted grid.
   */
  const fitView = useCallback(() => {
    const box = viewport.current?.getBoundingClientRect();
    const content = track.current;
    if (!box || !content || !box.width || !box.height) return;
    // Measure at scale 1 so the fit is independent of the current zoom.
    const width = content.scrollWidth;
    const height = content.scrollHeight;
    if (!width || !height) return;
    const padding = 32;
    const next = Math.max(.45, Math.min(1.1, Math.min((box.width - padding * 2) / width, (box.height - padding * 2) / height)));
    setScale(next);
    setOffset({ x: Math.max(padding, (box.width - width * next) / 2), y: Math.max(padding, (box.height - height * next) / 2) });
  }, []);

  // Re-fit when the graph changes or the canvas resizes.
  useEffect(() => {
    if (view !== "map" || !nodes.length) return;
    const frame = requestAnimationFrame(fitView);
    // Observe the track as well: measuring only the viewport re-fitted before
    // the graph had finished laying out, which clipped the lowest branch.
    const observer = new ResizeObserver(() => fitView());
    if (viewport.current) observer.observe(viewport.current);
    if (track.current) observer.observe(track.current);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [fitView, goalId, nodes.length, view]);

  function resetView() {
    fitView();
  }

  return <section className="concept-map-section">
    <div className="section-heading"><div><p className="eyebrow">CONCEPT MAP</p><h2>See the branches—not a manufactured chain</h2><p className="section-description">Tasks are grouped by learning job. Only saved dependencies are shown as prerequisites; independent work remains on its own branch.</p></div><div className="concept-map-heading-actions"><label>Learning path<select value={goalId} onChange={(event) => { setGoalId(event.target.value); setSelectedId(""); resetView(); }}>{state.goals.map((item) => <option key={text(item, "id")} value={text(item, "id")}>{text(item, "title")}</option>)}</select></label><div><button className={view === "map" ? "active" : ""} onClick={() => setView("map")}><GitBranch size={14} />Mind map</button><button className={view === "outline" ? "active" : ""} onClick={() => setView("outline")}><List size={14} />Grouped outline</button></div></div></div>

    {!nodes.length ? <Card className="concept-map-empty"><Route size={24} /><h3>This path needs learning steps</h3><p>Add tasks in Plan. Continuum will turn the saved sequence into a navigable learning outline.</p></Card> : <div className="concept-map-shell">
      {view === "map" ? <div className="concept-map-canvas">
        <div className="concept-map-tools" aria-label="Concept map controls"><button onClick={() => setScale((value) => Math.min(1.5, value + .1))} aria-label="Zoom in"><Plus size={15} /></button><button onClick={() => setScale((value) => Math.max(.55, value - .1))} aria-label="Zoom out"><Minus size={15} /></button><button onClick={resetView} aria-label="Reset map"><RotateCcw size={14} /></button><span><Move size={13} />Drag to pan</span></div>
        <div
          ref={viewport}
          className="concept-map-viewport"
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest("button")) return;
            drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: offset.x, originY: offset.y };
            viewport.current?.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current || drag.current.pointerId !== event.pointerId) return;
            setOffset({ x: drag.current.originX + event.clientX - drag.current.x, y: drag.current.originY + event.clientY - drag.current.y });
          }}
          onPointerUp={(event) => {
            if (drag.current?.pointerId === event.pointerId) viewport.current?.releasePointerCapture(event.pointerId);
            drag.current = null;
          }}
        >
          <div ref={track} className="concept-map-track" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}>
            <div className="concept-path-root"><Route size={17} /><span><small>Path</small><strong>{text(goal, "title", "Learning path")}</strong></span></div>
            <div className="concept-branches">{branches.map((branch) => <section className="concept-branch" key={branch.name}>
              <div className="concept-branch-hub"><GitBranch size={14} /><span><small>Branch</small><strong>{branch.name}</strong><em>{branch.nodes.length} step{branch.nodes.length === 1 ? "" : "s"}</em></span></div>
              <div className="concept-branch-nodes">{branch.nodes.map((node) => <button key={node.id} className={`concept-node state-${node.state.toLowerCase().replaceAll(" ", "-")} ${selected?.id === node.id ? "selected" : ""}`} onClick={() => setSelectedId(node.id)}>
                <span className="concept-node-sequence">{nodes.findIndex((candidate) => candidate.id === node.id) + 1}</span><small>{node.state}</small><strong>{node.name}</strong>{node.prerequisites.length ? <span className="concept-node-dependency">{node.prerequisites.length} prerequisite{node.prerequisites.length === 1 ? "" : "s"}</span> : <span className="concept-node-dependency">Independent start</span>}<div><i style={{ width: `${Math.round(node.mastery * 100)}%` }} /></div><em>{Math.round(node.mastery * 100)}% mastery</em>
              </button>)}</div>
            </section>)}</div>
          </div>
        </div>
      </div> : <div className="concept-outline">{branches.map((branch) => <section key={branch.name}><header><GitBranch size={14} /><div><strong>{branch.name}</strong><small>{branch.nodes.length} step{branch.nodes.length === 1 ? "" : "s"}</small></div></header>{branch.nodes.map((node) => <button key={node.id} className={selected?.id === node.id ? "selected" : ""} onClick={() => setSelectedId(node.id)}><span>{nodes.findIndex((candidate) => candidate.id === node.id) + 1}</span><div><Badge tone={node.state === "Needs review" ? "orange" : node.state === "Mastered" ? "green" : "neutral"}>{node.state}</Badge><strong>{node.name}</strong><p>{node.description}</p></div><div><b>{Math.round(node.mastery * 100)}%</b><ChevronRight size={15} /></div></button>)}</section>)}</div>}

      {selected ? <aside className="concept-detail">
        <header><Badge tone={selected.state === "Needs review" ? "orange" : selected.state === "Mastered" ? "green" : "blue"}>{selected.state}</Badge><h3>{selected.name}</h3><p>{selected.description}</p></header>
        {selected.misconception ? <div className="concept-warning"><TriangleAlert size={16} /><span><strong>Weak area</strong>{selected.misconception}</span></div> : null}
        <dl>
          <div><dt>Mastery</dt><dd>{Math.round(selected.mastery * 100)}%</dd></div>
          <div><dt>Confidence</dt><dd>{Math.round(selected.confidence * 100)}%</dd></div>
          <div><dt>Attempts</dt><dd>{selected.attempts}</dd></div>
          <div><dt>Lesson</dt><dd>{selected.lessonComplete ? "Completed" : "Not completed"}</dd></div>
          <div><dt>Last reviewed</dt><dd>{selected.lastReviewed ? formatDate(selected.lastReviewed, { dateStyle: "medium" }) : "Not reviewed"}</dd></div>
          <div><dt>Resources</dt><dd>{selected.resources.length || "None yet"}</dd></div>
        </dl>
        <section><strong>Prerequisites</strong><p>{selected.prerequisites.length ? selected.prerequisites.map((id) => nodes.find((node) => node.id === id)?.name ?? id).join(", ") : "Start here"}</p></section>
        <section><strong>Unlocks</strong><p>{selected.dependents.length ? selected.dependents.map((id) => nodes.find((node) => node.id === id)?.name ?? id).join(", ") : "Path milestone"}</p></section>
        <section><strong>Recommended next action</strong><p>{selected.nextAction}</p></section>
        <div><Button className="button-primary" onClick={() => onOpenLesson(selected)}><BookOpen size={14} />Open lesson</Button><Button className="button-secondary" onClick={() => onAskQuestion(selected)}><HelpCircle size={14} />Ask as question</Button></div>
        {selected.lessonComplete ? <small><CheckCircle2 size={13} />Lesson exposure saved. Mastery still depends on checks and retention.</small> : <small><BrainCircuit size={13} />Start with the lesson, then answer without looking back.</small>}
      </aside> : null}
    </div>}
  </section>;
}

export type { ConceptNode };
