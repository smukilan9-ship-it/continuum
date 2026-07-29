"use client";

import { Check, Copy, Download, FileUp, History, MoreHorizontal, RefreshCw, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { useRef, type PointerEvent as ReactPointerEvent } from "react";

import { Button, IconButton, Menu, StatusChip, Tabs, Textarea } from "@/components/ui";
import { EXECUTION_LIMITS, type ExecutionResult, type ExecutionStatus } from "@/lib/code-execution";

import { RUN_LIMITS, runLimitLabel } from "./language";
import { RunStatus, RuntimeOutput } from "./runtime-output";
import { CONSOLE_MIN_HEIGHT } from "./use-build-layout";

export type ConsoleTab = "console" | "io";

/**
 * The console: a first-class, always-visible, resizable bottom region
 * (redesign.md §14.3). This is the single most important change in the screen.
 *
 * It fixes C7. At 1280×720 the old layout stacked rail → editor → console, and
 * the editor's 480px minimum pushed the console to 785px inside a frame that
 * does not scroll — so pressing Run left the viewport visually identical and
 * the program looked like it had never executed. The console now owns a region
 * of its own (240px by default, 120 minimum, 60% maximum, persisted), so a run
 * always produces a visible change in the same viewport.
 *
 * **Input** is a tab here rather than a separate panel, because that panel
 * carried a second Run button executing the same program with the same stdin.
 * **Ask** is a button rather than a tab: one assistant across the product.
 */
export function ConsolePanel({
  height,
  maxHeight,
  onResize,
  tab,
  onTabChange,
  result,
  source,
  running,
  status,
  announcement,
  stdin,
  onStdinChange,
  timeoutMs,
  onTimeoutChange,
  historyCount,
  canRun,
  onAsk,
  onJump,
  onRerun,
  onClear,
  onCopyOutput,
  onOpenHistory,
  onImport,
  onDownload,
  onReset,
}: {
  height: number;
  maxHeight: number;
  onResize: (next: number) => void;
  tab: ConsoleTab;
  onTabChange: (next: ConsoleTab) => void;
  result: ExecutionResult | undefined;
  source: string;
  running: boolean;
  status: ExecutionStatus;
  announcement: string;
  stdin: string;
  onStdinChange: (next: string) => void;
  timeoutMs: number;
  onTimeoutChange: (next: number) => void;
  historyCount: number;
  canRun: boolean;
  onAsk: (intent: string) => void;
  onJump: (line: number) => void;
  onRerun: () => void;
  onClear: () => void;
  onCopyOutput: () => void;
  onOpenHistory: () => void;
  onImport: () => void;
  onDownload: () => void;
  onReset: () => void;
}) {
  const dragRef = useRef<{ startY: number; startHeight: number }>(undefined);
  const stdinLines = stdin.trim() ? stdin.trim().split("\n").length : 0;

  function beginResize(event: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current = { startY: event.clientY, startHeight: height };
    const move = (moveEvent: PointerEvent) => {
      const origin = dragRef.current;
      if (!origin) return;
      // The console grows upward, so dragging toward the top adds height.
      onResize(Math.min(maxHeight, Math.max(CONSOLE_MIN_HEIGHT, origin.startHeight + (origin.startY - moveEvent.clientY))));
    };
    const stop = () => {
      dragRef.current = undefined;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  const runLimitItems = RUN_LIMITS.map((limit) => ({
    label: `Run limit: ${runLimitLabel(limit)}`,
    onSelect: () => onTimeoutChange(limit),
    icon: timeoutMs === limit ? <Check size={14} /> : <span className="build-menu-spacer" />,
  }));

  // Height comes from `--build-console-h` on the frame rather than an inline
  // style, so the compact layout can hand the console the whole pane without
  // fighting a more specific inline rule.
  return (
    <section className={running ? "build-console build-console-live" : "build-console"} aria-label="Console">
      {/* Resizable with the pointer and with the keyboard — a drag-only handle
          is unusable for anyone who cannot drag (§15.11). */}
      <div
        className="build-console-resizer"
        role="separator"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label="Resize console"
        aria-valuenow={height}
        aria-valuemin={CONSOLE_MIN_HEIGHT}
        aria-valuemax={maxHeight}
        onPointerDown={beginResize}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") { event.preventDefault(); onResize(Math.min(maxHeight, height + 16)); }
          if (event.key === "ArrowDown") { event.preventDefault(); onResize(Math.max(CONSOLE_MIN_HEIGHT, height - 16)); }
        }}
      />

      <header className="build-console-header">
        <Tabs
          value={tab}
          onChange={(next) => onTabChange(next as ConsoleTab)}
          label="Console panels"
          variant="segmented"
          className="build-console-tabs"
          options={[
            { value: "console", label: "Console", panelId: "build-console-panel" },
            { value: "io", label: "Input", panelId: "build-input-panel" },
          ]}
        />

        <div className="build-console-meta">
          <RunStatus result={result} running={running} status={status} />
          {stdinLines ? <StatusChip tone="neutral" label={`stdin: ${stdinLines} line${stdinLines === 1 ? "" : "s"}`} /> : null}
        </div>

        <div className="build-console-controls">
          {/*
            TODO(§8.5): wire this to the global ⌘J assistant panel once
            `components/assistant/assistant-panel.tsx` exists. The panel opens
            with the current file, the last run's result, and the error attached
            as context chips, and renders the contextual starters as suggestion
            chips. Deliberately no chat UI here — §14.3 removes the third-tab
            coach precisely so there is one assistant across the product.
          */}
          <Button variant="quiet" size="sm" className="build-ask" onClick={() => onAsk("Review my code")}>
            <Sparkles size={14} aria-hidden="true" />Ask
          </Button>

          <Menu
            label="Console options"
            items={[
              { label: "Rerun", onSelect: onRerun, icon: <RefreshCw size={14} />, disabled: !canRun, disabledReason: "Write some code in a runnable language first." },
              { label: "Clear console", onSelect: onClear, icon: <Trash2 size={14} />, disabled: !result, disabledReason: "There is no output to clear." },
              { label: "Copy output", onSelect: onCopyOutput, icon: <Copy size={14} />, disabled: !result, disabledReason: "Run the program first." },
              { label: `Previous runs (${historyCount})`, onSelect: onOpenHistory, icon: <History size={14} />, disabled: !historyCount, disabledReason: "No runs recorded in this session yet." },
              ...runLimitItems,
              { label: "Import file", onSelect: onImport, icon: <FileUp size={14} /> },
              { label: "Download", onSelect: onDownload, icon: <Download size={14} /> },
              { label: "Reset workspace", onSelect: onReset, icon: <RotateCcw size={14} />, destructive: true },
            ]}
            trigger={<IconButton label="Console options" size={28}><MoreHorizontal size={16} /></IconButton>}
          />
        </div>
      </header>

      {tab === "console" ? (
        <div id="build-console-panel" role="tabpanel" aria-labelledby="build-console-panel-tab" className="build-console-scroll">
          <RuntimeOutput
            result={result}
            source={source}
            running={running}
            status={status}
            announcement={announcement}
            onAsk={onAsk}
            onJump={onJump}
            onIncreaseLimit={() => onTimeoutChange(RUN_LIMITS.find((limit) => limit > timeoutMs) ?? RUN_LIMITS[RUN_LIMITS.length - 1]!)}
          />
        </div>
      ) : (
        <div id="build-input-panel" role="tabpanel" aria-labelledby="build-input-panel-tab" className="build-console-scroll">
          <div className="build-stdin">
            <label htmlFor="build-stdin-field">Program input</label>
            <Textarea
              id="build-stdin-field"
              value={stdin}
              maxLength={EXECUTION_LIMITS.maxStdinCharacters}
              onChange={(event) => onStdinChange(event.target.value)}
              placeholder="Put each response on a new line"
            />
            <p>Values are handed to <code>input()</code> or the selected runtime. Nothing here is sent to AI. Use Run to execute with this input.</p>
          </div>
        </div>
      )}
    </section>
  );
}
