"use client";

/**
 * `/study/[sessionId]` — the study session (redesign.md §14.1).
 *
 * A focused surface: no sidebar, one 720px column, and a top bar reduced to a
 * back affordance, the concept name, and progress dots. Four phases advanced by
 * a single primary button: learn → check → result → next.
 *
 * The micro-lesson structure is kept because it was genuinely good — objectives,
 * two-column contrast sections, an example, the source-locked badge, and "Ask as
 * question" on each section. What changed around it:
 *
 *   - the checkpoint is generated for *this* concept instead of being one
 *     hardcoded electrostatics numerical (§14.1, AC-LN2);
 *   - the session lives in `study_sessions`, not in a localStorage blob, so it
 *     resumes on another device (feature #51);
 *   - the mastery rules are untouched — reading records exposure and never
 *     raises transfer, and only a correct unseen check does (AC-LN5).
 */
import { ExplainCheck } from "./explain-check";
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, HelpCircle, RotateCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Banner,
  Button,
  ErrorState,
  Field,
  Input,
  LoadingButton,
  Skeleton,
  StatusChip,
} from "@/components/ui";
import { formatLabel } from "@/lib/labels";
import { AskQuestionDialog } from "@/components/workspace/ask-question-dialog";
import "./study.css";

type Toast = (message: string | null) => void;
type Phase = "learn" | "check" | "result" | "done";

type Lesson = {
  id: string;
  conceptId: string;
  title: string;
  explanation: string;
  checksForUnderstanding: string[];
  sourceChunkIds: string[];
  evidenceState: string;
  model: string;
  durationMinutes?: number;
  objectives?: string[];
  sections?: Array<{ heading: string; body: string }>;
  examples?: string[];
};

type CheckpointItem = { id: string; prompt: string; answerType: "number" | "single_choice" | "short_text"; choices?: string[]; origin: string };
type Mastery = { transfer: number; retention: number; understanding: number; status: string; explanation: string };
type CheckResult = { correct: boolean; mastery: Mastery; masteryBefore?: Mastery; checkpointExplanation: string };

const PHASES: Phase[] = ["learn", "check", "result", "done"];

