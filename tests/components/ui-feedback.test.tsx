import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  Banner,
  DataRegion,
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
  SuccessState,
  ToastProvider,
  useToast,
  type BannerTone,
  type RegionStatus,
} from "@/components/ui/feedback";

describe("EmptyState", () => {
  it("offers exactly one action (§15.8)", () => {
    render(<EmptyState title="No sources yet" body="Add a PDF and Continuum will read it." action={<button type="button">Add a source</button>} />);
    const state = screen.getByRole("status");
    expect(within(state).getByRole("heading", { name: "No sources yet" })).toBeInTheDocument();
    expect(within(state).getAllByRole("button")).toHaveLength(1);
  });

  it("renders with no action at all rather than inventing one", () => {
    render(<EmptyState title="Nothing scheduled today" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveClass("feedback-state-empty");
  });

  it("is announced politely, not assertively", () => {
    render(<EmptyState title="No sources yet" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  it("is announced as an alert and keeps technical detail collapsed", async () => {
    const user = userEvent.setup();
    render(<ErrorState title="Could not reach OpenAlex" body="Your saved papers are unaffected." detail="fetch failed: ETIMEDOUT" action={<button type="button">Try again</button>} />);
    const alert = screen.getByRole("alert");
    expect(within(alert).getByRole("heading", { name: "Could not reach OpenAlex" })).toBeInTheDocument();
    expect(within(alert).getByText("Your saved papers are unaffected.")).toBeInTheDocument();

    const details = alert.querySelector("details")!;
    expect(details).not.toHaveAttribute("open");
    await user.click(within(alert).getByText("Technical details"));
    expect(details).toHaveAttribute("open");
    expect(within(alert).getByText("fetch failed: ETIMEDOUT")).toBeVisible();
  });

  it("renders no details block when there is nothing technical to show", () => {
    render(<ErrorState title="Could not save" />);
    expect(screen.getByRole("alert").querySelector("details")).toBeNull();
  });
});

describe("SuccessState", () => {
  it("renders politely with its action", () => {
    render(<SuccessState title="Week saved" body="12 blocks committed." action={<button type="button">Open plan</button>} />);
    const state = screen.getByRole("status");
    expect(state).toHaveClass("feedback-state-success");
    expect(within(state).getByRole("button", { name: "Open plan" })).toBeInTheDocument();
  });
});

describe("LoadingState", () => {
  it("labels the skeleton variant and renders the requested number of rows", () => {
    render(<LoadingState rows={5} label="Loading your goals" />);
    const state = screen.getByRole("status", { name: "Loading your goals" });
    expect(state.querySelectorAll(".skeleton-row")).toHaveLength(5);
  });

  it("labels the spinner variant with visible text", () => {
    render(<LoadingState variant="spinner" label="Running" />);
    const state = screen.getByRole("status", { name: "Running" });
    expect(state).toHaveClass("loading-state-spinner");
    expect(within(state).getByText("Running")).toBeInTheDocument();
  });
});

describe("Skeleton", () => {
  it("is decorative and takes the shape it is told to take", () => {
    render(<Skeleton height={34} width="72%" radius={8} />);
    const block = document.querySelector<HTMLElement>(".skeleton-row")!;
    expect(block).toHaveAttribute("aria-hidden", "true");
    expect(block.style.height).toBe("34px");
    expect(block.style.width).toBe("72%");
    expect(block.style.borderRadius).toBe("8px");
  });
});

describe("DataRegion", () => {
  const branches = {
    idle: <p>Search to begin</p>,
    error: <p>Search failed</p>,
    empty: <p>No results</p>,
  };

  it.each<RegionStatus>(["idle", "loading", "error", "empty", "ready"])("shows exactly one branch for %s", (status) => {
    render(<DataRegion status={status} {...branches}><p>12 results</p></DataRegion>);
    const region = document.querySelector(".data-region")!;
    expect(region).toHaveClass(`data-region-${status}`);

    const shown = ["Search to begin", "Search failed", "No results", "12 results"].filter((copy) => region.textContent?.includes(copy));
    if (status === "loading") expect(within(region as HTMLElement).getByRole("status")).toBeInTheDocument();
    else expect(shown).toHaveLength(1);
  });

  it("falls back to the shared loading state when the caller supplies none", () => {
    render(<DataRegion status="loading"><p>results</p></DataRegion>);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByText("results")).not.toBeInTheDocument();
  });
});

describe("Banner", () => {
  it.each<BannerTone>(["info", "warning", "danger", "success"])("renders the %s tone", (tone) => {
    render(<Banner tone={tone}>Two migrations are pending.</Banner>);
    const banner = screen.getByText("Two migrations are pending.").closest(".ui-banner")!;
    expect(banner).toHaveClass(`ui-banner-${tone}`);
    // Only a danger banner interrupts; the rest are polite.
    expect(banner).toHaveAttribute("role", tone === "danger" ? "alert" : "status");
  });

  it("carries a title and an action, and can be dismissed", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<Banner title="Reconnect Zotero" action={<button type="button">Reconnect</button>} onDismiss={onDismiss}>Its token expired.</Banner>);
    expect(screen.getByText("Reconnect Zotero")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("has no dismiss control when it cannot be dismissed", () => {
    render(<Banner>Read only.</Banner>);
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
  });
});

function ToastHarness() {
  const toast = useToast();
  return (
    <>
      <button type="button" onClick={() => toast.push({ tone: "success", message: "Week saved" })}>Save</button>
      <button type="button" onClick={() => toast.push({ tone: "error", message: "Could not save" })}>Fail</button>
      <button type="button" onClick={() => toast.push({ tone: "info", message: "Source added", action: { label: "Undo", onSelect: () => toast.push({ tone: "info", message: "Undone" }) } })}>Add</button>
      <button type="button" onClick={() => { for (const n of [1, 2, 3, 4]) toast.push({ tone: "info", message: `Item ${n}` }); }}>Flood</button>
    </>
  );
}

describe("ToastProvider", () => {
  it("announces an error assertively and a success politely", async () => {
    const user = userEvent.setup();
    render(<ToastProvider><ToastHarness /></ToastProvider>);
    await user.click(screen.getByRole("button", { name: "Save" }));
    const success = screen.getByText("Week saved").closest(".ui-toast")!;
    expect(success).toHaveAttribute("aria-live", "polite");

    await user.click(screen.getByRole("button", { name: "Fail" }));
    const failure = screen.getByText("Could not save").closest(".ui-toast")!;
    expect(failure).toHaveAttribute("role", "alert");
    expect(failure).toHaveAttribute("aria-live", "assertive");
  });

  it("deduplicates by message so a repeated action does not stack", async () => {
    const user = userEvent.setup();
    render(<ToastProvider><ToastHarness /></ToastProvider>);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getAllByText("Week saved")).toHaveLength(1);
  });

  it("caps the queue at three", async () => {
    const user = userEvent.setup();
    render(<ToastProvider><ToastHarness /></ToastProvider>);
    await user.click(screen.getByRole("button", { name: "Flood" }));
    expect(within(screen.getByRole("region", { name: "Notifications" })).getAllByRole("status")).toHaveLength(3);
    expect(screen.queryByText("Item 1")).not.toBeInTheDocument();
    expect(screen.getByText("Item 4")).toBeInTheDocument();
  });

  it("runs a toast action and dismisses the toast that carried it", async () => {
    const user = userEvent.setup();
    render(<ToastProvider><ToastHarness /></ToastProvider>);
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByText("Source added")).not.toBeInTheDocument();
    expect(screen.getByText("Undone")).toBeInTheDocument();
  });

  it("auto-dismisses a success but keeps an error until it is acted on", async () => {
    // Driven through the hook rather than userEvent: userEvent's own waits run
    // on the same timers being faked here.
    let push: ReturnType<typeof useToast>["push"] | undefined;
    function Capture() {
      push = useToast().push;
      return null;
    }
    vi.useFakeTimers();
    try {
      render(<ToastProvider><Capture /></ToastProvider>);
      act(() => {
        push!({ tone: "success", message: "Week saved" });
        push!({ tone: "error", message: "Could not save" });
      });
      expect(screen.getByText("Week saved")).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(5_100); });
      expect(screen.queryByText("Week saved")).not.toBeInTheDocument();
      expect(screen.getByText("Could not save")).toBeInTheDocument();
      // An error still standing after well past the longest auto-dismiss.
      act(() => { vi.advanceTimersByTime(60_000); });
      expect(screen.getByText("Could not save")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives a toast carrying an action longer before it disappears", () => {
    let push: ReturnType<typeof useToast>["push"] | undefined;
    function Capture() {
      push = useToast().push;
      return null;
    }
    vi.useFakeTimers();
    try {
      render(<ToastProvider><Capture /></ToastProvider>);
      act(() => {
        push!({ tone: "info", message: "Plain" });
        push!({ tone: "info", message: "Undoable", action: { label: "Undo", onSelect: () => {} } });
      });
      act(() => { vi.advanceTimersByTime(5_100); });
      expect(screen.queryByText("Plain")).not.toBeInTheDocument();
      expect(screen.getByText("Undoable")).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(3_000); });
      expect(screen.queryByText("Undoable")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("can be dismissed by hand", async () => {
    const user = userEvent.setup();
    render(<ToastProvider><ToastHarness /></ToastProvider>);
    await user.click(screen.getByRole("button", { name: "Fail" }));
    await user.click(screen.getByRole("button", { name: "Dismiss notification" }));
    await waitFor(() => expect(screen.queryByText("Could not save")).not.toBeInTheDocument());
  });

  it("refuses to be used outside its provider rather than failing silently", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => render(<ToastHarness />)).toThrow(/useToast must be used inside/);
    } finally {
      quiet.mockRestore();
    }
  });
});
