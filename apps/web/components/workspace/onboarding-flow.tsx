"use client";

import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { PageIntro } from "./page-intro";

type Intake = {
  curriculum: string;
  level: string;
  subjects: string;
  goalTitle: string;
  goalType: string;
  goalOutcome: string;
  deadline: string;
  confidence: string;
  weeklyHours: number;
  preferredTimes: string[];
  learningPreferences: string[];
  privacyMode: string;
};

const STORAGE_KEY = "continuum.onboarding.draft.v1";

const defaults: Intake = {
  curriculum: "CBSE",
  level: "Class 12",
  subjects: "",
  goalTitle: "",
  goalType: "exam",
  goalOutcome: "",
  deadline: "",
  confidence: "medium",
  weeklyHours: 10,
  preferredTimes: [],
  learningPreferences: ["concise_first", "worked_examples"],
  privacyMode: "hybrid",
};

const STEPS = ["About you", "Your goal", "Your time", "How we help", "Review"] as const;

const timeSlots = [
  { value: "morning", label: "Mornings" },
  { value: "afternoon", label: "Afternoons" },
  { value: "evening", label: "Evenings" },
  { value: "night", label: "Late night" },
];
const learningOptions = [
  { value: "concise_first", label: "Concise first, detail on demand" },
  { value: "worked_examples", label: "Learn from worked examples" },
  { value: "active_recall", label: "Quiz me with active recall" },
  { value: "visual", label: "Diagrams and visuals" },
];

