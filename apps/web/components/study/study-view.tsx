"use client";

/**
 * The Study view (redesign.md §14.1) — what `/learn` becomes.
 *
 * The screen it replaces presented six mental models at once (finding C10): a
 * "continue" hero, a grid of learning paths, and a four-tab tool bar holding a
 * concept map, question banks, a video search, and an activity log — plus a
 * separate four-step resource wizard reachable from four different links.
 *
 * There are now three sections and no tabs:
 *
 *   1. Continue — one row, one action, chosen deterministically.
 *   2. Concepts — a dense list sorted by need.
 *   3. Material and practice — what you have, and the one button that finds more.
 *
 * Everything else became a panel (`ResourcePanel`), a runner (`PracticeRunner`),
 * or a route (`/study/[sessionId]`).
 */
import { ArrowRight, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, EmptyState, LoadingButton, StatusChip } from "@/components/ui";
import { PageHeader } from "@/components/workspace/page-header";
import { PracticeRunner } from "@/components/workspace/question-bank-panel";
import { text, type WorkspaceState } from "@/components/workspace/types";
import { Stagger } from "@/components/ui/motion";
import { ReviewQueue } from "./review-queue";
import { ConceptList } from "./concept-list";
import { rankConcepts, type ConceptSignal } from "./mastery";
import { chooseNextAction } from "./next-action";
import { PracticeAndMaterial } from "./practice-list";
import { ResourcePanel } from "./resource-panel";
import "./study.css";

type Toast = (message: string | null) => void;

