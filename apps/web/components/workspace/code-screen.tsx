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
  Edit3,
  FileCode2,
  FilePlus2,
  FileUp,
  FolderTree,
  History,
  Keyboard,
  LoaderCircle,
  Laptop,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Square,
  TerminalSquare,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
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
type OutputPanel = "console" | "io" | "assistant" | "tests";

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
    files: [{ id: "file_main", name: "main.py", language: "python", content: starterCode.python }],
    activeFileId: "file_main",
    panel: "console",
    panelWidth: 410,
    panelCollapsed: false,
    timeoutMs: 5_000,
  });
  const { goalId, topic, language, mode, provider, prompt, code, stdin, tests, runtimeResult, runtimeHistory, conversation, fileName, timeoutMs, files, activeFileId, panelWidth, panelCollapsed } = session;
  const panel = session.panel as OutputPanel;
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
  const [localFileOpen, setLocalFileOpen] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number; source: string; language: string; runnable: boolean }>();
  const [uploadError, setUploadError] = useState("");
  const [focusLine, setFocusLine] = useState<number>();
  const coachAbortRef = useRef<AbortController | undefined>(undefined);
  const runRef = useRef<ExecutionHandle | undefined>(undefined);
  const studioRef = useRef<HTMLDivElement>(null);

  const setPanel = (next: OutputPanel) => update({ panel: next, panelCollapsed: false });

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
    const nextCode = nextRuntime && sourceIsStarter ? starterCode[nextRuntime] : code;
    const nextName = nextRuntime ? `main.${nextRuntime === "python" ? "py" : nextRuntime === "javascript" ? "js" : nextRuntime === "typescript" ? "ts" : "sql"}` : fileName;
    update({
      language: next,
      ...(nextRuntime && sourceIsStarter ? { code: nextCode, stdin: starterInput[nextRuntime], tests: starterTests[nextRuntime], runtimeResult: undefined } : {}),
      ...(nextRuntime ? { fileName: nextName } : {}),
      files: files.map((file) => file.id === activeFileId ? { ...file, name: nextName, language: next, content: nextCode } : file),
    });
  }

  function updateActiveCode(next: string) {
    update({
      code: next,
      files: files.map((file) => file.id === activeFileId ? { ...file, content: next } : file),
    });
  }

  function activateFile(fileId: string) {
    const file = files.find((candidate) => candidate.id === fileId);
    if (!file) return;
    update({ activeFileId: file.id, fileName: file.name, language: file.language, code: file.content, runtimeResult: undefined });
  }

  function createFile() {
    const name = window.prompt("New file name", `file${files.length + 1}.py`)?.trim();
    if (!name || files.some((file) => file.name.toLowerCase() === name.toLowerCase())) {
      if (name) showToast("Choose a unique file name.");
      return;
    }
    const extension = name.split(".").at(-1)?.toLowerCase();
    const detected = extension === "py" ? "python" : extension === "js" ? "javascript" : extension === "ts" ? "typescript" : extension === "sql" ? "sql" : language;
    const file = { id: `file_${crypto.randomUUID()}`, name, language: detected, content: "" };
    update({ files: [...files, file], activeFileId: file.id, fileName: name, language: detected, code: "", runtimeResult: undefined });
  }

  function renameActiveFile() {
    const current = files.find((file) => file.id === activeFileId);
    if (!current) return;
    const name = window.prompt("Rename file", current.name)?.trim();
    if (!name || name === current.name) return;
    if (files.some((file) => file.id !== current.id && file.name.toLowerCase() === name.toLowerCase())) { showToast("Choose a unique file name."); return; }
    update({ fileName: name, files: files.map((file) => file.id === current.id ? { ...file, name } : file) });
  }

  function duplicateActiveFile() {
    const current = files.find((file) => file.id === activeFileId);
    if (!current) return;
    const dot = current.name.lastIndexOf(".");
    const name = `${dot > 0 ? current.name.slice(0, dot) : current.name}-copy${dot > 0 ? current.name.slice(dot) : ""}`;
    const file = { ...current, id: `file_${crypto.randomUUID()}`, name };
    update({ files: [...files, file], activeFileId: file.id, fileName: file.name, language: file.language, code: file.content });
  }

  function deleteActiveFile() {
    const current = files.find((file) => file.id === activeFileId);
    if (!current || !window.confirm(`Delete ${current.name}? This removes it from your saved Continuum workspace.`)) return;
    const remaining = files.filter((file) => file.id !== current.id);
    if (!remaining.length) {
      const replacement = { id: `file_${crypto.randomUUID()}`, name: "main.py", language: "python", content: "" };
      update({ files: [replacement], activeFileId: replacement.id, fileName: replacement.name, language: replacement.language, code: "", runtimeResult: undefined });
      return;
    }
    const next = remaining[0]!;
    update({ files: remaining, activeFileId: next.id, fileName: next.name, language: next.language, code: next.content, runtimeResult: undefined });
  }

  async function runCode(runTests = false, source = code) {
    if (runtimeBusy) return;
    if (!runnableLanguage) { showToast(`${languageLabel(language)} is editor-only until an isolated runtime is configured.`); return; }
    const request = { id: crypto.randomUUID(), language: runnableLanguage, source, stdin, timeoutMs, tests: runTests ? tests : [] };
    setRuntimeBusy(true);
    setRuntimeStatus("preparing");
    setPanel(runTests ? "tests" : "console");
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
    if (file.name.toLowerCase().endsWith(".zip")) {
      if (file.size > 5 * 1024 * 1024) { setUploadError("Project archives are limited to 5 MB."); return; }
      try {
        const JSZip = (await import("jszip")).default;
        const archive = await JSZip.loadAsync(file, { checkCRC32: true, createFolders: false });
        const entries = Object.values(archive.files).filter((entry) => !entry.dir && !entry.name.startsWith("__MACOSX/"));
        if (!entries.length || entries.length > 24) throw new Error("A project archive must contain between 1 and 24 files.");
        const supported = /\.(py|js|jsx|ts|tsx|sql|java|c|cc|cpp|h|hpp|rs|go|rb|php|swift|kt|kts|html|css|scss|json|md|txt)$/i;
        const imported: Array<{ id: string; name: string; language: string; content: string }> = [];
        let total = 0;
        for (const entry of entries) {
          const normalized = entry.name.normalize("NFKC").replaceAll("\\", "/");
          const permissions = typeof entry.unixPermissions === "number" ? entry.unixPermissions : 0;
          if (normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized) || normalized.split("/").some((part) => !part || part === "." || part === "..") || (permissions & 0o170000) === 0o120000) throw new Error("The archive contains an unsafe path or symbolic link.");
          if (!supported.test(normalized)) continue;
          const bytes = await entry.async("uint8array");
          total += bytes.byteLength;
          if (bytes.byteLength > 200_000 || total > 1_500_000) throw new Error("Extracted project text exceeds the safe 1.5 MB limit.");
          const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          const extension = normalized.split(".").at(-1)?.toLowerCase();
          const detected = extension === "py" ? "python" : extension === "js" || extension === "jsx" ? "javascript" : extension === "ts" || extension === "tsx" ? "typescript" : extension === "sql" ? "sql" : extension ?? "text";
          imported.push({ id: `file_${crypto.randomUUID()}`, name: normalized, language: detected, content });
        }
        if (!imported.length) throw new Error("No supported plain-text code files were found in the archive.");
        const first = imported[0]!;
        update({ files: imported, activeFileId: first.id, fileName: first.name, language: first.language, code: first.content, runtimeResult: undefined });
        setLocalFileOpen(false);
        showToast(`Imported ${imported.length} project files. Nothing was executed.`);
      } catch (cause) {
        setUploadError(cause instanceof Error ? cause.message : "The project archive could not be opened safely.");
      }
      return;
    }
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
    const existing = files.find((file) => file.name.toLowerCase() === uploadedFile.name.toLowerCase());
    const imported = { id: existing?.id ?? `file_${crypto.randomUUID()}`, name: uploadedFile.name, language: uploadedFile.language, content: uploadedFile.source };
    update({
      language: uploadedFile.language,
      fileName: uploadedFile.name,
      code: uploadedFile.source,
      activeFileId: imported.id,
      files: existing ? files.map((file) => file.id === existing.id ? imported : file) : [...files, imported],
      runtimeResult: undefined,
    });
    setPanel("console");
    setLocalFileOpen(false);
    showToast(`${uploadedFile.name} is ready. Continuum has not run it.`);
  }

  async function runUploadedFile(checkSyntax = false) {
    if (!uploadedFile) return;
    const importedRuntime = normalizeRunnableLanguage(uploadedFile.language);
    if (!importedRuntime) return;
    const existing = files.find((file) => file.name.toLowerCase() === uploadedFile.name.toLowerCase());
    const imported = { id: existing?.id ?? `file_${crypto.randomUUID()}`, name: uploadedFile.name, language: uploadedFile.language, content: uploadedFile.source };
    update({ language: uploadedFile.language, fileName: uploadedFile.name, code: uploadedFile.source, activeFileId: imported.id, files: existing ? files.map((file) => file.id === existing.id ? imported : file) : [...files, imported], runtimeResult: undefined });
    setLocalFileOpen(false);
    const source = checkSyntax && importedRuntime === "python"
      ? `compile(${JSON.stringify(uploadedFile.source)}, ${JSON.stringify(uploadedFile.name)}, "exec")\nprint("Syntax check passed")`
      : uploadedFile.source;
    const request = { id: crypto.randomUUID(), language: importedRuntime, source, stdin, timeoutMs, tests: [] };
    setRuntimeBusy(true);
    setRuntimeStatus("preparing");
    setPanel("console");
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
    setPanel("assistant");
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
    setPanel("console");
    showToast("Restored the source and output from that run.");
  }

  return (
    <div className="screen code-screen premium-screen">
      <PageIntro eyebrow="CODE" title="Write it. Run it. Understand why it works." description="Run code directly, see the exact result, then continue a saved conversation when you want help." />

      <div className="studio-toolbar" aria-label="Code workspace controls">
        <label className="studio-file-name"><FileCode2 size={18} /><span className="sr-only">File name</span><input aria-label="File name" value={fileName} maxLength={90} onChange={(event) => {
          const name = event.target.value;
          update({ fileName: name, files: files.map((file) => file.id === activeFileId ? { ...file, name } : file) });
        }} /></label>
        <label className="studio-language"><span>Language</span><select value={language.toLowerCase()} onChange={(event) => switchLanguage(event.target.value)}><optgroup label="Ready to run">{runnableLabels.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup><optgroup label="Writing only">{EDITOR_ONLY_LANGUAGES.map((option) => <option key={option} value={option.toLowerCase()}>{option}</option>)}</optgroup></select></label>
        <span className="studio-save-status"><Save size={14} />Saved privately</span>
        <div className="studio-toolbar-actions">
          <Button className="button-secondary" type="button" onClick={() => setLocalFileOpen(true)}><Laptop size={15} />Import file</Button>
          <Button className="button-secondary sample-check-action" type="button" disabled={!runnableLanguage || !tests.length || runtimeBusy} onClick={() => void runCode(true)}><CheckCircle2 size={14} />Check sample</Button>
          <Button className="button-secondary" type="button" onClick={() => setPanel("assistant")}><Sparkles size={15} />Ask Assistant</Button>
          {runtimeBusy ? <Button className="button-secondary" type="button" onClick={() => runRef.current?.stop()}><Square size={14} />Stop</Button> : <Button className="button-primary" type="button" disabled={!runnableLanguage || !code.trim()} onClick={() => void runCode()}><Play size={15} />Run <kbd>⌘↵</kbd></Button>}
        </div>
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

      <div ref={studioRef} className={`code-studio ${panelCollapsed ? "panel-collapsed" : ""}`} style={{ "--code-panel-width": `${panelWidth}px` } as CSSProperties}>
        <section className="editor-pane" aria-label="Source editor">
          <div className="code-file-tabs" role="tablist" aria-label="Project files">
            {files.map((file) => <button type="button" role="tab" aria-selected={file.id === activeFileId} className={file.id === activeFileId ? "active" : ""} key={file.id} onClick={() => activateFile(file.id)}><FileCode2 size={12} />{file.name}</button>)}
            <button type="button" className="new-file" onClick={createFile} aria-label="Create file"><FilePlus2 size={14} /></button>
          </div>
          <div className="code-editor-workspace">
            {files.length > 1 ? <aside className="code-file-explorer" aria-label="File explorer"><strong><FolderTree size={13} />Files</strong>{files.map((file) => <button type="button" className={file.id === activeFileId ? "active" : ""} key={file.id} onClick={() => activateFile(file.id)}><FileCode2 size={12} />{file.name}</button>)}</aside> : null}
            <div className="code-active-editor">
          <header><div><span className="file-dot" />{fileName}</div><span><button className="editor-copy" type="button" onClick={() => downloadSource(fileName, code, runnableLanguage === "python" ? "py" : runnableLanguage === "javascript" ? "js" : runnableLanguage === "typescript" ? "ts" : runnableLanguage ?? "txt")}><Download size={13} />Download</button><button className="editor-copy" type="button" onClick={() => void copyCode()}><Copy size={13} />Copy</button><Keyboard size={14} />Tab indents · ⌘Z undo</span></header>
              <CodeEditor value={code} language={language} onChange={updateActiveCode} placeholder={`Write ${languageLabel(language)} here`} minHeight={300} ariaLabel={`${languageLabel(language)} source editor`} focusLine={focusLine} />
              <div className="code-file-actions"><button type="button" onClick={renameActiveFile}><Edit3 size={12} />Rename</button><button type="button" onClick={duplicateActiveFile}><Copy size={12} />Duplicate</button><button type="button" onClick={deleteActiveFile}><Trash2 size={12} />Delete</button></div>
            </div>
          </div>
        </section>

        {!panelCollapsed ? <div className="code-panel-resizer" role="separator" aria-orientation="vertical" aria-label="Resize context panel" onPointerDown={(event) => {
          const startX = event.clientX;
          const startWidth = panelWidth;
          const move = (moveEvent: PointerEvent) => update({ panelWidth: Math.max(300, Math.min(620, startWidth + startX - moveEvent.clientX)) });
          const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", stop);
        }} /> : null}

        <section className="execution-pane" aria-label="Execution and assistance">
          {panelCollapsed ? <button className="code-panel-open" onClick={() => update({ panelCollapsed: false })}><PanelRightOpen size={17} /><span>Open panel</span></button> : null}
          {!panelCollapsed ? <>
          <div className="output-tabs" role="tablist" aria-label="Execution panels">
            <button type="button" role="tab" aria-selected={panel === "console"} className={panel === "console" ? "active" : ""} onClick={() => setPanel("console")}><TerminalSquare size={15} />Console</button>
            <button type="button" role="tab" aria-selected={panel === "io"} className={panel === "io" ? "active" : ""} onClick={() => setPanel("io")}><Braces size={15} />Input & Output</button>
            <button type="button" role="tab" aria-selected={panel === "assistant"} className={panel === "assistant" ? "active" : ""} onClick={() => setPanel("assistant")}><Sparkles size={15} />Assistant{conversation.length ? <small>{Math.ceil(conversation.length / 2)}</small> : null}</button>
            <button type="button" role="tab" aria-selected={panel === "tests"} className={panel === "tests" ? "active" : ""} onClick={() => setPanel("tests")}><CheckCircle2 size={15} />Tests{tests.length ? <small>{tests.length}</small> : null}</button>
            <button type="button" className="collapse-panel" onClick={() => update({ panelCollapsed: true })} aria-label="Collapse context panel"><PanelRightClose size={15} /></button>
          </div>

          <div className="output-body">
            {runtimeBusy ? <div className="runtime-loading" role="status"><LoaderCircle className="spin" size={23} /><strong>{statusLabel(runtimeStatus)}</strong><span>Output and tests will appear here as soon as the run finishes.</span></div> : null}

            {!runtimeBusy && panel === "console" ? <><div className="code-panel-utilities"><Button className="button-secondary" type="button" onClick={() => update({ runtimeResult: undefined })}>Clear</Button><Button className="button-secondary" type="button" disabled={!runtimeResult} onClick={() => void navigator.clipboard.writeText([runtimeResult?.stdout, runtimeResult?.stderr].filter(Boolean).join("\n"))}><Copy size={13} />Copy output</Button><Button className="button-secondary" type="button" disabled={!runnableLanguage || !code.trim()} onClick={() => void runCode()}><RefreshCw size={13} />Rerun</Button></div><RuntimeOutput result={runtimeResult} onFeedback={() => setPanel("assistant")} onJump={(line) => { setFocusLine(line); }} />{runtimeHistory.length ? <details className="run-history-details"><summary><History size={14} />Previous runs ({runtimeHistory.length})</summary><div className="run-history">{runtimeHistory.map((run) => <button type="button" key={run.id} onClick={() => restoreRun(run.id)}><span className={`run-mark ${run.result.outcome}`} /><span><strong>{outcomeLabel(run.result.outcome)}</strong><small>{new Date(run.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {run.result.durationMs} ms</small></span><RotateCcw size={14} /></button>)}</div></details> : null}</> : null}
            {!runtimeBusy && panel === "io" ? <div className="code-io-panel"><label><strong>Program input</strong><textarea value={stdin} onChange={(event) => update({ stdin: event.target.value })} placeholder="Put each response on a new line" /><small>Values are provided to input() or the selected runtime. Nothing is sent to AI.</small></label><Button className="button-primary" type="button" disabled={!runnableLanguage || !code.trim()} onClick={() => void runCode()}><Play size={14} />Run with this input</Button><section><strong>Output</strong>{runtimeResult?.stdout ? <pre>{runtimeResult.stdout}</pre> : <p>Run the program with the input above. Its output will appear here.</p>}{runtimeResult?.stderr ? <pre className="error">{runtimeResult.stderr}</pre> : null}</section></div> : null}
            {!runtimeBusy && panel === "tests" ? <div className="code-tests-panel"><header><div><strong>Test cases</strong><small>Compare exact output without invoking AI.</small></div><Button className="button-primary" type="button" disabled={!tests.length || !runnableLanguage || !code.trim()} onClick={() => void runCode(true)}><CheckCircle2 size={14} />Run all tests</Button></header>{tests.map((test, index) => {
              const result = runtimeResult?.tests.find((candidate) => candidate.id === test.id);
              return <details key={test.id} open={Boolean(result && !result.passed)}><summary><span className={result ? result.passed ? "pass" : "fail" : ""}>{result ? result.passed ? <Check size={13} /> : <X size={13} /> : index + 1}</span><strong>{test.name}</strong>{result ? <Badge tone={result.passed ? "green" : "red"}>{result.passed ? "Passed" : "Failed"}</Badge> : <Badge tone="neutral">Not run</Badge>}</summary><div><label>Name<input value={test.name} onChange={(event) => update({ tests: tests.map((candidate) => candidate.id === test.id ? { ...candidate, name: event.target.value } : candidate) })} /></label><label>Input<textarea value={test.stdin ?? ""} onChange={(event) => update({ tests: tests.map((candidate) => candidate.id === test.id ? { ...candidate, stdin: event.target.value } : candidate) })} /></label><label>Expected output<textarea value={test.expectedOutput} onChange={(event) => update({ tests: tests.map((candidate) => candidate.id === test.id ? { ...candidate, expectedOutput: event.target.value } : candidate) })} /></label>{result ? <label>Actual output<pre>{result.actualOutput}</pre></label> : null}<div><Button className="button-secondary" type="button" onClick={() => update({ tests: [...tests, { ...test, id: `test_${crypto.randomUUID()}`, name: `${test.name} copy` }] })}>Duplicate</Button><Button className="button-quiet danger" type="button" onClick={() => update({ tests: tests.filter((candidate) => candidate.id !== test.id) })}>Delete</Button></div></div></details>;
            })}<Button className="button-secondary code-add-test" type="button" onClick={() => update({ tests: [...tests, { id: `test_${crypto.randomUUID()}`, name: `Test ${tests.length + 1}`, stdin: "", expectedOutput: "" }] })}><FilePlus2 size={14} />Add test</Button></div> : null}
            {!runtimeBusy && panel === "assistant" ? <form className="feedback-panel" onSubmit={submitForFeedback}>
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
          </> : null}
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
            <label className="file-drop"><FileUp size={22} /><span><strong>Choose a code file or safe project archive</strong><small>Supported plain-text code · 1 MB per file · ZIP projects up to 5 MB</small></span><input type="file" accept={`${CODE_FILE_ACCEPT},.zip,application/zip`} onChange={(event) => void selectCodeFile(event.target.files?.[0])} /></label>
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
          <p className="privacy-note">The 1 MB import limit keeps the editor responsive. Added files persist in your account-scoped Continuum workspace and are sent to AI only when you explicitly request help.</p>
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

function RuntimeOutput({ result, onFeedback, onJump }: { result: ExecutionResult | undefined; onFeedback: () => void; onJump: (line: number) => void }) {
  if (!result) return <div className="runtime-empty"><TerminalSquare size={28} /><h2>Your output will appear here.</h2><p>Enter any program input above, then use the single Run button in the top bar.</p></div>;
  const passed = result.tests.filter((test) => test.passed).length;
  const errorText = `${result.stderr}\n${result.technicalStderr ?? ""}`;
  const parsedErrorLine = Number((errorText.match(/line\s+(\d+)/i) ?? errorText.match(/:(\d+):\d+/))?.[1] ?? 0);
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
  return <div className="runtime-result"><header><Badge tone={outcomeTone(result.outcome)}>{outcomeLabel(result.outcome)}</Badge><span>{result.executionDurationMs ?? result.durationMs} ms · exit code {result.exitCode ?? "—"}{result.terminated ? " · terminated" : ""}</span></header><div className={`runtime-guidance ${result.outcome === "success" ? "success" : "error"}`}>{result.outcome === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}<div><strong>{result.outcome === "success" ? "Run complete" : result.outcome === "stopped" ? "Program stopped" : "The program needs a change"}</strong><span>{guidance}</span></div></div>{result.stdout ? <section><h3>Output</h3><pre>{result.stdout}</pre></section> : null}{result.tables?.length ? result.tables.map((table, index) => <section className="sql-result" key={`${index}-${table.columns.join("-")}`}><h3>Result table {index + 1}</h3><div><table><thead><tr>{table.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell === null ? <em>NULL</em> : String(cell)}</td>)}</tr>)}</tbody></table></div></section>) : null}{typeof result.rowsModified === "number" ? <p className="rows-modified">{result.rowsModified} row{result.rowsModified === 1 ? "" : "s"} changed during the run.</p> : null}{result.stderr ? <section className="runtime-stderr"><h3>Errors</h3><pre>{result.stderr}</pre></section> : null}{!result.stdout && !result.stderr && !result.tables?.length && result.outcome === "success" ? <div className="quiet-success"><CheckCircle2 size={19} /><span>Completed without printable output.</span></div> : null}<details className="runtime-technical-details"><summary>Technical details</summary><dl><div><dt>Status</dt><dd>{outcomeLabel(result.outcome)}</dd></div><div><dt>Exit code</dt><dd>{result.exitCode ?? "Not available"}</dd></div><div><dt>Language setup</dt><dd>{result.startupDurationMs ?? 0} ms</dd></div><div><dt>Execution</dt><dd>{result.executionDurationMs ?? result.durationMs} ms</dd></div><div><dt>Limit</dt><dd>{result.timeoutMs ? `${result.timeoutMs / 1000} seconds` : "Not recorded"}</dd></div><div><dt>Terminated</dt><dd>{result.terminated ? "Yes" : "No"}</dd></div></dl>{result.technicalStderr ? <div className="runtime-raw-error"><strong>Raw runtime diagnostic</strong><pre>{result.technicalStderr}</pre></div> : null}</details><div className="runtime-next-action">{parsedErrorLine > 0 ? <Button className="button-secondary" type="button" onClick={() => onJump(parsedErrorLine)}><Edit3 size={14} />Go to line {parsedErrorLine}</Button> : null}<Button className="button-secondary" type="button" onClick={onFeedback}><Sparkles size={14} />{result.outcome === "success" ? "Get feedback" : "Get help with this error"}</Button></div></div>;
}
