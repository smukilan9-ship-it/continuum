"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, FileText, FileUp, Layers3, LoaderCircle, Pencil, Play, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, ErrorState, LoadingButton, Modal, SuccessState } from "@/components/ui";
import { formatLabel } from "@/lib/labels";
import { type Row, type WorkspaceState } from "./types";

type Toast = (message: string | null) => void;
type QuestionMode = "short_answer" | "long_answer" | "multiple_choice" | "flashcards" | "oral_recall" | "timed_practice" | "mixed_review";
type QuestionType = "short_answer" | "long_answer" | "multiple_choice" | "multiple_select" | "true_false" | "fill_blank" | "assertion_reason" | "matching" | "case_study" | "passage" | "calculation" | "diagram_labeling" | "table" | "flashcard";
type Question = {
  id: string;
  prompt: string;
  expectedAnswer?: string;
  explanation?: string;
  type: QuestionType;
  choices?: string[];
  difficulty: number;
  sourceChunkIds: string[];
  confidence?: number;
  answerKeyProvenance?: "extracted_from_source" | "user_provided" | "model_inferred" | "not_available";
  reviewRequired?: boolean;
  sourceRegion?: { page: number; x: number; y: number; width: number; height: number };
  diagramAsset?: { extractionId: string; page: number; x: number; y: number; width: number; height: number; alt?: string };
};
type Attempt = { id: string; currentIndex: number; score: number; completedAt?: string; answers: Row[]; evaluations: Row[]; updatedAt?: string };
type QuestionBank = {
  id: string;
  title: string;
  sourceId: string;
  conceptId?: string;
  status: string;
  mode: QuestionMode;
  questions: Question[];
  attempts?: Attempt[];
  injectionDetected?: boolean;
  updatedAt?: string;
};
type Evaluation = {
  score: number;
  verdict: "correct" | "incomplete" | "incorrect";
  correctPoints: string[];
  missingPoints: string[];
  incorrectPoints: string[];
  improvedAnswer: string;
  explanation: string;
  verification: { status: string; note: string; uncertainty?: string };
};

const modes: Array<{ id: QuestionMode; label: string; description: string }> = [
  { id: "mixed_review", label: "Mixed review", description: "Vary the answer style across the bank." },
  { id: "short_answer", label: "Short answer", description: "Recall the key idea in a few sentences." },
  { id: "long_answer", label: "Long answer", description: "Practise complete explanations." },
  { id: "multiple_choice", label: "Multiple choice", description: "Use provided options when available." },
  { id: "flashcards", label: "Flashcards", description: "Prompt first, then compare your recall." },
  { id: "oral_recall", label: "Oral-style recall", description: "Say it aloud, then record the key points." },
  { id: "timed_practice", label: "Timed practice", description: "Complete the bank against a visible clock." },
];

function newestAttempt(bank: QuestionBank) {
  return [...(bank.attempts ?? [])].sort((left, right) => Date.parse(right.updatedAt ?? "") - Date.parse(left.updatedAt ?? ""))[0];
}

