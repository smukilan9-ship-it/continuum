"use client";

import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Button, Field, Input } from "@/components/ui";
import type { WorkspaceView } from "@/lib/workspace-routes";

import "./start.css";

type ScheduleStatus = { status: "committed" | "empty" | "deferred" | "not_generated"; blocks?: number };
type PlanResult = {
  goal?: { id?: string; title?: string };
  milestones?: unknown[];
  tasks?: Array<{ id: string; title: string }>;
  schedule?: ScheduleStatus;
  nextAction?: string;
};

const SKIP_KEY = "continuum.onboarding.skipped.v1";

/**
 * The steps the server actually performs, so the progress panel names real work
 * rather than showing an indeterminate spinner for 20 seconds. Carried over
 * verbatim from the previous flow — these were already honest.
 */
const BUILD_STAGES = [
  { label: "Creating your goal", after: 0 },
  { label: "Breaking it into milestones", after: 2_500 },
  { label: "Generating tasks", after: 7_000 },
  { label: "Scheduling your first week", after: 13_000 },
] as const;

const EXAMPLES = [
  "Raise my SAT score to 1550",
  "Pass Class 12 CS boards",
  "Finish my research paper",
];

const COMMITMENTS = [
  { hours: 5, label: "A few hours a week", detail: "Around 5 hours" },
  { hours: 10, label: "Most days", detail: "Around 10 hours" },
  { hours: 20, label: "This is my main focus", detail: "Around 20 hours" },
];

function defaultDeadline() {
  const date = new Date();
  date.setDate(date.getDate() + 56); // +8 weeks
  return date.toISOString().slice(0, 10);
}

/**
 * §9.3. The previous flow asked ~14 fields across 5 steps before delivering
 * anything (C12). This asks for one required thing — what the user is working
 * toward — and infers the rest. The API contract is unchanged; the client
 * supplies sensible defaults instead of interrogating the user for them.
 */
