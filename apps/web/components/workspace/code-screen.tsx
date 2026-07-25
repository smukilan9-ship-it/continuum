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
  FileCode2,
  History,
  Keyboard,
  LoaderCircle,
  Play,
  RotateCcw,
  Save,
  Sparkles,
  Square,
  TerminalSquare,
  TestTube2,
  WandSparkles,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Badge, Button } from "@/components/ui";
import { startBrowserExecution, type ExecutionHandle } from "@/lib/browser-code-runner";
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
import { localOllamaConfiguration } from "@/lib/ollama-client";
import { buildAcademicPrompt } from "@/lib/prompt-context";
import { CodeEditor } from "./code-editor";
import { PageIntro } from "./page-intro";
import { text, type WorkspaceState } from "./types";
import { useCodeSession } from "./use-code-session";

type Toast = (message: string | null) => void;
type Provider = "auto" | "ollama";
type Mode = "explain" | "debug" | "practice" | "review";
type OutputPanel = "output" | "tests" | "coach";

const starters: Array<{ mode: Mode; label: string; prompt: string }> = [
  { mode: "explain", label: "Explain", prompt: "Explain the result from first principles, then give me one short check for understanding." },
  { mode: "debug", label: "Debug", prompt: "Use the actual runtime result to identify the cause, show the smallest correction, and tell me how to test it." },
  { mode: "practice", label: "Similar problem", prompt: "Generate one syllabus-aligned variation with a success criterion and progressive hints before the solution." },
  { mode: "review", label: "Review", prompt: "Review this attempt for correctness, clarity, and the concepts I should understand—not just style." },
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

async function streamOllama(input: { mode: Mode; language: string; topic: string; prompt: string; code: string; runtime: unknown; context: unknown }, signal: AbortSignal, onText: (text: string) => void) {
  const config = localOllamaConfiguration();
  if (!config) throw new Error("Connect and test Ollama from Connections before selecting the local route.");
  const academicPrompt = buildAcademicPrompt({
    surface: "code",
    taskClass: "code_reasoning",
    userRequest: `${input.mode.toUpperCase()}: ${input.prompt}`,
    subject: "Computer Science",
    topic: input.topic,
    relevantContext: input.context,
    sourceContent: { language: input.language, exactSourceCode: input.code },
    runtimeData: input.runtime,
    outputContract: "Teach from the actual runtime evidence. For debugging, give the smallest fix and a verification step; never invent output.",
  });
  const response = await fetch(new URL("/api/chat", config.baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      model: config.model,
      stream: true,
      options: { temperature: 0.2, num_predict: 1800 },
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
  return ({ preparing: "Preparing your program", loading_python: "Starting Python", loading_sql: "Starting SQL", running: "Running your code", testing: "Checking the tests" })[status];
}

export function CodeScreen({ state, user, showToast }: { state: WorkspaceState; user: AuthUser; showToast: Toast }) {
  const { session, update, pushAttempt, pushRuntimeAttempt, reset } = useCodeSession(user.id, {
    language: "python",
    goalId: text(state.goals[1] ?? state.goals[0], "id"),
    topic: "Python lists, filtering, and parameterised queries",
    prompt: starters[1]!.prompt,
    code: starterCode.python,
    stdin: starterInput.python,
    tests: starterTests.python,
  });
  const { goalId, topic, language, mode, provider, prompt, code, stdin, tests, runtimeResult, runtimeHistory, answer } = session;
  const runnableLanguage = normalizeRunnableLanguage(language);

  const [live, setLive] = useState("");
  const [coachBusy, setCoachBusy] = useState(false);
  const [coachError, setCoachError] = useState("");
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<ExecutionStatus>("preparing");
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [checkpointBusy, setCheckpointBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [panel, setPanel] = useState<OutputPanel>("output");
  const coachAbortRef = useRef<AbortController | undefined>(undefined);
  const runRef = useRef<ExecutionHandle | undefined>(undefined);
  const shownAnswer = coachBusy ? live : answer;

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
    });
  }

  async function runCode() {
    if (runtimeBusy) return;
    if (!runnableLanguage) { showToast(`${languageLabel(language)} is editor-only until an isolated runtime is configured.`); return; }
    const request = { id: crypto.randomUUID(), language: runnableLanguage, source: code, stdin, timeoutMs: runnableLanguage === "python" ? 12_000 : 5_000, tests };
    setRuntimeBusy(true);
    setRuntimeStatus("preparing");
    setPanel("output");
    const handle = startBrowserExecution(request, setRuntimeStatus);
    runRef.current = handle;
    const result = await handle.result;
    runRef.current = undefined;
    setRuntimeBusy(false);
    pushRuntimeAttempt({ source: code, stdin, result });
    if (result.outcome === "success" && result.tests.length) setPanel("tests");
  }

  async function submitForFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (coachBusy) return;
    const controller = new AbortController();
    coachAbortRef.current = controller;
    setCoachBusy(true);
    setCoachError("");
    setLive("");
    setPanel("coach");
    let finalAnswer = "";
    const capture = (part: string) => { finalAnswer += part; setLive((current) => current + part); };
    try {
      const runtime = runtimeForPrompt(runtimeResult);
      if (provider === "ollama") {
        await streamOllama({ mode: mode as Mode, language, topic, prompt, code, runtime, context: compactContext(state, user) }, controller.signal, capture);
      } else {
        const response = await fetch("/api/code", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ mode, language, topic, prompt, code, runtime, goalId: goalId || undefined, provider }),
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
      if (finalAnswer.trim()) { update({ answer: finalAnswer }); pushAttempt({ mode, language, topic, prompt, code, answer: finalAnswer }); }
    } catch (cause) {
      if ((cause as { name?: string }).name !== "AbortError") setCoachError(cause instanceof Error ? cause.message : "The code coach stopped unexpectedly");
    } finally {
      coachAbortRef.current = undefined;
      setCoachBusy(false);
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
      <PageIntro eyebrow="CODE" title="Write it. Run it. Understand why it works." description="Your task, editor, output, tests, and optional feedback are together in one workspace." />

      <div className="studio-toolbar" aria-label="Code workspace controls">
        <div className="studio-file"><FileCode2 size={18} /><div><strong>Filter records safely</strong><span>Class 12 Computer Science</span></div></div>
        <label className="studio-language"><span>Language</span><select value={language.toLowerCase()} onChange={(event) => switchLanguage(event.target.value)}><optgroup label="Ready to run">{runnableLabels.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup><optgroup label="Writing only">{EDITOR_ONLY_LANGUAGES.map((option) => <option key={option} value={option.toLowerCase()}>{option}</option>)}</optgroup></select></label>
        <span className="studio-save-status"><Save size={14} />Saved on this device</span>
        <div className="studio-toolbar-actions">
          <Button className="button-secondary" type="button" onClick={() => setPanel("coach")}><Sparkles size={15} />Ask for help</Button>
          {runtimeBusy ? <Button className="button-secondary" type="button" onClick={() => runRef.current?.stop()}><Square size={14} />Stop</Button> : <Button className="button-primary" type="button" disabled={!runnableLanguage || !code.trim()} onClick={() => void runCode()}><Play size={15} />Run <kbd>⌘↵</kbd></Button>}
        </div>
      </div>
      <div className="program-runbar">
        <label><span>Program input</span><textarea value={stdin} onChange={(event) => update({ stdin: event.target.value })} placeholder="Enter any input your program should read" /></label>
        <p><CheckCircle2 size={14} />Running the program happens on this device. Feedback is requested separately and never starts automatically.</p>
      </div>

      {confirmReset ? <div className="confirm-inline" role="alertdialog" aria-label="Reset coding session"><span>Clear the current source, input, results, feedback, and history? This cannot be undone.</span><div><button type="button" className="ghost-action" onClick={() => setConfirmReset(false)}>Keep working</button><Button className="button-secondary" onClick={() => { reset(); setLive(""); setCoachError(""); setConfirmReset(false); showToast("Started a fresh coding session."); }}>Reset session</Button></div></div> : null}

      <div className="code-studio">
        <aside className="lesson-rail" aria-label="Task instructions">
          <div className="lesson-rail-heading"><BookOpenCheck size={18} /><div><span>TASK</span><strong>Filter records safely</strong></div></div>
          <section><h2>What to build</h2><p>Use a threshold to select scores, then print the selected values and their summary.</p></section>
          <section><h2>Example</h2><code>Input 90 → Selected: [91]</code></section>
          <section><h2>What success looks like</h2><p>Your program runs without an error and the sample test passes.</p></section>
          <details className="code-hint"><summary>Hint</summary><p>Filter the list first. Calculate the result from the filtered list, not the original one.</p></details>
          <dl><div><dt>You will practise</dt><dd>Lists, conditions, input, and query results</dd></div><div><dt>To complete this</dt><dd>Show correct output and pass one sample test</dd></div><div><dt>Connected goal</dt><dd>{text(state.goals[1] ?? state.goals[0], "title", "Class 12 Computer Science")}</dd></div></dl>
          <details className="environment-details"><summary>Environment details</summary><div className="runtime-note"><Database size={16} /><div><strong>{runnableLanguage ? `${languageLabel(runnableLanguage)} runs locally` : "Writing only"}</strong><span>{runnableLanguage ? LANGUAGE_RUNTIME_NOTES[runnableLanguage] : "You can write and request feedback, but this language cannot run here yet."}</span></div></div></details>
          <button type="button" className="ghost-action reset-link" onClick={() => setConfirmReset(true)}><RotateCcw size={14} />Reset workspace</button>
        </aside>

        <section className="editor-pane" aria-label="Source editor">
          <header><div><span className="file-dot" />main.{runnableLanguage === "python" ? "py" : runnableLanguage === "typescript" ? "ts" : runnableLanguage === "javascript" ? "js" : runnableLanguage === "sql" ? "sql" : "txt"}</div><span><button className="editor-copy" type="button" onClick={() => void copyCode()}><Copy size={13} />Copy</button><Keyboard size={14} />Tab indents · ⌘Z undo</span></header>
          <CodeEditor value={code} language={language} onChange={(next) => update({ code: next })} placeholder={`Write ${languageLabel(language)} here`} minHeight={440} ariaLabel={`${languageLabel(language)} source editor`} />
        </section>

        <section className="execution-pane" aria-label="Execution and feedback">
          <div className="output-tabs" role="tablist" aria-label="Execution panels">
            <button type="button" role="tab" aria-selected={panel === "output"} className={panel === "output" ? "active" : ""} onClick={() => setPanel("output")}><TerminalSquare size={15} />Output</button>
            <button type="button" role="tab" aria-selected={panel === "tests"} className={panel === "tests" ? "active" : ""} onClick={() => setPanel("tests")}><TestTube2 size={15} />Tests{runtimeResult?.tests.length ? <small>{runtimeResult.tests.filter((test) => test.passed).length}/{runtimeResult.tests.length}</small> : null}</button>
            <button type="button" role="tab" aria-selected={panel === "coach"} className={panel === "coach" ? "active" : ""} onClick={() => setPanel("coach")}><Sparkles size={15} />Feedback</button>
          </div>

          <div className="output-body">
            {runtimeBusy ? <div className="runtime-loading" role="status"><LoaderCircle className="spin" size={23} /><strong>{statusLabel(runtimeStatus)}</strong><span>Output and tests will appear here as soon as the run finishes.</span></div> : null}

            {!runtimeBusy && panel === "output" ? <><RuntimeOutput result={runtimeResult} onFeedback={() => setPanel("coach")} />{runtimeHistory.length ? <details className="run-history-details"><summary><History size={14} />Previous runs ({runtimeHistory.length})</summary><div className="run-history">{runtimeHistory.map((run) => <button type="button" key={run.id} onClick={() => restoreRun(run.id)}><span className={`run-mark ${run.result.outcome}`} /><span><strong>{outcomeLabel(run.result.outcome)}</strong><small>{new Date(run.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {run.result.durationMs} ms</small></span><RotateCcw size={14} /></button>)}</div></details> : null}</> : null}
            {!runtimeBusy && panel === "tests" ? <TestsPanel tests={tests} result={runtimeResult} onChange={(next) => update({ tests: next })} /> : null}
            {!runtimeBusy && panel === "coach" ? <form className="feedback-panel" onSubmit={submitForFeedback}>
              <div className="ai-boundary"><WandSparkles size={17} /><div><strong>Get feedback only when you ask</strong><span>{runtimeResult ? "Continuum will use your code and this run’s exact result." : "Run first so feedback can use real output instead of guessing."}</span></div></div>
              <div className="mode-tabs compact" aria-label="Feedback mode">{starters.map((starter) => <button key={starter.mode} type="button" className={mode === starter.mode ? "active" : ""} onClick={() => update({ mode: starter.mode, prompt: starter.prompt })}>{starter.label}</button>)}</div>
              <label>What would you like help with?<textarea value={prompt} onChange={(event) => update({ prompt: event.target.value })} minLength={2} maxLength={8000} required /></label>
              <div className="feedback-actions"><label>Feedback source<select value={provider} onChange={(event) => update({ provider: event.target.value as Provider })}><option value="auto">Continuum</option><option value="ollama">Ollama on this device</option></select></label>{coachBusy ? <Button type="button" className="button-secondary" onClick={() => coachAbortRef.current?.abort()}><Square size={14} />Stop</Button> : <Button className="button-primary" disabled={!topic.trim() || !prompt.trim()}><Sparkles size={15} />Get feedback</Button>}</div>
              {coachError ? <div className="code-error" role="alert"><strong>Feedback unavailable</strong><span>{coachError}</span><small>Your source and deterministic output are unchanged.</small></div> : null}
              {shownAnswer ? <><CoachMarkdown value={shownAnswer} /><footer><button type="button" className="icon-text-button" onClick={() => void navigator.clipboard.writeText(shownAnswer)}><Clipboard size={15} />Copy feedback</button><Button type="button" className="button-secondary" onClick={() => setCheckpointOpen((open) => !open)}><Save size={15} />Save checkpoint</Button></footer></> : !coachError && !coachBusy ? <div className="coach-empty compact"><Braces size={24} /><h2>Run, then ask.</h2><p>Get an explanation, help with an error, a code review, or a similar practice problem.</p></div> : null}
              {checkpointOpen ? <div className="checkpoint-form"><label>What did you learn?<textarea name="learned" required minLength={2} maxLength={2000} /></label><label>What will you do next?<input name="nextAction" required minLength={2} maxLength={500} /></label><Button type="button" className="button-primary" disabled={checkpointBusy} onClick={(event) => { const form = event.currentTarget.form; if (form) void saveCheckpoint(form); }}><Check size={15} />{checkpointBusy ? "Saving…" : "Save to memory"}</Button></div> : null}
            </form> : null}
          </div>
        </section>
      </div>
    </div>
  );
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
          ? "The program took too long, often because a loop did not finish."
          : result.outcome === "stopped"
            ? "The run was stopped before it finished."
            : "The local runner is temporarily unavailable. Your code is still saved.";
  return <div className="runtime-result"><header><Badge tone={outcomeTone(result.outcome)}>{outcomeLabel(result.outcome)}</Badge><span>{result.durationMs} ms · exit {result.exitCode ?? "—"}{result.timedOut ? " · timeout" : ""}</span></header><div className={`runtime-guidance ${result.outcome === "success" ? "success" : "error"}`}>{result.outcome === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}<div><strong>{result.outcome === "success" ? "Run complete" : "The program needs a change"}</strong><span>{guidance}</span></div></div>{result.stdout ? <section><h3>Program output</h3><pre>{result.stdout}</pre></section> : null}{result.tables?.length ? result.tables.map((table, index) => <section className="sql-result" key={`${index}-${table.columns.join("-")}`}><h3>Result table {index + 1}</h3><div><table><thead><tr>{table.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell === null ? <em>NULL</em> : String(cell)}</td>)}</tr>)}</tbody></table></div></section>) : null}{typeof result.rowsModified === "number" ? <p className="rows-modified">{result.rowsModified} row{result.rowsModified === 1 ? "" : "s"} changed during the run.</p> : null}{result.stderr ? <section className="runtime-stderr"><h3>{result.outcome === "compiler_error" ? "What prevented the run" : result.outcome === "runtime_error" ? "Where the run stopped" : "Run message"}</h3><pre>{result.stderr}</pre></section> : null}{!result.stdout && !result.stderr && !result.tables?.length && result.outcome === "success" ? <div className="quiet-success"><CheckCircle2 size={19} /><span>Completed without printable output.</span></div> : null}<div className="runtime-next-action"><Button className="button-secondary" type="button" onClick={onFeedback}><Sparkles size={14} />{result.outcome === "success" ? "Get feedback" : "Get help with this error"}</Button></div></div>;
}