export function OnboardingFlow({ userName, onRefresh }: { userName: string; onRefresh: () => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [intake, setIntake] = useState<Intake>(defaults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [restored, setRestored] = useState(false);

  // Save & resume: draft is kept in localStorage until the plan is created.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setIntake({ ...defaults, ...(JSON.parse(saved) as Partial<Intake>) });
    } catch { /* ignore malformed drafts */ }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (restored) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(intake));
  }, [intake, restored]);

  const today = new Date().toISOString().slice(0, 10);
  const set = <K extends keyof Intake>(key: K, value: Intake[K]) => setIntake((prev) => ({ ...prev, [key]: value }));
  const toggle = (key: "preferredTimes" | "learningPreferences", value: string) =>
    setIntake((prev) => ({ ...prev, [key]: prev[key].includes(value) ? prev[key].filter((item) => item !== value) : [...prev[key], value] }));

  const subjectList = useMemo(() => intake.subjects.split(",").map((value) => value.trim()).filter(Boolean), [intake.subjects]);

  const stepValid = useMemo(() => {
    if (step === 0) return intake.level.trim().length > 0 && subjectList.length > 0;
    if (step === 1) return intake.goalTitle.trim().length >= 3 && intake.goalOutcome.trim().length >= 3 && Boolean(intake.deadline);
    if (step === 2) return intake.weeklyHours >= 1 && intake.weeklyHours <= 80;
    return true;
  }, [step, intake, subjectList.length]);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          academicLevel: `${intake.curriculum} ${intake.level}`.trim(),
          subjects: subjectList.length ? subjectList : ["General"],
          primarySubject: subjectList[0],
          goalTitle: intake.goalTitle.trim(),
          goalOutcome: intake.goalOutcome.trim(),
          goalType: intake.goalType,
          deadline: intake.deadline,
          weeklyHours: Number(intake.weeklyHours),
          preferredTimes: intake.preferredTimes,
          confidence: intake.confidence,
          learningPreferences: intake.learningPreferences,
          privacyMode: intake.privacyMode,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Onboarding could not be completed");
      window.localStorage.removeItem(STORAGE_KEY);
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Onboarding could not be completed");
      setBusy(false);
    }
  }

  const next = () => (step < STEPS.length - 1 ? setStep((value) => value + 1) : void submit());

  return (
    <div className="screen onboarding-screen">
      <PageIntro eyebrow="GET STARTED" title={`Let's build your real plan, ${userName}.`} description="A few questions become a goal, milestones, actionable tasks, and a first-week schedule — one shared context for the app and every assistant you authorize." />

      <div className="onboarding-shell">
        <ol className="onboarding-steps" aria-label="Onboarding progress">
          {STEPS.map((label, index) => (
            <li key={label} className={index === step ? "current" : index < step ? "done" : ""} aria-current={index === step ? "step" : undefined}>
              <span className="step-dot">{index < step ? <Check size={13} /> : index + 1}</span>
              <span className="step-label">{label}</span>
            </li>
          ))}
        </ol>

        <form
          className="onboarding-panel"
          onSubmit={(event) => { event.preventDefault(); if (stepValid && !busy) next(); }}
        >
          {step === 0 && (
            <fieldset>
              <legend>About you</legend>
              <p className="onboarding-help">This tailors the curriculum and diagnostic. You can change it later.</p>
              <div className="onboarding-grid">
                <label>Curriculum
                  <select value={intake.curriculum} onChange={(event) => set("curriculum", event.target.value)}>
                    {["CBSE", "ICSE", "State board", "IB", "A-levels", "Other"].map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
                <label>Academic level
                  <select value={intake.level} onChange={(event) => set("level", event.target.value)}>
                    {["Class 9", "Class 10", "Class 11", "Class 12", "Undergraduate", "Other"].map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
              </div>
              <label>Subjects you’re focused on
                <input value={intake.subjects} onChange={(event) => set("subjects", event.target.value)} placeholder="Computer Science, Mathematics, Physics" autoFocus />
                <small className="field-hint">Separate with commas. {subjectList.length ? `${subjectList.length} added.` : ""}</small>
              </label>
            </fieldset>
          )}

          {step === 1 && (
            <fieldset>
              <legend>What are you working toward?</legend>
              <p className="onboarding-help">One clear outcome. Continuum turns it into milestones and tasks.</p>
              <label>Goal
                <input value={intake.goalTitle} onChange={(event) => set("goalTitle", event.target.value)} placeholder="e.g. Master SQL and Python–MySQL connectivity" autoFocus />
              </label>
              <div className="onboarding-grid">
                <label>Goal type
                  <select value={intake.goalType} onChange={(event) => set("goalType", event.target.value)}>
                    <option value="exam">Exam prep</option>
                    <option value="school">School topic</option>
                    <option value="university">University</option>
                    <option value="research">Research</option>
                    <option value="coding">Coding project</option>
                  </select>
                </label>
                <label>Target date<input type="date" value={intake.deadline} min={today} onChange={(event) => set("deadline", event.target.value)} /></label>
              </div>
              <label>What does success look like?
                <textarea value={intake.goalOutcome} onChange={(event) => set("goalOutcome", event.target.value)} placeholder="Write parameterized queries confidently and explain commit/rollback without notes" />
              </label>
              <label>Starting confidence
                <select value={intake.confidence} onChange={(event) => set("confidence", event.target.value)}>
                  <option value="low">Just starting out</option>
                  <option value="medium">Somewhat comfortable</option>
                  <option value="high">Quite confident</option>
                </select>
              </label>
            </fieldset>
          )}

          {step === 2 && (
            <fieldset>
              <legend>Your time</legend>
              <p className="onboarding-help">We size study sessions to fit your real week.</p>
              <label>Roughly how many hours can you study each week?
                <input type="range" min={1} max={40} value={intake.weeklyHours} onChange={(event) => set("weeklyHours", Number(event.target.value))} />
                <strong className="range-value">{intake.weeklyHours} hours / week</strong>
              </label>
              <fieldset className="chip-set">
                <legend>When do you study best?</legend>
                <div className="chip-row">
                  {timeSlots.map((slot) => (
                    <label key={slot.value} className={intake.preferredTimes.includes(slot.value) ? "chip selected" : "chip"}>
                      <input type="checkbox" checked={intake.preferredTimes.includes(slot.value)} onChange={() => toggle("preferredTimes", slot.value)} />{slot.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </fieldset>
          )}

          {step === 3 && (
            <fieldset>
              <legend>How should Continuum help?</legend>
              <p className="onboarding-help">This shapes explanations and how your data is handled.</p>
              <fieldset className="chip-set">
                <legend>Learning style</legend>
                <div className="chip-row">
                  {learningOptions.map((option) => (
                    <label key={option.value} className={intake.learningPreferences.includes(option.value) ? "chip selected" : "chip"}>
                      <input type="checkbox" checked={intake.learningPreferences.includes(option.value)} onChange={() => toggle("learningPreferences", option.value)} />{option.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="chip-set">
                <legend>Model & privacy mode</legend>
                <div className="chip-row">
                  {[{ value: "hybrid", label: "Cloud / hybrid (recommended)" }, { value: "local_only", label: "Local only" }].map((option) => (
                    <label key={option.value} className={intake.privacyMode === option.value ? "chip selected" : "chip"}>
                      <input type="radio" name="privacyMode" checked={intake.privacyMode === option.value} onChange={() => set("privacyMode", option.value)} />{option.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </fieldset>
          )}

          {step === 4 && (
            <fieldset>
              <legend>Review & create your plan</legend>
              <p className="onboarding-help">Continuum will create a goal, milestones, actionable tasks, and a first-week schedule — deterministically.</p>
              <dl className="onboarding-review">
                <div><dt>You</dt><dd>{intake.curriculum} {intake.level} · {subjectList.join(", ") || "—"}</dd></div>
                <div><dt>Goal</dt><dd>{intake.goalTitle || "—"}</dd></div>
                <div><dt>Success</dt><dd>{intake.goalOutcome || "—"}</dd></div>
                <div><dt>Target</dt><dd>{intake.deadline || "—"} · {intake.goalType}</dd></div>
                <div><dt>Time</dt><dd>{intake.weeklyHours}h/week · {intake.preferredTimes.join(", ") || "flexible"}</dd></div>
                <div><dt>Help</dt><dd>{intake.learningPreferences.length} preferences · {intake.privacyMode === "hybrid" ? "cloud/hybrid" : "local only"}</dd></div>
              </dl>
              <p className="onboarding-create-note"><Sparkles size={14} /> High-impact assistant changes always stay pending until you approve them.</p>
            </fieldset>
          )}

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          <div className="onboarding-actions">
            <Button type="button" className="button-quiet" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0 || busy}><ArrowLeft size={15} />Back</Button>
            <span className="onboarding-progress-label">Step {step + 1} of {STEPS.length}</span>
            <Button type="submit" className="button-primary" disabled={!stepValid || busy}>
              {step === STEPS.length - 1 ? (busy ? "Building your plan…" : "Create my plan") : "Continue"}
              {busy ? null : step === STEPS.length - 1 ? <Check size={16} /> : <ArrowRight size={16} />}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