export function StudySession({
  sessionId,
  conceptId,
  conceptTitle,
  conceptDescription,
  goalId,
  goalTitle,
  initialPhase,
  initialLesson,
  initialCheckpoint,
  showToast,
}: {
  sessionId: string;
  conceptId: string;
  conceptTitle: string;
  conceptDescription: string;
  goalId?: string;
  goalTitle: string;
  initialPhase: Phase;
  initialLesson?: Lesson;
  /**
   * The question a resumed session was already showing. Without it, reopening a
   * session parked on `check` rendered an empty column — the phase said "check"
   * and there was nothing to answer.
   */
  initialCheckpoint?: CheckpointItem;
  showToast?: Toast;
}) {
  // A resumed phase is only honoured when the state it needs came back with it.
  // `result` in particular cannot be reconstructed — the marking happened in a
  // request that has already returned — so it resumes at the check instead of
  // rendering an empty column.
  const [phase, setPhase] = useState<Phase>(
    initialPhase === "check" && !initialCheckpoint ? "learn"
      : initialPhase === "result" ? (initialCheckpoint ? "check" : "learn")
        : initialPhase,
  );
  const [lesson, setLesson] = useState<Lesson | undefined>(initialLesson);
  const [lessonError, setLessonError] = useState("");
  const [checkpoint, setCheckpoint] = useState<CheckpointItem | undefined>(initialCheckpoint);
  const [checkpointNotice, setCheckpointNotice] = useState<string>();
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<CheckResult>();
  const [busy, setBusy] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [askSelection, setAskSelection] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const announced = useRef(false);

  const notify = useCallback((message: string) => { showToast?.(message); }, [showToast]);

  // Phase changes move focus to the new heading and are announced. Without this
  // the whole page swaps under a screen-reader user with no signal at all.
  useEffect(() => {
    if (!announced.current) { announced.current = true; return; }
    headingRef.current?.focus();
  }, [phase]);

  const persist = useCallback(async (patch: { phase?: Phase; lesson?: Record<string, unknown>; answer?: string }) => {
    try {
      await fetch("/api/learning/session", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, ...patch }),
      });
    } catch {
      // The session is a convenience, not the record of truth: mastery is
      // written by /api/learning. A failed save must not block the lesson.
    }
  }, [sessionId]);

  useEffect(() => {
    // Only the learn phase renders a lesson; generating one to show nobody is
    // a paid model call for no reason.
    if (lesson || lessonError || phase !== "learn") return;
    let active = true;
    fetch("/api/learning", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "lesson", liveAi: true, conceptId, topic: conceptTitle, description: conceptDescription }),
    })
      .then(async (response) => {
        const body = await response.json() as { lesson?: Lesson; error?: string };
        if (!response.ok || !body.lesson) throw new Error(body.error ?? "Couldn't build a lesson right now");
        if (!active) return;
        setLesson(body.lesson);
        void persist({ lesson: body.lesson as unknown as Record<string, unknown> });
      })
      .catch((cause) => { if (active) setLessonError(cause instanceof Error ? cause.message : "Couldn't build a lesson right now"); });
    return () => { active = false; };
  }, [conceptDescription, conceptId, conceptTitle, lesson, lessonError, persist, phase]);

  /** Reading records exposure. It never raises transfer — that is the point. */
  async function finishReading() {
    setBusy(true);
    try {
      await fetch("/api/learning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "lesson_read", conceptId }),
      });
      const response = await fetch("/api/learning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "checkpoint_item", conceptId, conceptLabel: conceptTitle, conceptDescription, sessionId, liveAi: true }),
      });
      const body = await response.json() as { item?: CheckpointItem; notice?: string; error?: string };
      if (!response.ok || !body.item) throw new Error(body.error ?? "The check could not be prepared");
      setCheckpoint(body.item);
      setCheckpointNotice(body.notice);
      setPhase("check");
      void persist({ phase: "check" });
    } catch (cause) { notify(cause instanceof Error ? cause.message : "The check could not be prepared"); }
    finally { setBusy(false); }
  }

  async function submitCheck() {
    setBusy(true);
    try {
      const response = await fetch("/api/learning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "checkpoint", answer, conceptId, conceptLabel: conceptTitle, conceptDescription, sessionId }),
      });
      const body = await response.json() as CheckResult & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The check could not be marked");
      setResult(body);
      setPhase("result");
      void persist({ phase: "result", answer });
    } catch (cause) { notify(cause instanceof Error ? cause.message : "The check could not be marked"); }
    finally { setBusy(false); }
  }

  async function tryAnother() {
    setBusy(true);
    setResult(undefined);
    setAnswer("");
    try {
      const response = await fetch("/api/learning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "checkpoint_item", conceptId, conceptLabel: conceptTitle, conceptDescription, sessionId, liveAi: true }),
      });
      const body = await response.json() as { item?: CheckpointItem; notice?: string; error?: string };
      if (!response.ok || !body.item) throw new Error(body.error ?? "Another check could not be prepared");
      setCheckpoint(body.item);
      setCheckpointNotice(body.notice);
      setPhase("check");
      void persist({ phase: "check" });
    } catch (cause) { notify(cause instanceof Error ? cause.message : "Another check could not be prepared"); }
    finally { setBusy(false); }
  }

  function ask(selection: string) {
    setAskSelection(selection);
    setAskOpen(true);
  }

  const percent = (value: number | undefined) => Math.round((value ?? 0) * 100);
  const goalHref = goalId ? `/g/${goalId}` : "/learn";

  return (
    <div className="study-session">
      <header className="study-session-bar">
        <Link className="study-back" href={goalHref as never}><ArrowLeft size={15} aria-hidden="true" />{goalTitle}</Link>
        <span className="study-session-concept">{conceptTitle}</span>
        <ol className="study-dots" aria-label={`Step ${PHASES.indexOf(phase) + 1} of 4`}>
          {PHASES.map((entry) => (
            <li key={entry} className={entry === phase ? "is-current" : PHASES.indexOf(entry) < PHASES.indexOf(phase) ? "is-done" : ""}>
              <span className="sr-only">{formatLabel(entry)}</span>
            </li>
          ))}
        </ol>
      </header>

      <p className="sr-only" role="status" aria-live="polite">
        {phase === "learn" ? "Lesson" : phase === "check" ? "Check your understanding" : phase === "result" ? "Result" : "What is next"}
      </p>

      <main className="study-session-column">
        {phase === "learn" ? (
          lessonError ? (
            <ErrorState
              title="Couldn't build a lesson right now"
              body="Here is what you can do instead: open the material attached to this goal, or try again in a moment."
              detail={lessonError}
              action={<Button variant="secondary" onClick={() => { setLessonError(""); }}>Try again</Button>}
            />
          ) : !lesson ? (
            /* A skeleton in the lesson's shape, plus the honest reason it is
               slow: this is a generation, and generations take seconds. */
            <div className="study-lesson-skeleton" role="status" aria-label="Writing a lesson for this concept">
              <Skeleton height={28} width="70%" />
              <Skeleton height={16} width="100%" />
              <Skeleton height={16} width="88%" />
              <Skeleton height={120} width="100%" radius={10} />
              <Skeleton height={120} width="100%" radius={10} />
              <p>Writing a lesson for {conceptTitle}…</p>
            </div>
          ) : (
            <article className="study-lesson">
              <h1 ref={headingRef} tabIndex={-1}>{lesson.title}</h1>
              <p className="study-lesson-lede">{lesson.explanation}</p>

              {lesson.objectives?.length ? (
                <section className="study-objectives">
                  <h2>By the end, you should be able to</h2>
                  <ul>{lesson.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul>
                </section>
              ) : null}

              <div className="study-contrast">
                {(lesson.sections ?? []).map((section, index) => (
                  <section key={section.heading}>
                    <span className="study-contrast-index" aria-hidden="true">{index + 1}</span>
                    <h2>{section.heading}</h2>
                    <p>{section.body}</p>
                    <Button variant="quiet" size="sm" onClick={() => ask(section.body)}>
                      <HelpCircle size={14} aria-hidden="true" />Ask as question
                    </Button>
                  </section>
                ))}
              </div>

              {lesson.examples?.length ? (
                <section className="study-example">
                  <h2>Example</h2>
                  {lesson.examples.map((example) => <p key={example}>{example}</p>)}
                </section>
              ) : null}

              <p className="study-provenance">
                <ShieldCheck size={15} aria-hidden="true" />
                <span>
                  <strong>{lesson.evidenceState === "direct_support" ? "Source-locked lesson" : "Context-limited lesson"}</strong>
                  {lesson.evidenceState === "direct_support" ? " Directly supported" : ` ${formatLabel(lesson.evidenceState)}`}
                  {lesson.sourceChunkIds.length ? ` · ${lesson.sourceChunkIds.join(", ")}` : ""} · {lesson.model}
                </span>
              </p>

              <div className="study-advance">
                <LoadingButton variant="primary" loading={busy} loadingLabel="Preparing a check…" onClick={() => void finishReading()}>
                  <Check size={15} aria-hidden="true" />I&rsquo;ve read this — check me
                </LoadingButton>
                <small>Reading records exposure. Transfer only moves after a check you have not seen before.</small>
              </div>
            </article>
          )
        ) : null}

        {phase === "check" && checkpoint ? (
          <article className="study-check">
            <h1 ref={headingRef} tabIndex={-1}>Check your understanding</h1>
            {checkpointNotice ? <Banner tone="info">{checkpointNotice}</Banner> : null}
            <p className="study-check-prompt">{checkpoint.prompt}</p>
            {checkpoint.answerType === "single_choice" && checkpoint.choices?.length ? (
              <div className="study-choices" role="radiogroup" aria-label="Answer">
                {checkpoint.choices.map((choice) => (
                  <button key={choice} type="button" role="radio" aria-checked={answer === choice} className={answer === choice ? "study-chip study-chip-on" : "study-chip"} onClick={() => setAnswer(choice)}>{choice}</button>
                ))}
              </div>
            ) : (
              <Field label={checkpoint.answerType === "number" ? "Your answer" : "Answer in your own words"}>
                {({ id }) => <Input id={id} value={answer} onChange={(event) => setAnswer(event.target.value)} inputMode={checkpoint.answerType === "number" ? "decimal" : undefined} autoFocus />}
              </Field>
            )}
            <div className="study-advance">
              <LoadingButton variant="primary" loading={busy} loadingLabel="Marking…" disabled={!answer.trim()} onClick={() => void submitCheck()}>
                Check my answer<ArrowRight size={15} aria-hidden="true" />
              </LoadingButton>
            </div>
          </article>
        ) : null}

        {phase === "result" && result ? (
          <article className="study-result">
            <h1 ref={headingRef} tabIndex={-1}>
              {/* Icon plus word: never colour alone (WCAG 1.4.1). */}
              {result.correct ? <CheckCircle2 size={22} aria-hidden="true" /> : <RotateCcw size={22} aria-hidden="true" />}
              {result.correct ? "Transfer updated" : "Not yet"}
            </h1>
            {result.correct ? (
              <>
                <p>You applied it to something new.</p>
                <p className="study-delta">
                  Transfer {percent(result.masteryBefore?.transfer)}% → <strong>{percent(result.mastery.transfer)}%</strong>
                  {" · "}Recall {percent(result.masteryBefore?.retention)}% → <strong>{percent(result.mastery.retention)}%</strong>
                </p>
              </>
            ) : (
              <>
                <StatusChip tone="warning" label={formatLabel(result.mastery.status)} />
                <p>{result.checkpointExplanation}</p>
              </>
            )}
            {/* The deepest check, and only after the shallow one passed.
                Picking the right option proves recognition; saying it back with
                the source hidden is the first evidence of understanding, and it
                is what sets the review interval. */}
            {result.correct && lesson?.explanation ? (
              <ExplainCheck
                conceptId={conceptId}
                conceptTitle={conceptTitle}
                sourceText={lesson.explanation}
                sourceLabel={lesson.title}
                sourceChunkId={lesson.sourceChunkIds?.[0]}
              />
            ) : null}

            <div className="study-advance">
              {result.correct ? (
                <Button variant="primary" onClick={() => { setPhase("done"); void persist({ phase: "done" }); }}>What&rsquo;s next<ArrowRight size={15} aria-hidden="true" /></Button>
              ) : (
                <LoadingButton variant="primary" loading={busy} loadingLabel="Preparing another…" onClick={() => void tryAnother()}>
                  Try a different one<ArrowRight size={15} aria-hidden="true" />
                </LoadingButton>
              )}
            </div>
          </article>
        ) : null}

        {phase === "done" ? (
          <article className="study-next">
            <h1 ref={headingRef} tabIndex={-1}>What&rsquo;s next</h1>
            <p className="study-next-recommendation">
              <BookOpen size={16} aria-hidden="true" />
              {result?.mastery.status === "mastered"
                ? "Move to the next concept — this one is supported by repeated unseen evidence."
                : result?.correct
                  ? "Come back tomorrow. A spaced review keeps what you just proved."
                  : "Practise five more on this concept before moving on."}
            </p>
            <div className="study-advance">
              <Link className="button button-primary" href={goalHref as never}>Back to {goalTitle}</Link>
            </div>
          </article>
        ) : null}
      </main>

      <AskQuestionDialog
        selection={askSelection}
        conceptId={conceptId}
        open={askOpen}
        onOpenChange={setAskOpen}
        onRefresh={async () => {}}
      />
    </div>
  );
}