function TestsPanel({ tests, result, onChange }: { tests: ExecutionTest[]; result: ExecutionResult | undefined; onChange: (tests: ExecutionTest[]) => void }) {
  const passed = result?.tests.filter((test) => test.passed).length ?? 0;
  return <div className="tests-panel"><header><div><strong>{result?.tests.length ? passed === result.tests.length ? "All tests passed" : `${result.tests.length - passed} test${result.tests.length - passed === 1 ? "" : "s"} failed` : "Sample tests"}</strong><span>Each test runs your program with the input shown below.</span></div><Badge tone={result?.tests.length ? passed === result.tests.length ? "green" : "red" : "neutral"}>{result?.tests.length ? `${passed}/${result.tests.length} passed` : `${tests.length} ready`}</Badge></header>{tests.map((test, index) => { const outcome = result?.tests.find((item) => item.id === test.id); return <div className={`test-row ${outcome ? outcome.passed ? "passed" : "failed" : ""}`} key={test.id}><span>{outcome ? outcome.passed ? <CheckCircle2 size={18} /> : <XCircle size={18} /> : <TestTube2 size={18} />}</span><div><strong>{test.name}{outcome ? outcome.passed ? " — Passed" : " — Failed" : ""}</strong><label>Input<textarea value={test.stdin ?? ""} onChange={(event) => onChange(tests.map((item, itemIndex) => itemIndex === index ? { ...item, stdin: event.target.value } : item))} /></label><label>Expected output<textarea value={test.expectedOutput} onChange={(event) => onChange(tests.map((item, itemIndex) => itemIndex === index ? { ...item, expectedOutput: event.target.value } : item))} /></label>{outcome && !outcome.passed ? <p><AlertTriangle size={14} />Your output: <code>{outcome.actualOutput || outcome.error || "No output"}</code></p> : null}</div></div>; })}{!tests.length ? <div className="runtime-empty"><TestTube2 size={25} /><h2>No sample test configured</h2><p>The program can still run. Add a sample from a lesson to check output automatically.</p></div> : null}</div>;
}
