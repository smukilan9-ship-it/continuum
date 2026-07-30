"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Check, Eye, EyeOff, Minus } from "lucide-react";

import { LoadingButton, StatusChip } from "@/components/ui";
import { explainPrompt, verdictCopy, type ExplainGrade } from "@/lib/learning/explain-back";

/**
 * The explain-back check.
 *
 * A multiple choice cannot tell recognition from understanding — the learner
 * sees the answer among four and picks it, and the number goes up. Here the
 * source is hidden by default and they write the idea in their own words, which
 * is the only form of the question that requires them to have it.
 *
 * The result leads with what the source contradicts, never with a percentage. A
 * bare "77%" invites "that's fine" when the missing 23% is a belief the passage
 * denies, and that belief is what will cost them in an exam.
 */
export function ExplainCheck({
  conceptId,
  conceptTitle,
  sourceText,
  sourceLabel,
  sourceChunkId,
  onGraded,
}: {
  conceptId: string;
  conceptTitle: string;
  sourceText: string;
  sourceLabel: string;
  sourceChunkId?: string;
  onGraded?: (grade: ExplainGrade) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [grade, setGrade] = useState<ExplainGrade>();
  const [error, setError] = useState<string>();
  const startedAt = useRef(Date.now());

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/learning/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conceptId,
          conceptTitle,
          answer,
          sourceText,
          sourceChunkId,
          seconds: Math.round((Date.now() - startedAt.current) / 1000),
        }),
      });
      const payload = await response.json() as { grade?: ExplainGrade; error?: string };
      if (!response.ok || !payload.grade) throw new Error(payload.error ?? "The check could not be graded.");
      setGrade(payload.grade);
      setRevealed(true);
      onGraded?.(payload.grade);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The check could not be graded.");
    } finally {
      setBusy(false);
    }
  }

  if (grade) {
    const copy = verdictCopy(grade);
    return (
      <section className="explain-check explain-result" aria-live="polite">
        <header>
          <StatusChip tone={copy.tone} label={copy.title} />
        </header>

        <p className="explain-feedback">{grade.feedback}</p>

        {grade.wrong.length ? (
          <div className="explain-group explain-group-wrong">
            <h4><AlertTriangle size={15} aria-hidden="true" />Your source says otherwise</h4>
            <ul>{grade.wrong.map((claim) => <li key={claim}>&ldquo;{claim}&rdquo;</li>)}</ul>
            <p className="explain-source"><strong>{sourceLabel}</strong>: {sourceText}</p>
          </div>
        ) : null}

        {grade.missing.length ? (
          <div className="explain-group explain-group-missing">
            <h4><Minus size={15} aria-hidden="true" />Not in your answer</h4>
            <ul>{grade.missing.map((point) => <li key={point}>{point}</li>)}</ul>
          </div>
        ) : null}

        {grade.covered.length ? (
          <div className="explain-group explain-group-covered">
            <h4><Check size={15} aria-hidden="true" />You had this</h4>
            <ul>{grade.covered.map((point) => <li key={point}>{point}</li>)}</ul>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="explain-check">
      <header className="explain-head">
        <div>
          <h3>Explain it back</h3>
          <p>{explainPrompt(conceptTitle)}</p>
        </div>
        <button
          type="button"
          className="explain-peek"
          onClick={() => setRevealed((current) => !current)}
          aria-pressed={revealed}
        >
          {revealed ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
          {revealed ? "Hide the source" : "I need the source"}
        </button>
      </header>

      {/* Hidden by default: reading it first turns this into transcription. Not
          forbidden — a learner who is stuck should look — but the choice is
          theirs and it is visible. */}
      {revealed ? (
        <p className="explain-source"><strong>{sourceLabel}</strong>: {sourceText}</p>
      ) : null}

      <label className="explain-field">
        <span className="sr-only">Your explanation of {conceptTitle}</span>
        <textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder="In your own words…"
          rows={4}
          maxLength={4_000}
        />
      </label>

      {error ? <p className="form-error">{error}</p> : null}

      <footer className="explain-actions">
        <LoadingButton
          variant="primary"
          loading={busy}
          loadingLabel="Checking…"
          disabled={answer.trim().length < 12}
          onClick={() => void submit()}
        >
          Check my explanation
        </LoadingButton>
        {answer.trim().length < 12 ? <span className="explain-hint">A sentence or two is enough.</span> : null}
      </footer>
    </section>
  );
}
