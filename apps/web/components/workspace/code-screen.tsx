"use client";

import type { AuthUser } from "@continuum/db";
import {
  AlertTriangle,
  BookOpenCheck,
  Braces,
  Check,
  CheckCircle2,
  Clipboard,
  Copy,
  Database,
  Download,
  FileCode2,
  FileUp,
  History,
  Keyboard,
  LoaderCircle,
  Laptop,
  Play,
  RotateCcw,
  Save,
  Sparkles,
  Square,
  TerminalSquare,
  WandSparkles,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Badge, Button, Modal } from "@/components/ui";
import { prewarmBrowserRuntime, startBrowserExecution, type ExecutionHandle } from "@/lib/browser-code-runner";
import {
  EDITOR_ONLY_LANGUAGES,
  LANGUAGE_RUNTIME_NOTES,
  normalizeRunnableLanguage,
  type ExecutionOutcome,
  type ExecutionResult,
  type ExecutionStatus,
  type ExecutionTest,
  type RunnableLanguage,
} from "@/lib/code-execution";
import { languageLabel } from "@/lib/labels";
import { resolveLocalOllamaConfiguration } from "@/lib/ollama-client";
import { buildAcademicPrompt } from "@/lib/prompt-context";
import { CODE_FILE_ACCEPT, downloadSource, validateCodeFile, validateCodeSourceText } from "@/lib/code-file";
import { CodeEditor } from "./code-editor";
import { PageIntro } from "./page-intro";
import { text, type WorkspaceState } from "./types";
import { useCodeSession } from "./use-code-session";

type Toast = (message: string | null) => void;
type Provider = "auto" | "ollama";
type Mode = "explain" | "debug" | "practice" | "review";
type OutputPanel = "output" | "coach";

const starters: Array<{ mode: Mode; label: string; prompt: string }> = [
  { mode: "explain", label: "Explain my code", prompt: "Explain this code in plain language, using the actual result when available." },
  { mode: "debug", label: "Find the error", prompt: "Use the actual runtime result to identify the cause, show the smallest correction, and tell me how to test it." },
  { mode: "review", label: "Improve my code", prompt: "Suggest focused improvements for correctness and clarity. Preserve the program's intended behaviour." },
  { mode: "review", label: "Add comments", prompt: "Add concise learning-focused comments without changing the program's behaviour." },
  { mode: "practice", label: "Suggest test cases", prompt: "Suggest useful test cases with inputs, expected outputs, and the edge case each test covers." },
];

const runnableLabels: Array<{ value: RunnableLanguage; label: string }> = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "sql", label: "SQL (SQLite)" },
];

const starterCode: Record<RunnableLanguage, string> = {
  python: `scores = [72, 88, 91, 64, 85]\ncutoff = int(input() or "80")\nselected = [score for score in scores if score >= cutoff]\nprint(f"Selected: {selected}")\nprint(f"Average: {sum(selected) / len(selected):.1f}")`,
  javascript: `const scores = [72, 88, 91, 64, 85];\nconst cutoff = Number(input() || 80);\nconst selected = scores.filter((score) => score >= cutoff);\nconsole.log(\`Selected: \${selected.join(", ")}\`);\nconsole.log(\`Count: \${selected.length}\`);`,
  typescript: `const scores: number[] = [72, 88, 91, 64, 85];\nconst cutoff: number = Number(input() || 80);\nconst selected = scores.filter((score) => score >= cutoff);\nconsole.log(\`Selected: \${selected.join(", ")}\`);\nconsole.log(\`Count: \${selected.length}\`);`,
  sql: `CREATE TABLE students (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  score INTEGER NOT NULL\n);\n\nINSERT INTO students (name, score) VALUES\n  ('Asha', 91), ('Kabir', 76), ('Meera', 88);\n\nSELECT name, score\nFROM students\nWHERE score >= 85\nORDER BY score DESC;`,
};

const starterInput: Record<RunnableLanguage, string> = { python: "80", javascript: "80", typescript: "80", sql: "" };
const starterTests: Record<RunnableLanguage, ExecutionTest[]> = {
  python: [{ id: "sample-cutoff", name: "cutoff 90", stdin: "90", expectedOutput: "Selected: [91]\nAverage: 91.0" }],
  javascript: [{ id: "sample-cutoff", name: "cutoff 90", stdin: "90", expectedOutput: "Selected: 91\nCount: 1" }],
  typescript: [{ id: "sample-cutoff", name: "cutoff 90", stdin: "90", expectedOutput: "Selected: 91\nCount: 1" }],
  sql: [{ id: "query-result", name: "high scorers", expectedOutput: "name | score\nAsha | 91\nMeera | 88" }],
};

