import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConsolePanel, type ConsoleTab } from "@/components/build/console-panel";
import { CONSOLE_MIN_HEIGHT } from "@/components/build/use-build-layout";
import type { ExecutionResult } from "@/lib/code-execution";

function result(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    id: "run_1",
    language: "python",
    outcome: "success",
    stdout: "Selected: 88, 91, 85\n",
    stderr: "",
    exitCode: 0,
    durationMs: 41,
    executionDurationMs: 41,
    timeoutMs: 5_000,
    timedOut: false,
    tests: [],
    ...overrides,
  };
}

const noop = () => {};

type PanelProps = React.ComponentProps<typeof ConsolePanel>;

function props(overrides: Partial<PanelProps> = {}): PanelProps {
  return {
    height: 240,
    maxHeight: 600,
    onResize: noop,
    tab: "console",
    onTabChange: noop,
    result: undefined,
    source: "print('hi')",
    running: false,
    status: "ready",
    announcement: "",
    stdin: "",
    onStdinChange: noop,
    timeoutMs: 5_000,
    onTimeoutChange: noop,
    historyCount: 0,
    canRun: true,
    onAsk: noop,
    onJump: noop,
    onRerun: noop,
    onClear: noop,
    onCopyOutput: noop,
    onOpenHistory: noop,
    onImport: noop,
    onDownload: noop,
    onReset: noop,
    ...overrides,
  };
}

function panel(overrides: Partial<PanelProps> = {}) {
  return render(<ConsolePanel {...props(overrides)} />);
}

describe("ConsolePanel — always present (C7)", () => {
  it("renders its own named region whether or not anything has run", () => {
    panel();
    const console_ = screen.getByRole("region", { name: "Console" });
    expect(within(console_).getByRole("tab", { name: "Console" })).toHaveAttribute("aria-selected", "true");
    expect(within(console_).getByRole("tabpanel")).toBeInTheDocument();
  });

  it("invites a run rather than showing an empty black box", () => {
    panel();
    expect(screen.getByRole("heading", { name: "Press Run to see what this does." })).toBeInTheDocument();
    expect(screen.getByText("Not run yet")).toBeInTheDocument();
  });

  it("offers Input as a tab of the same region, not a competing panel with its own Run", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [tab, setTab] = useState<ConsoleTab>("console");
      return <ConsolePanel {...props({ tab, onTabChange: setTab })} />;
    }
    render(<Harness />);
    await user.click(screen.getByRole("tab", { name: "Input" }));
    expect(screen.getByLabelText("Program input")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Console" })).queryByRole("button", { name: /^Run/ })).not.toBeInTheDocument();
  });

  it("reports how many lines of stdin are queued", () => {
    panel({ stdin: "3\n7\n11\n" });
    expect(screen.getByText("stdin: 3 lines")).toBeInTheDocument();
  });

  it("has one Ask control and no second chat surface (§14.3)", async () => {
    const user = userEvent.setup();
    const onAsk = vi.fn();
    panel({ onAsk });
    expect(screen.queryByRole("tab", { name: /Assistant|AI/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(onAsk).toHaveBeenCalledWith("Review my code");
  });
});

describe("ConsolePanel — run states", () => {
  it("names the stage while a run is in flight and suppresses stale output", () => {
    panel({ running: true, status: "loading_python", result: result() });
    expect(screen.getByRole("region", { name: "Console" })).toHaveClass("build-console-live");
    expect(screen.getAllByText("Starting Python…").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Selected: 88/)).not.toBeInTheDocument();
  });

  it("reports success with the output in a polite live region", () => {
    panel({ result: result(), announcement: "Run complete in 41 ms" });
    const log = screen.getByRole("log");
    expect(log).toHaveAttribute("aria-live", "polite");
    expect(within(log).getByText("Run complete")).toBeInTheDocument();
    expect(within(log).getByText(/Selected: 88, 91, 85/)).toBeInTheDocument();
    expect(within(log).getByText("Run complete in 41 ms")).toHaveClass("sr-only");
    expect(screen.getByText("Completed · 41ms")).toBeInTheDocument();
  });

  it("leads a runtime error with the line number and a way to reach it", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    const onAsk = vi.fn();
    panel({
      onJump,
      onAsk,
      source: "a = 1\nprint(1 / 0)\n",
      result: result({ outcome: "runtime_error", stdout: "", exitCode: 1, stderr: 'File "main.py", line 2, in <module>\nZeroDivisionError: division by zero' }),
    });
    // The headline leads with the failure and the offending line, ahead of the
    // traceback; the status chip repeats the outcome word with a duration.
    expect(document.querySelector(".build-error-headline strong")).toHaveTextContent(/line 2$/);
    expect(screen.getByText(/^Runtime error · /)).toBeInTheDocument();
    const jump = screen.getByRole("button", { name: /Go to line 2/ });
    await user.click(jump);
    expect(onJump).toHaveBeenCalledWith(2);
    await user.click(screen.getByRole("button", { name: "Explain this error" }));
    expect(onAsk).toHaveBeenCalledWith("Explain this error");
  });

  it("keeps the raw traceback behind a disclosure", async () => {
    const user = userEvent.setup();
    panel({ result: result({ outcome: "compiler_error", stdout: "", exitCode: 1, stderr: "SyntaxError: unexpected EOF while parsing" }) });
    const details = screen.getByText("Full traceback").closest("details")!;
    expect(details).not.toHaveAttribute("open");
    await user.click(screen.getByText("Full traceback"));
    expect(details).toHaveAttribute("open");
  });

  it("offers a bigger limit only when the run timed out", async () => {
    const user = userEvent.setup();
    const onTimeoutChange = vi.fn();
    const { unmount } = panel({ onTimeoutChange, result: result({ outcome: "timeout", stdout: "", timedOut: true, timeoutMs: 5_000 }) });
    await user.click(screen.getByRole("button", { name: "Increase limit" }));
    expect(onTimeoutChange).toHaveBeenCalledWith(10_000);
    unmount();

    panel({ result: result({ outcome: "runtime_error", stderr: "boom" }) });
    expect(screen.queryByRole("button", { name: "Increase limit" })).not.toBeInTheDocument();
  });

  it("says a stop was a stop, not a failure", () => {
    panel({ result: result({ outcome: "stopped", stdout: "", terminated: true }) });
    expect(screen.getByText("Program stopped")).toBeInTheDocument();
    expect(screen.getByText("Stopped · 41ms")).toBeInTheDocument();
  });

  it("says so when a successful run printed nothing", () => {
    panel({ result: result({ stdout: "" }) });
    expect(screen.getByText("Completed without printable output.")).toBeInTheDocument();
  });
});

