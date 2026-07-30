"use client";

import type { AuthUser } from "@continuum/db";
import { RotateCcw, Save } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import {
  Banner,
  Button,
  ConfirmationDialog,
  Field,
  Input,
  Modal,
  Tabs,
} from "@/components/ui";
import { CodeEditor } from "@/components/workspace/code-editor";
import { text, type WorkspaceState } from "@/components/workspace/types";
import { useCodeSession } from "@/components/workspace/use-code-session";
import { prewarmBrowserRuntime, startBrowserExecution, type ExecutionHandle } from "@/lib/browser-code-runner";
import { downloadSource } from "@/lib/code-file";
import { normalizeRunnableLanguage, type ExecutionStatus } from "@/lib/code-execution";
import { languageLabel } from "@/lib/labels";

import "./build.css";

import { ConsolePanel, type ConsoleTab } from "./console-panel";
import { FileRail } from "./file-rail";
import { ImportDialog, type UploadedFile } from "./import-dialog";
import {
  STARTER_CODE,
  STARTER_INPUT,
  STARTER_TESTS,
  languageExtension,
  languageForExtension,
  outcomeLabel,
  uniqueFileName,
} from "./language";
import { RunControls } from "./run-controls";
import { cleanRuntimeMessage } from "./runtime-error";
import type { AskContext, BuildFile } from "./types";
import { useConsoleHeight, useFixedFrame, useMediaQuery } from "./use-build-layout";

type Toast = (message: string | null) => void;

/**
 * `/build` — the coding workspace (redesign.md §14.3).
 *
 * A fixed frame with no page scroll: a header, a file rail, an editor, and a
 * console that is always visible and resizable. The console is the point of the
 * rebuild (C7) — see `console-panel.tsx`.
 *
 * The execution engine (`browser-code-runner.ts`) and the persisted session
 * (`use-code-session.ts`) are unchanged; this is a presentation rebuild.
 */
