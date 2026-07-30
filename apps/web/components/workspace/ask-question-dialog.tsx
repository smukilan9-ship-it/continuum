"use client";

import { CheckCircle2, HelpCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, ErrorState, LoadingButton, Modal, SuccessState } from "@/components/ui";

type Evaluation = {
  score: number;
  verdict: "correct" | "incomplete" | "incorrect";
  explanation: string;
  improvedAnswer: string;
  correctPoints: string[];
  missingPoints: string[];
};

export function AskQuestionDialog({ selection, conceptId, open, onOpenChange, onRefresh }: { selection: string; conceptId: string; open: boolean; onOpenChange: (open: boolean) => void; onRefresh: () => Promise<void> }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [resolvedConceptId, setResolvedConceptId] = useState(conceptId);
  const [confidence, setConfidence] = useState(.6);
  const [evaluation, setEvaluation] = useState<Evaluation>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !selection) return;
    setQuestion("");
    setResolvedConceptId(conceptId);
    setAnswer("");
    setEvaluation(undefined);
    setError("");
    setBusy(true);
    fetch("/api/learning", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "ask_question", selection, conceptId }),
    }).then(async (response) => {
      const payload = await response.json() as { question?: string; conceptId?: string; error?: string };
      if (!response.ok || !payload.question) throw new Error(payload.error ?? "A question could not be prepared");
      setQuestion(payload.question);
      setResolvedConceptId(payload.conceptId ?? conceptId);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "A question could not be prepared")).finally(() => setBusy(false));
  }, [conceptId, open, selection]);

  async function evaluate() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/learning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "evaluate_answer", selection, question, answer, conceptId: resolvedConceptId, selfConfidence: confidence }),
      });
      const payload = await response.json() as { evaluation?: Evaluation; error?: string };
      if (!response.ok || !payload.evaluation) throw new Error(payload.error ?? "The answer could not be checked");
      setEvaluation(payload.evaluation);
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The answer could not be checked");
    } finally {
      setBusy(false);
    }
  }

  return <Modal open={open} onOpenChange={onOpenChange} title="Answer in your own words" description="Continuum turns the selected idea into a real question, checks your natural-language answer, and saves the result to learning history.">
    <div className="ask-question-dialog">
      <div className="ask-source"><Badge tone="neutral">Selected idea</Badge><p>{selection}</p></div>
      {busy && !question ? <div className="assistant-loading">Preparing a useful question…</div> : null}
      {question ? <div className="ask-prompt"><HelpCircle size={19} /><h3>{question}</h3></div> : null}
      {!evaluation && question ? <><label>Your answer<textarea autoFocus rows={6} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Explain it naturally. You do not need to match exact wording." /></label><label className="ask-confidence">Confidence<input type="range" min="0" max="1" step=".1" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} /><span>{Math.round(confidence * 100)}%</span></label><LoadingButton className="button-primary" loading={busy} loadingLabel="Checking your reasoning…" disabled={!answer.trim()} onClick={() => void evaluate()}><ShieldCheck size={15} />Check my answer</LoadingButton></> : null}
      {evaluation ? <div className="ask-evaluation">{evaluation.verdict === "correct" ? <SuccessState title="Strong answer" body={evaluation.explanation} /> : <ErrorState title={evaluation.verdict === "incomplete" ? "Good start—one part is missing" : "Revisit the selected idea"} body={evaluation.explanation} />}<section><strong>Improved answer</strong><p>{evaluation.improvedAnswer}</p></section>{evaluation.missingPoints.length ? <section><strong>What to add</strong><ul>{evaluation.missingPoints.map((point) => <li key={point}>{point}</li>)}</ul></section> : null}<p className="ask-saved"><CheckCircle2 size={14} />Saved to learning history. Guided answers improve understanding, but do not prove transfer mastery.</p><Button className="button-primary" onClick={() => onOpenChange(false)}>Done</Button></div> : null}
      {error ? <div className="field-error" role="alert">{error}</div> : null}
    </div>
  </Modal>;
}