function compactContext(state: WorkspaceState, user: AuthUser) {
  return {
    gradeAndCurriculum: user.educationLevel,
    subject: "Class 12 Computer Science",
    expectedAnswerStyle: "CBSE-aligned, concise first, worked explanation on request",
    activeGoals: state.goals.slice(0, 4).map((goal) => ({ title: text(goal, "title"), outcome: text(goal, "outcome") })),
    currentTasks: state.tasks.filter((task) => text(task, "status") !== "done").slice(0, 6).map((task) => text(task, "title")),
    learning: state.learningStates.slice(0, 4).map((item) => ({ concept: text(item, "conceptId"), status: text(item, "status"), explanation: text(item, "explanation") })),
  };
}

function runtimeForPrompt(result: ExecutionResult | undefined) {
  if (!result) return { status: "not_run" };
  return {
    outcome: result.outcome,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    tests: result.tests.map((test) => ({ name: test.name, passed: test.passed, actual: test.actualOutput, expected: test.expectedOutput })),
  };
}

async function streamOllama(input: { mode: Mode; language: string; topic: string; prompt: string; code: string; runtime: unknown; context: unknown; history: Array<{ role: "user" | "assistant"; content: string }> }, signal: AbortSignal, onText: (text: string) => void) {
  const config = await resolveLocalOllamaConfiguration();
  if (!config) throw new Error("Connect and test Ollama from Connections before selecting the local route.");
  const timeoutController = new AbortController();
  const timeout = window.setTimeout(() => timeoutController.abort(new Error("Local AI did not finish within 45 seconds. Try again with a shorter request or choose a smaller model in Connections.")), 45_000);
  const requestSignal = AbortSignal.any([signal, timeoutController.signal]);
  const academicPrompt = buildAcademicPrompt({
    surface: "code",
    taskClass: "code_reasoning",
    userRequest: `${input.mode.toUpperCase()}: ${input.prompt}`,
    subject: "Computer Science",
    topic: input.topic,
    relevantContext: input.context,
    sourceContent: { language: input.language, exactSourceCode: input.code },
    runtimeData: input.runtime,
    previousAttempts: input.history.map((message) => `${message.role === "user" ? "Learner" : "Coach"}: ${message.content}`).join("\n\n"),
    outputContract: "Teach from the actual runtime evidence. For debugging, give the smallest fix and a verification step; never invent output.",
  });
  try {
    const response = await fetch(new URL("/api/chat", config.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: requestSignal,
      body: JSON.stringify({
        model: config.model,
        stream: true,
        think: false,
        options: { temperature: 0.2, num_ctx: 8192, num_predict: 900, num_batch: 128 },
        messages: [
          { role: "system", content: academicPrompt.system },
          { role: "user", content: academicPrompt.prompt },
        ],
      }),
    });
    if (!response.ok || !response.body) throw new Error(`Ollama returned ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const payload = JSON.parse(line) as { message?: { content?: string }; error?: string };
        if (payload.error) throw new Error(payload.error);
        if (payload.message?.content) onText(payload.message.content);
      }
      if (done) break;
    }
  } finally {
    window.clearTimeout(timeout);
  }
}

function CoachMarkdown({ value }: { value: string }) {
  return <div className="coach-markdown" aria-live="polite"><ReactMarkdown skipHtml remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{ a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a> }}>{value}</ReactMarkdown></div>;
}

function outcomeLabel(outcome: ExecutionOutcome) {
  return ({ success: "Completed", compiler_error: "Compiler error", runtime_error: "Runtime error", timeout: "Timed out", stopped: "Stopped", provider_error: "Runtime unavailable" })[outcome];
}

function outcomeTone(outcome: ExecutionOutcome) {
  if (outcome === "success") return "green";
  if (["stopped", "timeout"].includes(outcome)) return "orange";
  return "red";
}

function statusLabel(status: ExecutionStatus) {
  return ({ preparing: "Preparing your program", loading_python: "Starting Python", loading_sql: "Starting SQL", ready: "Ready to run", running: "Running your code", testing: "Checking the tests", stopping: "Stopping your program" })[status];
}

export function CodeScreen({ state, user, showToast }: { state: WorkspaceState; user: AuthUser; showToast: Toast }) {
  const { session, update, pushAttempt, pushRuntimeAttempt, pushChatExchange, reset } = useCodeSession(user.id, {
    language: "python",
    goalId: text(state.goals[1] ?? state.goals[0], "id"),
    topic: "Python lists, filtering, and parameterised queries",
    prompt: starters[1]!.prompt,
    code: starterCode.python,
    stdin: starterInput.python,
    tests: starterTests.python,
    fileName: "main.py",
    timeoutMs: 5_000,
  });
  const { goalId, topic, language, mode, provider, prompt, code, stdin, tests, runtimeResult, runtimeHistory, conversation, fileName, timeoutMs } = session;
  const runnableLanguage = normalizeRunnableLanguage(language);

  const [live, setLive] = useState("");
  const [coachBusy, setCoachBusy] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState("");
  const [coachError, setCoachError] = useState("");
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<ExecutionStatus>("preparing");
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [checkpointBusy, setCheckpointBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [panel, setPanel] = useState<OutputPanel>("output");
  const [localFileOpen, setLocalFileOpen] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number; source: string; language: string; runnable: boolean }>();
  const [uploadError, setUploadError] = useState("");
  const coachAbortRef = useRef<AbortController | undefined>(undefined);
  const runRef = useRef<ExecutionHandle | undefined>(undefined);

  useEffect(() => {
    if (runnableLanguage) return prewarmBrowserRuntime(runnableLanguage);
    return undefined;
  }, [runnableLanguage]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void runCode(); }
      if (event.key === "Escape" && runtimeBusy) runRef.current?.stop();
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });

  function switchLanguage(next: string) {
    const nextRuntime = normalizeRunnableLanguage(next);
    const sourceIsStarter = !code.trim() || Object.values(starterCode).includes(code);
    update({
      language: next,
      ...(nextRuntime && sourceIsStarter ? { code: starterCode[nextRuntime], stdin: starterInput[nextRuntime], tests: starterTests[nextRuntime], runtimeResult: undefined } : {}),
      ...(nextRuntime ? { fileName: `main.${nextRuntime === "python" ? "py" : nextRuntime === "javascript" ? "js" : nextRuntime === "typescript" ? "ts" : "sql"}` } : {}),
    });
  }

  async function runCode(runTests = false, source = code) {
    if (runtimeBusy) return;
    if (!runnableLanguage) { showToast(`${languageLabel(language)} is editor-only until an isolated runtime is configured.`); return; }
    const request = { id: crypto.randomUUID(), language: runnableLanguage, source, stdin, timeoutMs, tests: runTests ? tests : [] };
    setRuntimeBusy(true);
    setRuntimeStatus("preparing");
    setPanel("output");
    const handle = startBrowserExecution(request, setRuntimeStatus);
    runRef.current = handle;
    const result = await handle.result;
    runRef.current = undefined;
    setRuntimeBusy(false);
    pushRuntimeAttempt({ source, stdin, result });
  }

  async function selectCodeFile(file: File | undefined) {
    setUploadError("");
    setUploadedFile(undefined);
    if (!file) return;
    const validation = validateCodeFile(file);
    if (!validation.ok) { setUploadError(validation.error); return; }
    try {
      const source = await file.text();
      const contentError = validateCodeSourceText(source);
      if (contentError) { setUploadError(contentError); return; }
      setUploadedFile({ name: validation.name, size: validation.size, source, language: validation.language, runnable: validation.runnable });
    } catch {
      setUploadError("Continuum could not read this file as plain text. Save it as UTF-8 and try again.");
    }
  }

  function useUploadedFile() {
    if (!uploadedFile) return;
    update({ language: uploadedFile.language, fileName: uploadedFile.name, code: uploadedFile.source, runtimeResult: undefined });
    setPanel("output");
    setLocalFileOpen(false);
    showToast(`${uploadedFile.name} is ready. Continuum has not run it.`);
  }

  async function runUploadedFile(checkSyntax = false) {
    if (!uploadedFile) return;
    const importedRuntime = normalizeRunnableLanguage(uploadedFile.language);
    if (!importedRuntime) return;
    update({ language: uploadedFile.language, fileName: uploadedFile.name, code: uploadedFile.source, runtimeResult: undefined });
    setLocalFileOpen(false);
    const source = checkSyntax && importedRuntime === "python"
      ? `compile(${JSON.stringify(uploadedFile.source)}, ${JSON.stringify(uploadedFile.name)}, "exec")\nprint("Syntax check passed")`
      : uploadedFile.source;
    const request = { id: crypto.randomUUID(), language: importedRuntime, source, stdin, timeoutMs, tests: [] };
    setRuntimeBusy(true);
    setRuntimeStatus("preparing");
    setPanel("output");
    const handle = startBrowserExecution(request, setRuntimeStatus);
    runRef.current = handle;
    const result = await handle.result;
    runRef.current = undefined;
    setRuntimeBusy(false);
    pushRuntimeAttempt({ source: uploadedFile.source, stdin, result });
  }

  async function submitForFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (coachBusy) return;
    const controller = new AbortController();
    coachAbortRef.current = controller;
    setCoachBusy(true);
    setCoachError("");
    setLive("");
    setPendingPrompt(prompt);
    setPanel("coach");
    let finalAnswer = "";
    const capture = (part: string) => { finalAnswer += part; setLive((current) => current + part); };
    try {
      const runtime = runtimeForPrompt(runtimeResult);
      const history = conversation.slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 4_000) }));
      const feedbackCode = code.slice(0, 20_000);
      const feedbackPrompt = code.length > 20_000
        ? `${prompt.slice(0, 7_800)}\n\nContinuum supplied only the first 20,000 characters of this larger file. State that scope and do not infer unseen code.`
        : prompt;
      if (provider === "ollama") {
        await streamOllama({ mode: mode as Mode, language, topic, prompt: feedbackPrompt, code: feedbackCode, runtime, context: compactContext(state, user), history }, controller.signal, capture);
      } else {
        const response = await fetch("/api/code", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ mode, language, topic, prompt: feedbackPrompt, code: feedbackCode, runtime, goalId: goalId || undefined, provider, history }),
        });
        if (!response.ok || !response.body) {
          const body = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? "The code coach is unavailable");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (value) capture(decoder.decode(value, { stream: !done }));
          if (done) break;
        }
      }
      if (finalAnswer.trim()) {
        pushChatExchange({ mode, prompt, answer: finalAnswer });
        pushAttempt({ mode, language, topic, prompt, code, answer: finalAnswer });
        update({ prompt: "" });
      }
    } catch (cause) {
      if ((cause as { name?: string }).name !== "AbortError") setCoachError(cause instanceof Error ? cause.message : "The code coach stopped unexpectedly");
    } finally {
      coachAbortRef.current = undefined;
      setCoachBusy(false);
      setPendingPrompt("");
    }
  }

  async function saveCheckpoint(checkpointForm: HTMLFormElement) {
    const form = new FormData(checkpointForm);
    setCheckpointBusy(true);
    try {
      const response = await fetch("/api/code/checkpoint", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic, goalId: goalId || undefined, learned: String(form.get("learned")), nextAction: String(form.get("nextAction")) }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Checkpoint could not be saved");
      setCheckpointOpen(false);
      showToast("Coding checkpoint saved to your academic memory.");
    } catch (cause) { showToast(cause instanceof Error ? cause.message : "Checkpoint could not be saved"); }
    finally { setCheckpointBusy(false); }
  }

  async function copyCode() {
    try { await navigator.clipboard.writeText(code); showToast("Source code copied."); }
    catch { showToast("Copy failed. Select the source manually."); }
  }

  function restoreRun(runId: string) {
    const run = runtimeHistory.find((item) => item.id === runId);
    if (!run) return;
    update({ code: run.source, stdin: run.stdin, language: run.result.language, runtimeResult: run.result });
    setPanel("output");
    showToast("Restored the source and output from that run.");
  }

  return (
    <div className="screen code-screen premium-screen">
      <PageIntro eyebrow="CODE" title="Write it. Run it. Understand why it works." description="Run code directly, see the exact result, then continue a saved conversation when you want help." />

      <div className="studio-toolbar" aria-label="Code workspace controls">
        <label className="studio-file-name"><FileCode2 size={18} /><span className="sr-only">File name</span><input aria-label="File name" value={fileName} maxLength={90} onChange={(event) => update({ fileName: event.target.value })} /></label>
        <label className="studio-language"><span>Language</span><select value={language.toLowerCase()} onChange={(event) => switchLanguage(event.target.value)}><optgroup label="Ready to run">{runnableLabels.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup><optgroup label="Writing only">{EDITOR_ONLY_LANGUAGES.map((option) => <option key={option} value={option.toLowerCase()}>{option}</option>)}</optgroup></select></label>
        <span className="studio-save-status"><Save size={14} />Saved on this device</span>
        <div className="studio-toolbar-actions">
          <Button className="button-secondary" type="button" onClick={() => setLocalFileOpen(true)}><Laptop size={15} />Import file</Button>
          <Button className="button-secondary sample-check-action" type="button" disabled={!runnableLanguage || !tests.length || runtimeBusy} onClick={() => void runCode(true)}><CheckCircle2 size={14} />Check sample</Button>
          <Button className="button-secondary" type="button" onClick={() => setPanel("coach")}><Sparkles size={15} />AI help</Button>
          {runtimeBusy ? <Button className="button-secondary" type="button" onClick={() => runRef.current?.stop()}><Square size={14} />Stop</Button> : <Button className="button-primary" type="button" disabled={!runnableLanguage || !code.trim()} onClick={() => void runCode()}><Play size={15} />Run <kbd>⌘↵</kbd></Button>}
        </div>
      </div>
      <div className="program-runbar">
        <label><span>Program input</span><textarea value={stdin} onChange={(event) => update({ stdin: event.target.value })} placeholder="Put each response on a new line" /><small>Enter values your program expects through input(). Put each response on a new line.</small></label>
        <p><CheckCircle2 size={14} />Running the program happens on this device. Feedback is requested separately and never starts automatically.</p>
      </div>

      <details className="code-advanced-settings">
        <summary>Advanced settings</summary>
        <div>
          <label>Maximum run time<select value={timeoutMs} onChange={(event) => update({ timeoutMs: Number(event.target.value) })}><option value={5000}>Standard — 5 seconds</option><option value={10000}>Extended — 10 seconds</option><option value={30000}>Long run — 30 seconds</option></select></label>
          <p>This timer starts after the language setup is ready. A timed-out program is terminated; your editor content is preserved.</p>
          <details className="environment-details"><summary>Environment details</summary><div className="runtime-note"><Database size={16} /><div><strong>{runnableLanguage ? `${languageLabel(runnableLanguage)} runs locally` : "Writing only"}</strong><span>{runnableLanguage ? LANGUAGE_RUNTIME_NOTES[runnableLanguage] : "You can write and request feedback, but this language cannot run here yet."}</span></div></div></details>
        </div>
      </details>

      {confirmReset ? <div className="confirm-inline" role="alertdialog" aria-label="Reset coding session"><span>Clear the current source, input, results, feedback, and history? This cannot be undone.</span><div><button type="button" className="ghost-action" onClick={() => setConfirmReset(false)}>Keep working</button><Button className="button-secondary" onClick={() => { reset(); setLive(""); setCoachError(""); setConfirmReset(false); showToast("Started a fresh coding session."); }}>Reset session</Button></div></div> : null}

      <details className="code-task-brief">
        <summary><BookOpenCheck size={17} /><span><strong>Task guidance</strong><small>Filter records safely · optional</small></span></summary>
        <div className="code-task-grid">
          <section><h2>Task</h2><p>Use a threshold to select scores, then print the selected values and their summary.</p></section>
          <section><h2>Example</h2><code>Input 90 → Selected: [91]</code></section>
          <section><h2>What success looks like</h2><p>Your program runs without an error and the sample test passes.</p></section>
          <section><h2>Hint</h2><p>Filter the list first. Calculate the result from the filtered list, not the original one.</p></section>
          <dl><div><dt>You will practise</dt><dd>Lists, conditions, input, and query results</dd></div><div><dt>To complete this</dt><dd>Show correct output and pass one sample test</dd></div><div><dt>Connected goal</dt><dd>{text(state.goals[1] ?? state.goals[0], "title", "Class 12 Computer Science")}</dd></div></dl>
          <button type="button" className="ghost-action reset-link" onClick={() => setConfirmReset(true)}><RotateCcw size={14} />Reset workspace</button>
        </div>
      </details>

      <div className="code-studio">
        <section className="editor-pane" aria-label="Source editor">
          <header><div><span className="file-dot" />{fileName}</div><span><button className="editor-copy" type="button" onClick={() => downloadSource(fileName, code, runnableLanguage === "python" ? "py" : runnableLanguage === "javascript" ? "js" : runnableLanguage === "typescript" ? "ts" : runnableLanguage ?? "txt")}><Download size={13} />Download</button><button className="editor-copy" type="button" onClick={() => void copyCode()}><Copy size={13} />Copy</button><Keyboard size={14} />Tab indents · ⌘Z undo</span></header>
          <CodeEditor value={code} language={language} onChange={(next) => update({ code: next })} placeholder={`Write ${languageLabel(language)} here`} minHeight={300} ariaLabel={`${languageLabel(language)} source editor`} />
        </section>

        <section className="execution-pane" aria-label="Execution and feedback">
          <div className="output-tabs" role="tablist" aria-label="Execution panels">
            <button type="button" role="tab" aria-selected={panel === "output"} className={panel === "output" ? "active" : ""} onClick={() => setPanel("output")}><TerminalSquare size={15} />Output</button>
            <button type="button" role="tab" aria-selected={panel === "coach"} className={panel === "coach" ? "active" : ""} onClick={() => setPanel("coach")}><Sparkles size={15} />AI tutor{conversation.length ? <small>{Math.ceil(conversation.length / 2)}</small> : null}</button>
          </div>

          <div className="output-body">
            {runtimeBusy ? <div className="runtime-loading" role="status"><LoaderCircle className="spin" size={23} /><strong>{statusLabel(runtimeStatus)}</strong><span>Output and tests will appear here as soon as the run finishes.</span></div> : null}

            {!runtimeBusy && panel === "output" ? <><RuntimeOutput result={runtimeResult} onFeedback={() => setPanel("coach")} />{runtimeHistory.length ? <details className="run-history-details"><summary><History size={14} />Previous runs ({runtimeHistory.length})</summary><div className="run-history">{runtimeHistory.map((run) => <button type="button" key={run.id} onClick={() => restoreRun(run.id)}><span className={`run-mark ${run.result.outcome}`} /><span><strong>{outcomeLabel(run.result.outcome)}</strong><small>{new Date(run.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {run.result.durationMs} ms</small></span><RotateCcw size={14} /></button>)}</div></details> : null}</> : null}
            {!runtimeBusy && panel === "coach" ? <form className="feedback-panel" onSubmit={submitForFeedback}>
              <div className="ai-boundary"><WandSparkles size={17} /><div><strong>Get feedback only when you ask</strong><span>{runtimeResult ? "Continuum will use your code and this run’s exact result." : "Run first so feedback can use real output instead of guessing."}</span></div></div>
              <div className="coach-actions" aria-label="Choose a kind of help">
                <div><span>Understand</span>{starters.filter((starter) => ["explain"].includes(starter.mode) || starter.label === "Add comments").map((starter) => <button key={starter.label} type="button" onClick={() => update({ mode: starter.mode, prompt: starter.prompt })}>{starter.label}</button>)}</div>
                <div><span>Fix & review</span>{starters.filter((starter) => starter.mode === "debug" || starter.label === "Improve my code").map((starter) => <button key={starter.label} type="button" onClick={() => update({ mode: starter.mode, prompt: starter.prompt })}>{starter.label}</button>)}</div>
                <div><span>Check</span>{starters.filter((starter) => starter.mode === "practice").map((starter) => <button key={starter.label} type="button" onClick={() => update({ mode: starter.mode, prompt: starter.prompt })}>{starter.label}</button>)}</div>
              </div>
              <CodeConversation messages={conversation} live={live} pendingPrompt={pendingPrompt} busy={coachBusy} />
              <label>Continue the conversation<textarea value={prompt} onChange={(event) => update({ prompt: event.target.value })} minLength={2} maxLength={8000} required placeholder={conversation.length ? "Ask a follow-up about this code or the last answer…" : "Ask about your code…"} /></label>
              {code.length > 20_000 ? <p className="feedback-file-note">This file is open in full, but AI help uses only the first 20,000 characters per request. Narrow the file or select the relevant section for a precise answer.</p> : null}
              <div className="feedback-actions"><label>Feedback source<select value={provider} onChange={(event) => update({ provider: event.target.value as Provider })}><option value="auto">Continuum</option><option value="ollama">Ollama on this device</option></select></label>{coachBusy ? <Button type="button" className="button-secondary" onClick={() => coachAbortRef.current?.abort()}><Square size={14} />Stop</Button> : <Button className="button-primary" disabled={!topic.trim() || !prompt.trim()}><Sparkles size={15} />Get feedback</Button>}</div>
              {coachError ? <div className="code-error" role="alert"><strong>Feedback unavailable</strong><span>{coachError}</span><small>Your source and deterministic output are unchanged.</small></div> : null}
              {conversation.length ? <footer><button type="button" className="icon-text-button" onClick={() => void navigator.clipboard.writeText(conversation.at(-1)?.content ?? "")}><Clipboard size={15} />Copy latest answer</button><Button type="button" className="button-secondary" onClick={() => setCheckpointOpen((open) => !open)}><Save size={15} />Save checkpoint</Button></footer> : !coachError && !coachBusy ? <div className="coach-empty compact"><Braces size={24} /><h2>Run, then ask.</h2><p>Your conversation stays here when you change sections or refresh.</p></div> : null}
              {checkpointOpen ? <div className="checkpoint-form"><label>What did you learn?<textarea name="learned" required minLength={2} maxLength={2000} /></label><label>What will you do next?<input name="nextAction" required minLength={2} maxLength={500} /></label><Button type="button" className="button-primary" disabled={checkpointBusy} onClick={(event) => { const form = event.currentTarget.form; if (form) void saveCheckpoint(form); }}><Check size={15} />{checkpointBusy ? "Saving…" : "Save to memory"}</Button></div> : null}
            </form> : null}
          </div>
        </section>
      </div>
      <Modal
        open={localFileOpen}
        onOpenChange={setLocalFileOpen}
        title="Import a code file from your computer"
        description="Open source code in the editor first. Continuum never runs an imported file or sends it to AI without a separate action."
        dirty={Boolean(uploadedFile)}
        dirtyMessage="Close this window? The selected file has not been added to the editor."
        footer={<><Button className="button-secondary" type="button" onClick={() => setLocalFileOpen(false)}>Cancel</Button>{uploadedFile ? <Button className="button-primary" type="button" onClick={useUploadedFile}>View code in editor</Button> : null}</>}
      >
        <div className="python-file-flow">
          <section>
            <h3>Use a file here</h3>
            <label className="file-drop"><FileUp size={22} /><span><strong>Choose a code file</strong><small>Python, JavaScript, TypeScript, SQL, Java, C, C++, or Rust · up to 1 MB</small></span><input type="file" accept={CODE_FILE_ACCEPT} onChange={(event) => void selectCodeFile(event.target.files?.[0])} /></label>
            {uploadError ? <p className="inline-error" role="alert">{uploadError}</p> : null}
            {uploadedFile ? <div className="selected-python-file"><FileCode2 size={19} /><div><strong>{uploadedFile.name}</strong><span>{Math.max(1, Math.round(uploadedFile.size / 1024))} KB · {languageLabel(uploadedFile.language)}</span></div><div>{uploadedFile.language === "python" ? <Button className="button-secondary" type="button" onClick={() => void runUploadedFile(true)}>Check syntax</Button> : null}{uploadedFile.runnable && uploadedFile.source.length <= 200_000 ? <Button className="button-primary" type="button" onClick={() => void runUploadedFile(false)}>Run safely</Button> : null}</div></div> : null}
            {uploadedFile && !uploadedFile.runnable ? <p className="privacy-note">This language can be viewed, edited, downloaded, and discussed with AI. A safe local runtime is not available in Continuum yet, so no Run button is shown.</p> : null}
            {uploadedFile && uploadedFile.runnable && uploadedFile.source.length > 200_000 ? <p className="privacy-note">This file can be edited here, but it is too large for the browser runner. Trim it below 200,000 characters before running.</p> : null}
          </section>
          {language === "python" ? <section>
            <h3>Open your current code in Python IDLE</h3>
            <ol><li>Download the Python file.</li><li>Open IDLE on your computer.</li><li>Select File → Open and choose the downloaded file.</li><li>Select Run → Run Module.</li><li>Return here and paste an error or upload the edited file if you want help.</li></ol>
            <Button className="button-secondary" type="button" onClick={() => downloadSource(fileName, code, "py")}><Download size={15} />Download {fileName || "Python file"}</Button>
          </section> : null}
          <p className="privacy-note">The 1 MB editor limit prevents very large files from freezing this browser tab. Imported text stays in this browser and is sent to the AI only when you explicitly request help.</p>
        </div>
      </Modal>
    </div>
  );
}

function CodeConversation({ messages, live, pendingPrompt, busy }: { messages: Array<{ id: string; role: "user" | "assistant"; content: string }>; live: string; pendingPrompt: string; busy: boolean }) {
  if (!messages.length && !busy) return null;
  return <div className="code-conversation" aria-label="Saved AI tutor conversation" aria-live="polite">
    {messages.map((message) => <article key={message.id} className={`code-message ${message.role}`}>
      <strong>{message.role === "user" ? "You" : "Continuum"}</strong>
      {message.role === "assistant" ? <CoachMarkdown value={message.content} /> : <p>{message.content}</p>}
    </article>)}
    {busy && pendingPrompt ? <article className="code-message user current"><strong>You</strong><p>{pendingPrompt}</p></article> : null}
    {busy ? <article className="code-message assistant current"><strong>Continuum</strong>{live ? <CoachMarkdown value={live} /> : <p><LoaderCircle className="spin" size={15} /> Reading this version of your code…</p>}</article> : null}
  </div>;
}

function RuntimeOutput({ result, onFeedback }: { result: ExecutionResult | undefined; onFeedback: () => void }) {
  if (!result) return <div className="runtime-empty"><TerminalSquare size={28} /><h2>Your output will appear here.</h2><p>Enter any program input above, then use the single Run button in the top bar.</p></div>;
  const passed = result.tests.filter((test) => test.passed).length;
  const guidance = result.outcome === "success"
    ? result.tests.length && passed === result.tests.length
      ? `Your program ran and passed ${passed} of ${result.tests.length} tests.`
      : result.tests.length
        ? `Your program ran, but ${result.tests.length - passed} test${result.tests.length - passed === 1 ? "" : "s"} still need attention.`
        : "Your program ran successfully. Check the output against the task."
    : result.outcome === "compiler_error"
      ? "The code could not be translated into a runnable program. Start with the first error below."
      : result.outcome === "runtime_error"
        ? "The program started, then stopped at an error. The message below identifies the failure."
        : result.outcome === "timeout"
          ? `The program exceeded its ${Math.round((result.timeoutMs ?? result.durationMs) / 1000)}-second run limit and was terminated. Check for a loop that never finishes, or choose a longer limit in Advanced settings.`
          : result.outcome === "stopped"
            ? "The run was stopped before it finished."
            : "The local runner is temporarily unavailable. Your code is still saved.";
  return <div className="runtime-result"><header><Badge tone={outcomeTone(result.outcome)}>{outcomeLabel(result.outcome)}</Badge><span>{result.executionDurationMs ?? result.durationMs} ms · exit code {result.exitCode ?? "—"}{result.terminated ? " · terminated" : ""}</span></header><div className={`runtime-guidance ${result.outcome === "success" ? "success" : "error"}`}>{result.outcome === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}<div><strong>{result.outcome === "success" ? "Run complete" : result.outcome === "stopped" ? "Program stopped" : "The program needs a change"}</strong><span>{guidance}</span></div></div>{result.stdout ? <section><h3>Output</h3><pre>{result.stdout}</pre></section> : null}{result.tables?.length ? result.tables.map((table, index) => <section className="sql-result" key={`${index}-${table.columns.join("-")}`}><h3>Result table {index + 1}</h3><div><table><thead><tr>{table.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell === null ? <em>NULL</em> : String(cell)}</td>)}</tr>)}</tbody></table></div></section>) : null}{typeof result.rowsModified === "number" ? <p className="rows-modified">{result.rowsModified} row{result.rowsModified === 1 ? "" : "s"} changed during the run.</p> : null}{result.stderr ? <section className="runtime-stderr"><h3>Errors</h3><pre>{result.stderr}</pre></section> : null}{!result.stdout && !result.stderr && !result.tables?.length && result.outcome === "success" ? <div className="quiet-success"><CheckCircle2 size={19} /><span>Completed without printable output.</span></div> : null}<details className="runtime-technical-details"><summary>Technical details</summary><dl><div><dt>Status</dt><dd>{outcomeLabel(result.outcome)}</dd></div><div><dt>Exit code</dt><dd>{result.exitCode ?? "Not available"}</dd></div><div><dt>Language setup</dt><dd>{result.startupDurationMs ?? 0} ms</dd></div><div><dt>Execution</dt><dd>{result.executionDurationMs ?? result.durationMs} ms</dd></div><div><dt>Limit</dt><dd>{result.timeoutMs ? `${result.timeoutMs / 1000} seconds` : "Not recorded"}</dd></div><div><dt>Terminated</dt><dd>{result.terminated ? "Yes" : "No"}</dd></div></dl>{result.technicalStderr ? <div className="runtime-raw-error"><strong>Raw runtime diagnostic</strong><pre>{result.technicalStderr}</pre></div> : null}</details><div className="runtime-next-action"><Button className="button-secondary" type="button" onClick={onFeedback}><Sparkles size={14} />{result.outcome === "success" ? "Get feedback" : "Get help with this error"}</Button></div></div>;
}