export function StudyView({
  state,
  showToast,
  onRefresh,
}: {
  state: WorkspaceState;
  showToast: Toast;
  onRefresh: () => Promise<void>;
}) {
  const router = useRouter();
  const [panelOpen, setPanelOpen] = useState(false);
  const [runner, setRunner] = useState<{ open: boolean; bankId?: string; intake: "file" | "photo" }>({ open: false, intake: "file" });
  const [starting, setStarting] = useState("");

  const concepts = useMemo(() => rankConcepts(state.learningStates), [state.learningStates]);

  /**
   * Days in a row with a verified check.
   *
   * Counted from the evidence, not from opening the app. A streak that rewards
   * showing up is a streak that measures showing up; this one only moves when
   * a concept was actually practised, so it is a claim the product can defend.
   */
  const streakDays = useMemo(() => {
    const days = new Set(
      (state.learningStates as unknown as Array<Record<string, unknown>>)
        .map((row) => row.lastPracticedAt)
        .filter((value): value is string | Date => Boolean(value))
        .map((value) => new Date(value).toISOString().slice(0, 10)),
    );
    let count = 0;
    const cursor = new Date();
    // Today not yet practised is not a broken streak — yesterday is.
    if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
    while (days.has(cursor.toISOString().slice(0, 10))) {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }, [state.learningStates]);
  const next = useMemo(() => chooseNextAction(state), [state]);
  const goal = state.goals[0];
  const goalId = text(goal, "id");

  /**
   * Which of the six chips is answered on the learner's behalf. An open
   * misconception needs diagnosis; weak transfer needs practice; weak exposure
   * needs an explanation. Deterministic, and always overridable by tapping a
   * different chip.
   */
  const defaultNeed = useMemo(() => {
    const top = concepts[0];
    if (!top) return "conceptual_intuition";
    if (top.openMisconception) return "diagnosis";
    return top.weakest.key === "exposure" ? "conceptual_intuition" : "guided_practice";
  }, [concepts]);

  /**
   * Opening a session is one write and one navigation. The lesson is generated
   * on the session page behind a shaped skeleton, so this stays fast and the
   * wait happens where the honest "writing a lesson…" note can be shown.
   */
  async function startSession(concept: ConceptSignal) {
    setStarting(concept.conceptId);
    try {
      const response = await fetch("/api/learning/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(goalId ? { goalId } : {}), conceptId: concept.conceptId }),
      });
      const body = await response.json() as { session?: { id: string }; error?: string };
      if (!response.ok || !body.session) throw new Error(body.error ?? "This study session could not be opened");
      router.push(`/study/${body.session.id}` as never);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "This study session could not be opened");
      setStarting("");
    }
  }

  function runNext() {
    if (!next) return;
    if (next.concept) { void startSession(next.concept); return; }
    if (next.questionBankId) { setRunner({ open: true, bankId: next.questionBankId, intake: "file" }); return; }
    setPanelOpen(true);
  }

  return (
    <Stagger className="screen study-screen" selector=":scope > *">
      <PageHeader
        title="Study"
        description="What to work on next, what you know, and the material behind it. Progress changes only after a check that can support it."
        stats={[{ label: "concepts", value: concepts.length }, { label: "practice sets", value: state.questionBanks.length }]}
      />

      {/* 1 — Due today. The schedule comes before the suggestion: what a
          learner owes their past self outranks what the product would pick. */}
      <section className="study-section" aria-labelledby="study-due-heading">
        <h2 id="study-due-heading" className="study-section-heading">Due today</h2>
        <ReviewQueue
          states={state.learningStates as unknown as Array<Record<string, unknown>>}
          streakDays={streakDays}
          onReview={(conceptId) => {
            const concept = concepts.find((entry) => entry.conceptId === conceptId);
            if (concept) void startSession(concept);
          }}
        />
      </section>

      {/* 2 — Continue. One row, one primary action. */}
      <section className="study-section" aria-labelledby="study-continue-heading">
        <h2 id="study-continue-heading" className="study-section-heading">Continue</h2>
        {next ? (
          <div className="study-continue">
            <span className="study-continue-mark" aria-hidden="true"><Sparkles size={16} /></span>
            <div className="study-continue-copy">
              <strong>{next.title}</strong>
              <p>{next.reason}</p>
            </div>
            {next.concept ? (
              <StatusChip
                tone={next.concept.tone}
                label={next.concept.openMisconception ? next.concept.misconceptionLabel! : `${next.concept.weakest.label} ${next.concept.weakest.percent}%`}
              />
            ) : null}
            <LoadingButton
              variant="primary"
              loading={Boolean(starting)}
              loadingLabel="Opening…"
              onClick={runNext}
            >
              {next.actionLabel}<ArrowRight size={15} aria-hidden="true" />
            </LoadingButton>
          </div>
        ) : (
          <EmptyState
            title="Nothing tracked yet"
            body="Add material to this goal and Continuum will find the concepts in it."
            action={<Button variant="primary" size="sm" onClick={() => setPanelOpen(true)}>Find material</Button>}
          />
        )}
      </section>

      {/* 2 — Concepts. */}
      <section className="study-section" aria-labelledby="study-concepts-heading">
        <h2 id="study-concepts-heading" className="study-section-heading">Concepts</h2>
        <ConceptList concepts={concepts} onStudy={(concept) => void startSession(concept)} onAddMaterial={() => setPanelOpen(true)} />
      </section>

      {/* 3 — Material and practice. */}
      <section className="study-section" aria-labelledby="study-materials-heading">
        <h2 id="study-materials-heading" className="study-section-heading">Material and practice</h2>
        <PracticeAndMaterial
          questionBanks={state.questionBanks}
          sources={state.sources}
          papers={state.papers}
          onPractise={(bankId) => setRunner({ open: true, bankId, intake: "file" })}
          onNewSet={() => setRunner({ open: true, bankId: undefined, intake: "file" })}
          onNewSetFromPhoto={() => setRunner({ open: true, bankId: undefined, intake: "photo" })}
          onFindMaterial={() => setPanelOpen(true)}
        />
      </section>

      <ResourcePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        goal={goal}
        conceptTitle={concepts[0]?.title}
        defaultNeed={defaultNeed}
        showToast={showToast}
        onRefresh={onRefresh}
      />

      <PracticeRunner
        open={runner.open}
        onOpenChange={(open) => setRunner((current) => ({ ...current, open }))}
        questionBankId={runner.bankId}
        intake={runner.intake}
        showToast={showToast}
        onRefresh={onRefresh}
      />
    </Stagger>
  );
}