export function BuildWorkspace({
  state,
  user,
  showToast,
  onAskAssistant,
}: {
  state: WorkspaceState;
  user: AuthUser;
  showToast: Toast;
  /**
   * Opens the global ⌘J assistant panel with this file, the last run, and the
   * error attached (§8.5). §14.3 deliberately removed the third-tab coach so
   * there is exactly one assistant across the product.
   */
  onAskAssistant: (context: AskContext) => void;
}) {
  const { session, update, pushRuntimeAttempt, reset } = useCodeSession(user.id, {
    language: "python",
    goalId: text(state.goals[1] ?? state.goals[0], "id"),
    topic: "Python lists, filtering, and parameterised queries",
    code: STARTER_CODE.python,
    stdin: STARTER_INPUT.python,
    tests: STARTER_TESTS.python,
    fileName: "main.py",
    files: [{ id: "file_main", name: "main.py", language: "python", content: STARTER_CODE.python }],
    activeFileId: "file_main",
    panel: "console",
    timeoutMs: 5_000,
  });
  const { goalId, topic, language, code, stdin, runtimeResult, runtimeHistory, fileName, timeoutMs, files, activeFileId } = session;
  const runnableLanguage = normalizeRunnableLanguage(language);
  // A persisted session may still carry the retired "assistant" / "tests" tabs.
  const consoleTab: ConsoleTab = session.panel === "io" ? "io" : "console";

  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<ExecutionStatus>("preparing");
  const [announcement, setAnnouncement] = useState("");
  const [focusLine, setFocusLine] = useState<number>();
  const [mobilePane, setMobilePane] = useState<"editor" | "console">("editor");
  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [checkpointBusy, setCheckpointBusy] = useState(false);
  const [checkpointOffer, setCheckpointOffer] = useState(false);
  const [fileDialog, setFileDialog] = useState<"create" | "rename" | "delete">();
  const [fileNameError, setFileNameError] = useState("");

  const runRef = useRef<ExecutionHandle | undefined>(undefined);
  const frameRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const hadFailure = useRef(false);
  const checkpointUsed = useRef(false);

  // Two breakpoints, both from §14.3: the rail becomes a dropdown below 1100px,
  // and below 900px the whole screen becomes two tabs with a sticky Run bar.
  const compact = useMediaQuery("(max-width: 899px)");
  const railAsDropdown = useMediaQuery("(min-width: 900px) and (max-width: 1099px)");
  const frame = useFixedFrame(frameRef, compact);
  const consoleHeight = useConsoleHeight(frame.height);

  useEffect(() => {
    if (runnableLanguage) return prewarmBrowserRuntime(runnableLanguage);
    return undefined;
  }, [runnableLanguage]);

  // No dependency array: the handler closes over `code`, `stdin` and the busy
  // flag, all of which change constantly, and a stale closure here would run
  // yesterday's source.
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void runCode(); }
      // Escape inside the editor releases focus (§14.3 accessibility) and must
      // not also kill the run; outside it, Escape is the keyboard cancel.
      if (event.key === "Escape" && runtimeBusy && !editorRef.current?.contains(event.target as Node)) runRef.current?.stop();
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });

  /**
   * One buffer per language. Switching the language used to keep whatever
   * source was in the editor, change the file extension, and change the
   * runtime — so `while True: pass` switched to SQL produced
   * `near "while": syntax error`.
   */
  function switchLanguage(next: string) {
    if (next === language) return;
    const existing = files.find((file) => file.language.toLowerCase() === next.toLowerCase());
    if (existing) { activateFile(existing.id); return; }
    const nextRuntime = normalizeRunnableLanguage(next);
    const seed = nextRuntime ? STARTER_CODE[nextRuntime] : "";
    const name = uniqueFileName(`main.${languageExtension(next)}`, files);
    const file: BuildFile = { id: `file_${crypto.randomUUID()}`, name, language: next, content: seed };
    update({
      language: next,
      fileName: name,
      code: seed,
      files: [...files, file],
      activeFileId: file.id,
      runtimeResult: undefined,
      ...(nextRuntime ? { stdin: STARTER_INPUT[nextRuntime], tests: STARTER_TESTS[nextRuntime] } : {}),
    });
  }

  function updateActiveCode(next: string) {
    update({ code: next, files: files.map((file) => file.id === activeFileId ? { ...file, content: next } : file) });
  }

  function activateFile(fileId: string) {
    const file = files.find((candidate) => candidate.id === fileId);
    if (!file) return;
    update({ activeFileId: file.id, fileName: file.name, language: file.language, code: file.content, runtimeResult: undefined });
  }

  // File create / rename / delete use the app's own dialogs. Native
  // `window.prompt` / `window.confirm` are unstyled, block the main thread,
  // cannot be tested, and are suppressed outright in some embedded contexts.
  function commitCreateFile(name: string) {
    const trimmed = name.trim();
    if (!trimmed) { setFileNameError("Enter a file name."); return; }
    if (files.some((file) => file.name.toLowerCase() === trimmed.toLowerCase())) { setFileNameError("A file with that name already exists."); return; }
    const detected = languageForExtension(trimmed, language);
    const file: BuildFile = { id: `file_${crypto.randomUUID()}`, name: trimmed, language: detected, content: "" };
    update({ files: [...files, file], activeFileId: file.id, fileName: trimmed, language: detected, code: "", runtimeResult: undefined });
    setFileDialog(undefined);
    setFileNameError("");
  }

  function commitRenameFile(name: string) {
    const current = files.find((file) => file.id === activeFileId);
    const trimmed = name.trim();
    if (!current) return;
    if (!trimmed) { setFileNameError("Enter a file name."); return; }
    if (trimmed === current.name) { setFileDialog(undefined); return; }
    if (files.some((file) => file.id !== current.id && file.name.toLowerCase() === trimmed.toLowerCase())) { setFileNameError("A file with that name already exists."); return; }
    update({ fileName: trimmed, files: files.map((file) => file.id === current.id ? { ...file, name: trimmed } : file) });
    setFileDialog(undefined);
    setFileNameError("");
  }

  function duplicateActiveFile() {
    const current = files.find((file) => file.id === activeFileId);
    if (!current) return;
    const dot = current.name.lastIndexOf(".");
    const name = `${dot > 0 ? current.name.slice(0, dot) : current.name}-copy${dot > 0 ? current.name.slice(dot) : ""}`;
    const file: BuildFile = { ...current, id: `file_${crypto.randomUUID()}`, name };
    update({ files: [...files, file], activeFileId: file.id, fileName: file.name, language: file.language, code: file.content });
  }

  function deleteActiveFile() {
    const current = files.find((file) => file.id === activeFileId);
    if (!current) return;
    setFileDialog(undefined);
    const remaining = files.filter((file) => file.id !== current.id);
    if (!remaining.length) {
      const replacement: BuildFile = { id: `file_${crypto.randomUUID()}`, name: "main.py", language: "python", content: "" };
      update({ files: [replacement], activeFileId: replacement.id, fileName: replacement.name, language: replacement.language, code: "", runtimeResult: undefined });
      return;
    }
    const next = remaining[0]!;
    update({ files: remaining, activeFileId: next.id, fileName: next.name, language: next.language, code: next.content, runtimeResult: undefined });
  }

  async function execute(source: string, recordedSource: string) {
    const runtime = normalizeRunnableLanguage(language);
    if (!runtime) return;
    setRuntimeBusy(true);
    setRuntimeStatus("preparing");
    setAnnouncement("");
    update({ panel: "console" });
    // The console is always visible on desktop; on a phone it is the other tab.
    setMobilePane("console");
    const handle = startBrowserExecution({ id: crypto.randomUUID(), language: runtime, source, stdin, timeoutMs, tests: [] }, setRuntimeStatus);
    runRef.current = handle;
    const result = await handle.result;
    runRef.current = undefined;
    setRuntimeBusy(false);
    pushRuntimeAttempt({ source: recordedSource, stdin, result });
    setAnnouncement(result.outcome === "success"
      ? `Run complete, exit code ${result.exitCode ?? 0}`
      : `${outcomeLabel(result.outcome)}, exit code ${result.exitCode ?? "unavailable"}`);
    // A single quiet offer, once per session, after a success that followed a
    // failure — the moment the learner actually worked something out (#82).
    if (result.outcome === "success" && hadFailure.current && !checkpointUsed.current) {
      checkpointUsed.current = true;
      setCheckpointOffer(true);
    }
    if (result.outcome !== "success" && result.outcome !== "stopped") hadFailure.current = true;
  }

  async function runCode() {
    if (runtimeBusy) return;
    if (!runnableLanguage) { showToast(`${languageLabel(language)} is editor-only until an isolated runtime is configured.`); return; }
    await execute(code, code);
  }

  function askAssistant(intent: string) {
    const error = runtimeResult?.stderr ? cleanRuntimeMessage(runtimeResult.stderr) : undefined;
    const suggestions = runtimeResult
      ? runtimeResult.outcome === "success"
        ? ["Review my code", "Suggest test cases"]
        : ["Explain this error", "Improve my code"]
      : ["Explain my code", "Suggest test cases"];
    const context: AskContext = { fileName, language, code, result: runtimeResult, error, suggestions: [intent, ...suggestions.filter((item) => item !== intent)] };
    onAskAssistant(context);
  }

  async function saveCheckpoint(form: HTMLFormElement) {
    const data = new FormData(form);
    setCheckpointBusy(true);
    try {
      const response = await fetch("/api/code/checkpoint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, goalId: goalId || undefined, learned: String(data.get("learned")), nextAction: String(data.get("nextAction")) }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Checkpoint could not be saved");
      setCheckpointOpen(false);
      setCheckpointOffer(false);
      showToast("Saved to what Continuum remembers.");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Checkpoint could not be saved");
    } finally {
      setCheckpointBusy(false);
    }
  }

  function useUploadedFile(uploaded: UploadedFile) {
    const existing = files.find((file) => file.name.toLowerCase() === uploaded.name.toLowerCase());
    const imported: BuildFile = { id: existing?.id ?? `file_${crypto.randomUUID()}`, name: uploaded.name, language: uploaded.language, content: uploaded.source };
    update({
      language: uploaded.language,
      fileName: uploaded.name,
      code: uploaded.source,
      activeFileId: imported.id,
      files: existing ? files.map((file) => file.id === existing.id ? imported : file) : [...files, imported],
      runtimeResult: undefined,
      panel: "console",
    });
    setImportOpen(false);
    showToast(`${uploaded.name} is ready. Continuum has not run it.`);
  }

  async function runUploadedFile(uploaded: UploadedFile, checkSyntax: boolean) {
    const importedRuntime = normalizeRunnableLanguage(uploaded.language);
    if (!importedRuntime) return;
    const existing = files.find((file) => file.name.toLowerCase() === uploaded.name.toLowerCase());
    const imported: BuildFile = { id: existing?.id ?? `file_${crypto.randomUUID()}`, name: uploaded.name, language: uploaded.language, content: uploaded.source };
    update({
      language: uploaded.language,
      fileName: uploaded.name,
      code: uploaded.source,
      activeFileId: imported.id,
      files: existing ? files.map((file) => file.id === existing.id ? imported : file) : [...files, imported],
      runtimeResult: undefined,
    });
    setImportOpen(false);
    const source = checkSyntax && importedRuntime === "python"
      ? `compile(${JSON.stringify(uploaded.source)}, ${JSON.stringify(uploaded.name)}, "exec")\nprint("Syntax check passed")`
      : uploaded.source;
    setRuntimeBusy(true);
    setRuntimeStatus("preparing");
    update({ panel: "console" });
    setMobilePane("console");
    const handle = startBrowserExecution({ id: crypto.randomUUID(), language: importedRuntime, source, stdin, timeoutMs, tests: [] }, setRuntimeStatus);
    runRef.current = handle;
    const result = await handle.result;
    runRef.current = undefined;
    setRuntimeBusy(false);
    pushRuntimeAttempt({ source: uploaded.source, stdin, result });
    setAnnouncement(result.outcome === "success" ? `Run complete, exit code ${result.exitCode ?? 0}` : `${outcomeLabel(result.outcome)}, exit code ${result.exitCode ?? "unavailable"}`);
  }

  function restoreRun(runId: string) {
    const run = runtimeHistory.find((item) => item.id === runId);
    if (!run) return;
    update({ code: run.source, stdin: run.stdin, language: run.result.language, runtimeResult: run.result, panel: "console" });
    setHistoryOpen(false);
    showToast("Restored the source and output from that run.");
  }

  const canRun = Boolean(runnableLanguage) && Boolean(code.trim());
  const showRail = !compact && !railAsDropdown;

  return (
    <div
      ref={frameRef}
      className={[
        "build-workspace",
        showRail ? "build-with-rail" : "",
        compact ? `build-compact build-pane-${mobilePane}` : "",
      ].filter(Boolean).join(" ")}
      style={{
        height: frame.height ? `${frame.height}px` : undefined,
        marginBottom: frame.swallow ? `${-frame.swallow}px` : undefined,
        "--build-console-h": `${consoleHeight.height}px`,
      } as CSSProperties}
    >
      <header className="build-header">
        <div className="build-identity">
          <h1>Build</h1>
          <span className="build-file-name">{fileName}</span>
        </div>
        {railAsDropdown ? (
          <FileRail
            variant="dropdown"
            files={files}
            activeFileId={activeFileId}
            onActivate={activateFile}
            onCreate={() => { setFileNameError(""); setFileDialog("create"); }}
            onRename={() => { setFileNameError(""); setFileDialog("rename"); }}
            onDuplicate={duplicateActiveFile}
            onDelete={() => setFileDialog("delete")}
          />
        ) : null}
        <RunControls
          language={language}
          runnable={Boolean(runnableLanguage)}
          running={runtimeBusy}
          canRun={canRun}
          onLanguageChange={switchLanguage}
          onRun={() => void runCode()}
          onStop={() => runRef.current?.stop()}
        />
      </header>

      {compact ? (
        <Tabs
          value={mobilePane}
          onChange={(next) => setMobilePane(next as "editor" | "console")}
          label="Editor or console"
          variant="segmented"
          className="build-pane-tabs"
          options={[{ value: "editor", label: "Editor" }, { value: "console", label: "Console" }]}
        />
      ) : null}

      {showRail ? (
        <FileRail
          variant="rail"
          files={files}
          activeFileId={activeFileId}
          onActivate={activateFile}
          onCreate={() => { setFileNameError(""); setFileDialog("create"); }}
          onRename={() => { setFileNameError(""); setFileDialog("rename"); }}
          onDuplicate={duplicateActiveFile}
          onDelete={() => setFileDialog("delete")}
        />
      ) : null}

      <div className="build-main">
        {/* Honest, and no disabled-Run mystery (AC-B5). */}
        {!runnableLanguage ? (
          <Banner tone="info" className="build-language-note">
            You can write and get help here. Running {languageLabel(language)} isn&rsquo;t available yet.
          </Banner>
        ) : null}

        <div className="build-editor" ref={editorRef}>
          <CodeEditor
            value={code}
            language={language}
            onChange={updateActiveCode}
            placeholder={`Write ${languageLabel(language)} here`}
            ariaLabel={`${languageLabel(language)} source editor`}
            focusLine={focusLine}
            fill
          />
        </div>

        {checkpointOffer ? (
          <div className="build-checkpoint-offer">
            <span>Save what you worked out?</span>
            <Button variant="secondary" size="sm" onClick={() => setCheckpointOpen(true)}><Save size={14} aria-hidden="true" />Save checkpoint</Button>
            <Button variant="quiet" size="sm" onClick={() => setCheckpointOffer(false)}>Not now</Button>
          </div>
        ) : null}

        <ConsolePanel
          height={consoleHeight.height}
          maxHeight={consoleHeight.max}
          onResize={consoleHeight.resize}
          tab={consoleTab}
          onTabChange={(next) => update({ panel: next })}
          result={runtimeResult}
          source={code}
          running={runtimeBusy}
          status={runtimeStatus}
          announcement={announcement}
          stdin={stdin}
          onStdinChange={(next) => update({ stdin: next })}
          timeoutMs={timeoutMs}
          onTimeoutChange={(next) => { update({ timeoutMs: next }); showToast(`Run limit set to ${Math.round(next / 1000)} seconds.`); }}
          historyCount={runtimeHistory.length}
          canRun={canRun}
          onAsk={askAssistant}
          onJump={(line) => { setFocusLine(line); setMobilePane("editor"); }}
          onRerun={() => void runCode()}
          onClear={() => { update({ runtimeResult: undefined }); setAnnouncement(""); }}
          onCopyOutput={() => void navigator.clipboard.writeText([runtimeResult?.stdout, runtimeResult?.stderr].filter(Boolean).join("\n")).then(() => showToast("Output copied.")).catch(() => showToast("Copy failed. Select the output manually."))}
          onOpenHistory={() => setHistoryOpen(true)}
          onImport={() => setImportOpen(true)}
          onDownload={() => downloadSource(fileName, code, languageExtension(language))}
          onReset={() => setResetOpen(true)}
        />
      </div>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        language={language}
        fileName={fileName}
        code={code}
        existingFiles={files}
        onImportProject={(imported) => {
          const first = imported[0]!;
          update({ files: imported, activeFileId: first.id, fileName: first.name, language: first.language, code: first.content, runtimeResult: undefined });
          setImportOpen(false);
          showToast(`Imported ${imported.length} project files. Nothing was executed.`);
        }}
        onUseFile={useUploadedFile}
        onRunFile={(uploaded, checkSyntax) => void runUploadedFile(uploaded, checkSyntax)}
      />

      <Modal
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        title="Previous runs"
        description="Restore the source and the output from any run in this session."
      >
        <ul className="build-run-history">
          {runtimeHistory.map((run) => (
            <li key={run.id}>
              <button type="button" onClick={() => restoreRun(run.id)}>
                <span className={`build-run-mark build-run-mark-${run.result.outcome}`} aria-hidden="true" />
                <span>
                  <strong>{outcomeLabel(run.result.outcome)}</strong>
                  <small>{new Date(run.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {run.result.durationMs} ms</small>
                </span>
                <RotateCcw size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal
        open={fileDialog === "create" || fileDialog === "rename"}
        onOpenChange={(open) => { if (!open) { setFileDialog(undefined); setFileNameError(""); } }}
        title={fileDialog === "rename" ? "Rename file" : "New file"}
        description={fileDialog === "rename" ? "The extension decides which language this buffer uses." : "The extension decides which language the new buffer uses — .py, .js, .ts, or .sql run here."}
      >
        <form
          className="build-file-form"
          onSubmit={(event) => {
            event.preventDefault();
            const value = String(new FormData(event.currentTarget).get("fileName") ?? "");
            if (fileDialog === "rename") commitRenameFile(value); else commitCreateFile(value);
          }}
        >
          <Field label="File name" error={fileNameError || undefined}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="fileName"
                autoFocus
                maxLength={90}
                invalid={invalid}
                aria-describedby={describedBy}
                defaultValue={fileDialog === "rename" ? fileName : uniqueFileName(`file.${languageExtension(language)}`, files)}
              />
            )}
          </Field>
          <div className="build-form-actions">
            <Button variant="secondary" onClick={() => { setFileDialog(undefined); setFileNameError(""); }}>Cancel</Button>
            <Button variant="primary" type="submit">{fileDialog === "rename" ? "Rename" : "Create file"}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmationDialog
        open={fileDialog === "delete"}
        onOpenChange={(open) => { if (!open) setFileDialog(undefined); }}
        title={`Delete ${fileName}?`}
        description="This removes the file from your saved Continuum workspace. Other files are unaffected."
        confirmLabel="Delete file"
        destructive
        onConfirm={deleteActiveFile}
      />

      <ConfirmationDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset workspace?"
        description="This clears the current source, input, results, and run history. It cannot be undone."
        confirmLabel="Reset workspace"
        destructive
        onConfirm={() => { reset(); setAnnouncement(""); setResetOpen(false); showToast("Started a fresh coding session."); }}
      />

      <Modal
        open={checkpointOpen}
        onOpenChange={setCheckpointOpen}
        title="Save what you worked out"
        description="Continuum keeps this with your goal so the next session starts where this one ended."
      >
        <form
          className="build-file-form"
          onSubmit={(event) => { event.preventDefault(); void saveCheckpoint(event.currentTarget); }}
        >
          <Field label="What did you work out?">
            {({ id }) => <Input id={id} name="learned" required minLength={2} maxLength={2000} autoFocus />}
          </Field>
          <Field label="What will you do next?">
            {({ id }) => <Input id={id} name="nextAction" required minLength={2} maxLength={500} />}
          </Field>
          <div className="build-form-actions">
            <Button variant="secondary" onClick={() => setCheckpointOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={checkpointBusy}>{checkpointBusy ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