export function StartFlow({
  userName,
  onRefresh,
  onNavigate,
}: {
  userName: string;
  onRefresh: () => Promise<void>;
  onNavigate: (view: WorkspaceView) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [goalTitle, setGoalTitle] = useState("");
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PlanResult>();

  useEffect(() => {
    if (!busy) return;
    const timers = BUILD_STAGES.map((entry, index) => window.setTimeout(() => setStage(index), entry.after));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [busy]);

  async function build(weeklyHours: number) {
    setBusy(true);
    setError("");
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 90_000);
      const response = await fetch("/api/onboarding", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goalTitle: goalTitle.trim(),
          // Derived server-side when absent; the user is not asked to write a
          // success criterion before they have seen anything.
          goalOutcome: goalTitle.trim(),
          goalType: "exam",
          deadline,
          weeklyHours,
          academicLevel: "Not specified",
          subjects: ["General"],
          preferredTimes: [],
          confidence: "medium",
          learningPreferences: ["concise_first", "worked_examples"],
          privacyMode: "hybrid",
        }),
      });
      window.clearTimeout(timeout);
      const body = await response.json().catch(() => ({})) as PlanResult & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Your plan could not be built");
      // Deliberately not refreshing yet: refreshing swaps this component out for
      // the populated Home screen, and the user would never see what was built.
      setResult(body);
      setBusy(false);
    } catch (cause) {
      const aborted = cause instanceof DOMException && cause.name === "AbortError";
      setError(aborted ? "That took too long — nothing was lost. Try again." : cause instanceof Error ? cause.message : "Your plan could not be built");
      setBusy(false);
    }
  }

  function skip() {
    try { window.localStorage.setItem(SKIP_KEY, "1"); } catch { /* private mode */ }
    void onRefresh();
  }

  if (busy) {
    return (
      <div className="start">
        <div className="start-panel" role="status" aria-live="polite">
          <h1>Building your plan</h1>
          <p>This takes about twenty seconds.</p>
          <ol className="start-stages">
            {BUILD_STAGES.map((entry, index) => (
              <li key={entry.label} className={index < stage ? "is-done" : index === stage ? "is-active" : ""}>
                <span aria-hidden="true">{index < stage ? <Check size={13} /> : index === stage ? <LoaderCircle className="spin" size={13} /> : null}</span>
                {entry.label}
              </li>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  if (result) {
    const schedule = result.schedule ?? { status: "not_generated" as const };
    const taskCount = result.tasks?.length ?? 0;
    const milestoneCount = result.milestones?.length ?? 0;
    // §9.3 AC-S3: report only what the API actually returned. The previous flow
    // could claim a scheduled first week that had not been committed.
    const scheduleLine = schedule.status === "committed"
      ? `Your first week is scheduled — ${schedule.blocks ?? 0} block${schedule.blocks === 1 ? "" : "s"}.`
      : schedule.status === "empty"
        ? "Your tasks are ready, but the hours you gave couldn't fit them. You can adjust that in Plan."
        : "Tasks are ready — build your week when you're ready.";

    return (
      <div className="start">
        <div className="start-panel">
          <h1>{result.goal?.title ?? goalTitle}</h1>
          <p>Continuum built this from one sentence. Everything is editable.</p>
          <ul className="start-result">
            <li><strong>{milestoneCount}</strong> milestone{milestoneCount === 1 ? "" : "s"}</li>
            <li><strong>{taskCount}</strong> task{taskCount === 1 ? "" : "s"}</li>
          </ul>
          <p className="start-schedule">{scheduleLine}</p>
          <div className="start-actions">
            <Button variant="primary" onClick={() => void onRefresh()}>Open my workspace<ArrowRight size={15} /></Button>
            <Button variant="quiet" onClick={() => { void onRefresh().then(() => onNavigate("today")); }}>Start with today</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="start">
      <div className="start-panel">
        {step === 1 ? (
          <>
            <p className="eyebrow">Welcome, {userName}</p>
            <h1>Name one thing you&apos;re working toward.</h1>
            <p>Continuum will build the plan from it. You can change everything later.</p>

            <Field label="What are you working on?">
              {({ id }) => (
                <Input
                  id={id}
                  value={goalTitle}
                  onChange={(event) => setGoalTitle(event.target.value)}
                  placeholder="Raise my SAT score to 1550"
                  maxLength={200}
                  autoFocus
                  onKeyDown={(event) => { if (event.key === "Enter" && goalTitle.trim().length >= 3) setStep(2); }}
                />
              )}
            </Field>

            <div className="start-examples">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" onClick={() => setGoalTitle(example)}>{example}</button>
              ))}
            </div>

            <Field label="By when?" hint="Optional — defaults to eight weeks from today.">
              {({ id }) => <Input id={id} type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} />}
            </Field>

            {error ? <p className="start-error" role="alert">{error}</p> : null}

            <div className="start-actions">
              <Button variant="primary" disabled={goalTitle.trim().length < 3} onClick={() => setStep(2)}>Continue<ArrowRight size={15} /></Button>
              <Button variant="quiet" onClick={skip}>Skip — just show me around</Button>
            </div>
          </>
        ) : (
          <>
            <p className="eyebrow">Step 2 of 2</p>
            <h1>How much time, realistically?</h1>
            <p>This caps how much work Continuum schedules, so the first week is one you can actually finish.</p>

            <div className="start-commitments">
              {COMMITMENTS.map((option) => (
                <button key={option.hours} type="button" onClick={() => void build(option.hours)}>
                  <strong>{option.label}</strong>
                  <small>{option.detail}</small>
                </button>
              ))}
            </div>

            {error ? <p className="start-error" role="alert">{error}</p> : null}

            <div className="start-actions">
              <Button variant="quiet" onClick={() => setStep(1)}>Back</Button>
              <Button variant="quiet" onClick={() => void build(10)}>I&apos;ll decide later</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