export function QuestionBankPanel({ state, showToast, onRefresh }: { state: WorkspaceState; showToast: Toast; onRefresh: () => Promise<void> }) {
  const [banks, setBanks] = useState<QuestionBank[]>(() => state.questionBanks as QuestionBank[]);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"upload" | "edit" | "mode" | "practice" | "complete">("upload");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [file, setFile] = useState<File>();
  const [bank, setBank] = useState<QuestionBank>();
  const [mode, setMode] = useState<QuestionMode>("mixed_review");
  const [attemptId, setAttemptId] = useState<string>();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [selfConfidence, setSelfConfidence] = useState(0.6);
  const [hintUsed, setHintUsed] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation>();
  const [expectedAnswer, setExpectedAnswer] = useState("");
  const [timerSeconds, setTimerSeconds] = useState(300);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open || phase !== "practice" || mode !== "timed_practice" || evaluation || timerSeconds <= 0) return;
    const interval = window.setInterval(() => setTimerSeconds((seconds) => Math.max(0, seconds - 1)), 1_000);
    return () => window.clearInterval(interval);
  }, [evaluation, mode, open, phase, timerSeconds]);

  function resetFlow() {
    setPhase("upload");
    setFile(undefined);
    setBank(undefined);
    setMode("mixed_review");
    setAttemptId(undefined);
    setCurrentIndex(0);
    setAnswer("");
    setEvaluation(undefined);
    setExpectedAnswer("");
    setError("");
    setProgress("");
    setTimerSeconds(300);
  }

  async function refreshBanks() {
    const response = await fetch("/api/question-banks", { cache: "no-store" });
    const payload = await response.json() as { questionBanks?: QuestionBank[]; error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Question banks are unavailable");
    setBanks(payload.questionBanks ?? []);
  }

  async function uploadAndExtract() {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const imageInput = file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name);
      if (imageInput) {
        setProgress("Normalizing image and detecting question regions…");
        const form = new FormData();
        form.set("file", file);
        form.set("title", file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
        form.set("topic", file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
        const response = await fetch("/api/question-banks/image", { method: "POST", body: form });
        const payload = await response.json() as { questionBank?: QuestionBank; cached?: boolean; error?: string };
        if (!response.ok || !payload.questionBank) throw new Error(payload.error ?? "Questions could not be extracted from this image");
        setBank(payload.questionBank);
        setMode(payload.questionBank.mode);
        setPhase("edit");
        await refreshBanks();
        showToast(`${payload.questionBank.questions.length} image-based questions are ready to review${payload.cached ? " from the safe extraction cache" : ""}.`);
        return;
      }
      setProgress("Uploading and checking the document…");
      const form = new FormData();
      form.set("file", file);
      const upload = await fetch("/api/sources", { method: "POST", body: form });
      const uploadBody = await upload.json() as { error?: string; duplicate?: boolean; source?: { id?: string; title?: string; injectionDetected?: boolean } };
      if (!upload.ok || !uploadBody.source?.id) {
        if (/\.pdf$/i.test(file.name)) {
          setProgress("The PDF appears scanned. Rendering pages for image extraction…");
          const scannedForm = new FormData();
          scannedForm.set("file", file);
          scannedForm.set("title", file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
          scannedForm.set("topic", file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
          const scanned = await fetch("/api/question-banks/image", { method: "POST", body: scannedForm });
          const scannedBody = await scanned.json() as { questionBank?: QuestionBank; cached?: boolean; error?: string };
          if (!scanned.ok || !scannedBody.questionBank) throw new Error(scannedBody.error ?? uploadBody.error ?? "The scanned PDF could not be extracted");
          setBank(scannedBody.questionBank);
          setMode(scannedBody.questionBank.mode);
          setPhase("edit");
          await refreshBanks();
          showToast(`${scannedBody.questionBank.questions.length} scanned questions are ready to review.`);
          return;
        }
        throw new Error(uploadBody.error ?? "The document could not be uploaded");
      }
      setProgress("Detecting question and answer structure…");
      const create = await fetch("/api/question-banks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          sourceId: uploadBody.source.id,
          title: uploadBody.source.title ?? file.name,
          topic: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
          injectionDetected: Boolean(uploadBody.source.injectionDetected),
        }),
      });
      const body = await create.json() as { questionBank?: QuestionBank; error?: string };
      if (!create.ok || !body.questionBank) throw new Error(body.error ?? "Questions could not be prepared");
      setBank(body.questionBank);
      setMode(body.questionBank.mode);
      setPhase("edit");
      await refreshBanks();
      showToast(`${body.questionBank.questions.length} questions are ready to review.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The question bank could not be created");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  async function openBank(questionBankId: string) {
    setOpen(true);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/question-banks?questionBankId=${encodeURIComponent(questionBankId)}&view=edit`, { cache: "no-store" });
      const payload = await response.json() as { questionBank?: QuestionBank; error?: string };
      if (!response.ok || !payload.questionBank) throw new Error(payload.error ?? "Question bank could not be opened");
      const selected = payload.questionBank;
      setBank(selected);
      setMode(selected.mode);
      const attempt = newestAttempt(selected);
      if (attempt && !attempt.completedAt) {
        setAttemptId(attempt.id);
        setCurrentIndex(attempt.currentIndex);
        setPhase("practice");
      } else setPhase("edit");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Question bank could not be opened");
    } finally {
      setBusy(false);
    }
  }

  function editQuestion(questionId: string, patch: Partial<Question>) {
    setBank((current) => current ? { ...current, questions: current.questions.map((question) => question.id === questionId ? { ...question, ...patch } : question) } : current);
  }

  function removeQuestion(questionId: string) {
    setBank((current) => current ? { ...current, questions: current.questions.filter((question) => question.id !== questionId) } : current);
  }

  async function saveBank(nextPhase: "mode" | "edit" = "mode") {
    if (!bank) return false;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/question-banks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update", questionBankId: bank.id, title: bank.title, mode, questions: bank.questions }),
      });
      const payload = await response.json() as { questionBank?: QuestionBank; error?: string };
      if (!response.ok || !payload.questionBank) throw new Error(payload.error ?? "Question bank could not be saved");
      setBank({ ...payload.questionBank, attempts: bank.attempts });
      setPhase(nextPhase);
      await refreshBanks();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Question bank could not be saved");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function startPractice() {
    if (!bank) return;
    if (!await saveBank("mode")) return;
    setAttemptId(undefined);
    setCurrentIndex(0);
    setEvaluation(undefined);
    setExpectedAnswer("");
    setAnswer("");
    setTimerSeconds(Math.max(300, bank.questions.length * 90));
    setPhase("practice");
  }

  async function gradeAnswer() {
    if (!bank || !bank.questions[currentIndex] || !answer.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const question = bank.questions[currentIndex]!;
      const response = await fetch("/api/question-banks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "answer",
          questionBankId: bank.id,
          attemptId,
          questionId: question.id,
          answer,
          mode,
          currentIndex,
          hintUsed,
          selfConfidence,
        }),
      });
      const payload = await response.json() as { attempt?: Attempt; evaluation?: Evaluation; expectedAnswer?: string; nextIndex?: number; completed?: boolean; error?: string };
      if (!response.ok || !payload.attempt || !payload.evaluation) throw new Error(payload.error ?? "The answer could not be checked");
      setAttemptId(payload.attempt.id);
      setEvaluation(payload.evaluation);
      setExpectedAnswer(payload.expectedAnswer ?? "");
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The answer could not be checked");
    } finally {
      setBusy(false);
    }
  }

  function nextQuestion() {
    if (!bank) return;
    const next = Math.min(bank.questions.length, currentIndex + 1);
    if (next >= bank.questions.length) { setPhase("complete"); return; }
    setCurrentIndex(next);
    setAnswer("");
    setEvaluation(undefined);
    setExpectedAnswer("");
    setHintUsed(false);
  }

  const currentQuestion = bank?.questions[currentIndex];

  return (
    <section className="question-bank-section">
      <div className="section-heading"><div><p className="eyebrow">QUESTION BANKS</p><h2>Practise from your own material</h2><p className="section-description">Upload a document, image, photographed worksheet, or scanned PDF; review every detected question before practising.</p></div><Button className="button-primary" onClick={() => { resetFlow(); setOpen(true); }}><FileUp size={15} />Upload question bank</Button></div>
      <div className="question-bank-list">
        {banks.slice(0, 4).map((item) => <button key={item.id} onClick={() => void openBank(item.id)}><span><Layers3 size={18} /></span><div><strong>{item.title}</strong><small>{Array.isArray(item.questions) ? item.questions.length : 0} questions · {formatLabel(item.status)}</small></div><ArrowRight size={16} /></button>)}
        {!banks.length ? <div className="question-bank-empty"><FileText size={23} /><div><strong>No question bank yet</strong><p>PNG, JPEG, WebP, scanned PDF, DOCX, TXT, Markdown, and CSV are supported.</p></div></div> : null}
      </div>

      <Modal open={open} onOpenChange={(value) => { setOpen(value); if (!value && !busy) resetFlow(); }} title="Document question bank" description="Continuum treats uploaded material as untrusted content and uses it as the primary grading source." dirty={Boolean(file || bank)} dirtyMessage="Close this question-bank workflow? Saved banks and attempts will remain available.">
        <div className="question-bank-progress" aria-label="Question bank workflow">
          {["Upload", "Review", "Mode", "Practise"].map((label, index) => {
            const phaseIndex = ({ upload: 0, edit: 1, mode: 2, practice: 3, complete: 3 })[phase];
            return <span key={label} className={index === phaseIndex ? "active" : index < phaseIndex ? "done" : ""}><i>{index < phaseIndex ? <Check size={11} /> : index + 1}</i>{label}</span>;
          })}
        </div>

        {error ? <div className="inline-alert" role="alert"><AlertTriangle size={16} /><span>{error}</span><button onClick={() => setError("")}>Dismiss</button></div> : null}

        {phase === "upload" ? <div className="question-upload-step">
          <input ref={fileInputRef} className="sr-only" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.docx,.txt,.md,.markdown,.csv,image/png,image/jpeg,image/webp,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0])} />
          <button className="question-dropzone" type="button" onClick={() => fileInputRef.current?.click()}><FileUp size={27} /><strong>{file ? file.name : "Choose a question document or image"}</strong><span>{file ? `${(file.size / 1024).toFixed(1)} KB selected` : "Photos and scanned PDFs up to 20 MB · documents up to 10 MB"}</span></button>
          <div className="question-upload-safety"><ShieldCheck size={17} /><div><strong>Document-safe extraction</strong><p>File signatures, pixels, pages, and size are bounded. Image text is untrusted evidence and cannot access tools, URLs, or provider keys.</p></div></div>
          <LoadingButton className="button-primary button-large" loading={busy} loadingLabel={progress || "Preparing questions…"} disabled={!file} onClick={() => void uploadAndExtract()}><Sparkles size={16} />Extract questions</LoadingButton>
        </div> : null}

        {phase === "edit" && bank ? <div className="question-edit-step">
          <div className="question-bank-title-row"><label>Question bank title<input value={bank.title} maxLength={240} onChange={(event) => setBank({ ...bank, title: event.target.value })} /></label><Badge tone={bank.injectionDetected ? "orange" : "green"}>{bank.injectionDetected ? "Embedded instruction removed" : "Document checked"}</Badge></div>
          <p>Review and correct the detected prompts and answers before practising. Nothing is hidden from you at this stage.</p>
          <div className="question-editor-list">{bank.questions.map((question, index) => <details key={question.id} open={index === 0}>
            <summary><span>{index + 1}</span><strong>{question.prompt}</strong>{typeof question.confidence === "number" ? <Badge tone={question.confidence >= .8 ? "green" : question.confidence >= .55 ? "orange" : "red"}>{Math.round(question.confidence * 100)}% confidence</Badge> : null}<Pencil size={14} /></summary>
            <div>
              {question.diagramAsset ? <figure className="question-diagram"><Image unoptimized width={640} height={480} src={`/api/question-banks/image/asset?extractionId=${encodeURIComponent(question.diagramAsset.extractionId)}&page=${question.diagramAsset.page}&x=${question.diagramAsset.x}&y=${question.diagramAsset.y}&width=${question.diagramAsset.width}&height=${question.diagramAsset.height}`} alt={question.diagramAsset.alt || `Question ${index + 1} diagram`} /><figcaption>Diagram retained from source page {question.diagramAsset.page}</figcaption></figure> : null}
              <label>Question<textarea value={question.prompt} onChange={(event) => editQuestion(question.id, { prompt: event.target.value })} /></label>
              <label>Source-backed answer<textarea value={question.expectedAnswer ?? ""} onChange={(event) => editQuestion(question.id, { expectedAnswer: event.target.value })} /></label>
              <label>Correction explanation<textarea value={question.explanation ?? ""} onChange={(event) => editQuestion(question.id, { explanation: event.target.value })} /></label>
              <div className="question-editor-options"><label>Answer type<select value={question.type} onChange={(event) => editQuestion(question.id, { type: event.target.value as QuestionType })}><option value="short_answer">Short answer</option><option value="long_answer">Long answer</option><option value="multiple_choice">Multiple choice</option><option value="multiple_select">Multiple select</option><option value="true_false">True or false</option><option value="fill_blank">Fill in the blank</option><option value="assertion_reason">Assertion–reason</option><option value="matching">Matching</option><option value="case_study">Case study</option><option value="passage">Passage-based</option><option value="calculation">Calculation</option><option value="diagram_labeling">Diagram labeling</option><option value="table">Table-based</option><option value="flashcard">Flashcard</option></select></label><label>Difficulty<select value={question.difficulty} onChange={(event) => editQuestion(question.id, { difficulty: Number(event.target.value) })}><option value=".3">Foundation</option><option value=".5">Standard</option><option value=".75">Challenging</option></select></label><Button className="button-quiet danger" disabled={bank.questions.length === 1} onClick={() => removeQuestion(question.id)}>Remove</Button></div>
              {["multiple_choice", "multiple_select", "matching"].includes(question.type) ? <label>Choices or pairs (one per line)<textarea value={(question.choices ?? []).join("\n")} onChange={(event) => editQuestion(question.id, { choices: event.target.value.split("\n").map((choice) => choice.trim()).filter(Boolean) })} /></label> : null}
              {question.answerKeyProvenance ? <p className="question-provenance"><ShieldCheck size={13} />Answer key: {formatLabel(question.answerKeyProvenance)}{question.sourceRegion ? ` · source page ${question.sourceRegion.page}` : ""}{question.reviewRequired ? " · review required" : ""}</p> : null}
            </div>
          </details>)}</div>
          <div className="modal-inline-actions"><Button className="button-secondary" onClick={() => setPhase("upload")}><ArrowLeft size={14} />Back</Button><LoadingButton className="button-primary" loading={busy} loadingLabel="Saving…" disabled={!bank.title.trim() || !bank.questions.length || bank.questions.some((question) => !question.prompt.trim() || !question.expectedAnswer?.trim())} onClick={() => void saveBank()}>{busy ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}Save questions</LoadingButton></div>
        </div> : null}

        {phase === "mode" && bank ? <div className="question-mode-step">
          <div><Badge tone="blue">{bank.questions.length} questions ready</Badge><h3>How do you want to practise?</h3><p>Your choice changes the answering experience, not the source-backed marking key.</p></div>
          <div className="question-mode-grid">{modes.map((item) => <button key={item.id} className={mode === item.id ? "active" : ""} onClick={() => setMode(item.id)}><strong>{item.label}</strong><small>{item.description}</small></button>)}</div>
          <div className="modal-inline-actions"><Button className="button-secondary" onClick={() => setPhase("edit")}><ArrowLeft size={14} />Edit questions</Button><Button className="button-primary" onClick={() => void startPractice()}><Play size={14} />Start practice</Button></div>
        </div> : null}

        {phase === "practice" && bank && currentQuestion ? <div className="question-practice-step">
          <div className="practice-meta"><button onClick={() => setPhase("mode")}><ArrowLeft size={14} />Modes</button><span>Question {currentIndex + 1} of {bank.questions.length}</span>{mode === "timed_practice" ? <Badge tone={timerSeconds < 60 ? "orange" : "neutral"}><Clock3 size={12} />{Math.floor(timerSeconds / 60)}:{String(timerSeconds % 60).padStart(2, "0")}</Badge> : <Badge tone="neutral">{formatLabel(mode)}</Badge>}</div>
          <div className="practice-progress"><i style={{ width: `${((currentIndex + 1) / bank.questions.length) * 100}%` }} /></div>
          <article className="practice-question"><span>Q{currentIndex + 1}</span>{currentQuestion.diagramAsset ? <Image unoptimized width={640} height={480} className="practice-diagram" src={`/api/question-banks/image/asset?extractionId=${encodeURIComponent(currentQuestion.diagramAsset.extractionId)}&page=${currentQuestion.diagramAsset.page}&x=${currentQuestion.diagramAsset.x}&y=${currentQuestion.diagramAsset.y}&width=${currentQuestion.diagramAsset.width}&height=${currentQuestion.diagramAsset.height}`} alt={currentQuestion.diagramAsset.alt || "Question diagram"} /> : null}<h3>{currentQuestion.prompt}</h3>{currentQuestion.sourceChunkIds.length ? <small>Grounded in {currentQuestion.sourceChunkIds.length} uploaded passage{currentQuestion.sourceChunkIds.length === 1 ? "" : "s"}</small> : null}</article>
          {["multiple_choice", "true_false"].includes(currentQuestion.type) && currentQuestion.choices?.length ? <div className="practice-choices">{currentQuestion.choices.map((choice) => <button key={choice} className={answer === choice ? "active" : ""} onClick={() => setAnswer(choice)}>{choice}</button>)}</div> : <label className="practice-answer">{mode === "oral_recall" ? "Say your answer aloud, then record the key points" : mode === "flashcards" ? "Recall before checking" : "Your answer"}<textarea autoFocus value={answer} onChange={(event) => setAnswer(event.target.value)} rows={mode === "long_answer" ? 7 : 4} placeholder={mode === "oral_recall" ? "Type the key points you said…" : "Answer naturally in your own words…"} /></label>}
          {!evaluation ? <div className="practice-controls"><label>How confident are you?<input type="range" min="0" max="1" step=".1" value={selfConfidence} onChange={(event) => setSelfConfidence(Number(event.target.value))} /><span>{Math.round(selfConfidence * 100)}%</span></label><label className="practice-hint"><input type="checkbox" checked={hintUsed} onChange={(event) => setHintUsed(event.target.checked)} />I used a hint or looked back</label><LoadingButton className="button-primary" loading={busy} loadingLabel="Checking against the source…" disabled={!answer.trim() || timerSeconds === 0} onClick={() => void gradeAnswer()}><ShieldCheck size={15} />Submit answer</LoadingButton></div> : <div className={`practice-evaluation ${evaluation.verdict}`}>
            {evaluation.verdict === "correct" ? <SuccessState title="Correct" body={evaluation.explanation} /> : evaluation.verdict === "incomplete" ? <ErrorState title="Partly there" body={evaluation.explanation} /> : <ErrorState title="Needs another pass" body={evaluation.explanation} />}
            {evaluation.correctPoints.length ? <div><strong>What you got right</strong><ul>{evaluation.correctPoints.map((point) => <li key={point}>{point}</li>)}</ul></div> : null}
            {evaluation.missingPoints.length ? <div><strong>What was missing</strong><ul>{evaluation.missingPoints.map((point) => <li key={point}>{point}</li>)}</ul></div> : null}
            <div className="improved-answer"><strong>Improved answer</strong><p>{evaluation.improvedAnswer || expectedAnswer}</p></div>
            <p className="grading-note"><ShieldCheck size={14} />{evaluation.verification.note}{evaluation.verification.uncertainty ? ` ${evaluation.verification.uncertainty}` : ""}</p>
            <Button className="button-primary" onClick={nextQuestion}>{currentIndex + 1 >= bank.questions.length ? "Finish review" : "Next question"}<ArrowRight size={14} /></Button>
          </div>}
          {timerSeconds === 0 && !evaluation ? <div className="inline-alert" role="alert"><Clock3 size={16} /><span>Time is up. Your draft is still here; switch modes to continue without the timer.</span></div> : null}
        </div> : null}

        {phase === "complete" && bank ? <div className="question-complete-step"><CheckCircle2 size={38} /><h3>Review complete</h3><p>Your answers, corrections, attempt score, and updated concept mastery are saved. One successful answer never marks a concept mastered by itself.</p><div><Button className="button-secondary" onClick={() => { setPhase("practice"); setCurrentIndex(0); setAttemptId(undefined); setEvaluation(undefined); setAnswer(""); }}><RotateCcw size={14} />Practise again</Button><Button className="button-primary" onClick={() => { setOpen(false); resetFlow(); }}>Back to Learn</Button></div></div> : null}
      </Modal>
    </section>
  );
}