describe("ConsolePanel — options menu", () => {
  it("explains every disabled option instead of silently greying it out", async () => {
    const user = userEvent.setup();
    panel({ result: undefined, historyCount: 0, canRun: false });
    await user.click(screen.getByRole("button", { name: "Console options" }));
    const menu = await screen.findByRole("menu", { name: "Console options" });
    for (const [label, reason] of [
      ["Rerun", "Write some code in a runnable language first."],
      ["Clear console", "There is no output to clear."],
      ["Copy output", "Run the program first."],
      ["Previous runs (0)", "No runs recorded in this session yet."],
    ]) {
      const item = within(menu).getByRole("menuitem", { name: label });
      expect(item).toBeDisabled();
      expect(item).toHaveAttribute("title", reason);
    }
  });

  it("enables the same options once a run exists", async () => {
    const user = userEvent.setup();
    panel({ result: result(), historyCount: 2, canRun: true });
    await user.click(screen.getByRole("button", { name: "Console options" }));
    const menu = await screen.findByRole("menu", { name: "Console options" });
    for (const label of ["Rerun", "Clear console", "Copy output", "Previous runs (2)"]) {
      expect(within(menu).getByRole("menuitem", { name: label })).toBeEnabled();
    }
  });

  it("offers every run limit and ticks the active one", async () => {
    const user = userEvent.setup();
    const onTimeoutChange = vi.fn();
    panel({ timeoutMs: 10_000, onTimeoutChange });
    await user.click(screen.getByRole("button", { name: "Console options" }));
    const menu = await screen.findByRole("menu", { name: "Console options" });
    for (const label of ["Run limit: 5s", "Run limit: 10s", "Run limit: 30s"]) {
      expect(within(menu).getByRole("menuitem", { name: label })).toBeInTheDocument();
    }
    await user.click(within(menu).getByRole("menuitem", { name: "Run limit: 30s" }));
    expect(onTimeoutChange).toHaveBeenCalledWith(30_000);
  });
});

describe("ConsolePanel — resizer", () => {
  it("is a focusable separator that publishes its bounds", () => {
    panel({ height: 240, maxHeight: 600 });
    const resizer = screen.getByRole("separator", { name: "Resize console" });
    expect(resizer).toHaveAttribute("tabindex", "0");
    expect(resizer).toHaveAttribute("aria-valuenow", "240");
    expect(resizer).toHaveAttribute("aria-valuemin", String(CONSOLE_MIN_HEIGHT));
    expect(resizer).toHaveAttribute("aria-valuemax", "600");
  });

  it("resizes with the arrow keys, so a drag is not the only way", async () => {
    const user = userEvent.setup();
    const onResize = vi.fn();
    panel({ height: 240, maxHeight: 600, onResize });
    const resizer = screen.getByRole("separator", { name: "Resize console" });
    resizer.focus();
    await user.keyboard("{ArrowUp}");
    expect(onResize).toHaveBeenLastCalledWith(256);
    await user.keyboard("{ArrowDown}");
    expect(onResize).toHaveBeenLastCalledWith(224);
  });

  it("clamps keyboard resizing to the region's own bounds", async () => {
    const user = userEvent.setup();
    const onResize = vi.fn();
    const { unmount } = panel({ height: 600, maxHeight: 600, onResize });
    screen.getByRole("separator", { name: "Resize console" }).focus();
    await user.keyboard("{ArrowUp}");
    expect(onResize).toHaveBeenLastCalledWith(600);
    unmount();

    panel({ height: CONSOLE_MIN_HEIGHT, maxHeight: 600, onResize });
    screen.getByRole("separator", { name: "Resize console" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(onResize).toHaveBeenLastCalledWith(CONSOLE_MIN_HEIGHT);
  });
});
