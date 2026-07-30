import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommandPalette, type PaletteAction } from "@/components/shell/command-palette";
import type { SearchHit } from "@/lib/workspace-routes";

const routerPush = vi.fn();
// `next/navigation` reads an App Router context no unit test can mount. This is
// the one dependency of the palette that is not its own logic.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }) }));

const GOALS = [{ id: "goal_demo_sat", title: "SAT maths" }, { id: "goal_demo_phys", title: "Physics olympiad" }];
const PROJECTS = [{ id: "project_demo_oasis", title: "Oasis review" }];

function action(overrides: Partial<PaletteAction> = {}): PaletteAction {
  return { id: "review", label: "Review proposals", hint: "Approve or reject pending changes", run: vi.fn(), ...overrides };
}

function hit(overrides: Partial<SearchHit> & Pick<SearchHit, "kind" | "id" | "title">): SearchHit {
  return { snippet: "", context: "Source", updatedAt: "2026-06-01T00:00:00.000Z", ...overrides };
}

/** Every remote search resolves to this until a test replaces it. */
let remoteResults: SearchHit[] = [];
let remoteOk = true;

beforeEach(() => {
  remoteResults = [];
  remoteOk = true;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    expect(String(input)).toContain("/api/search?q=");
    if (!remoteOk) return new Response("nope", { status: 500 });
    return new Response(JSON.stringify({ results: remoteResults }), { status: 200, headers: { "content-type": "application/json" } });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Harness({
  actions = [action()],
  onNavigate = vi.fn(),
}: { actions?: PaletteAction[]; onNavigate?: (view: string) => void } = {}) {
  const [open, setOpen] = useState(false);
  return (
    // ⌘K is bound by the shell, not by the palette, so the harness supplies it.
    // It is also the only way in once the palette is open: a modal dialog marks
    // the rest of the document `aria-hidden`, which is correct behaviour.
    <div onKeyDown={(event) => { if (event.key === "k" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); setOpen(true); } }}>
      <input aria-label="Composer" />
      <button type="button" onClick={() => setOpen(true)}>Open search</button>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        actions={actions}
        goals={GOALS}
        projects={PROJECTS}
        onNavigate={onNavigate as never}
      />
    </div>
  );
}

async function openPalette(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Open search" }));
  return screen.findByRole("listbox", { name: "Search results" });
}

describe("CommandPalette — grouping", () => {
  it("groups rows under section headings, actions first", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const listbox = await openPalette(user);
    const headings = [...listbox.querySelectorAll(".command-section > p")].map((node) => node.textContent);
    expect(headings[0]).toBe("Actions");
    expect(headings).toEqual(expect.arrayContaining(["Actions", "Goals", "Projects", "Go to"]));
  });

  it("answers from local shell data before the network responds", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPalette(user);
    await user.keyboard("SAT");
    expect(screen.getByRole("option", { name: /SAT maths/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Physics olympiad/ })).not.toBeInTheDocument();
  });

  it("merges remote hits into their own §8.4 sections", async () => {
    remoteResults = [
      hit({ kind: "source", id: "source_1", title: "Halliday ch. 24", context: "Source · PDF" }),
      hit({ kind: "conversation", id: "conv_1", title: "Week 3 review", context: "Conversation" }),
      hit({ kind: "concept", id: "concept_1", title: "Electric potential", context: "Concept" }),
    ];
    const user = userEvent.setup();
    render(<Harness />);
    const listbox = await openPalette(user);
    await user.keyboard("potential");
    await waitFor(() => expect(screen.getByRole("option", { name: /Electric potential/ })).toBeInTheDocument());
    const headings = [...listbox.querySelectorAll(".command-section > p")].map((node) => node.textContent);
    expect(headings).toEqual(expect.arrayContaining(["Sources & papers", "Conversations", "Concepts"]));
  });

  it("does not list a goal twice when the server returns it too", async () => {
    remoteResults = [hit({ kind: "goal", id: "goal_demo_sat", title: "SAT maths", context: "Goal" })];
    const user = userEvent.setup();
    render(<Harness />);
    await openPalette(user);
    await user.keyboard("SAT");
    await waitFor(() => expect(screen.getAllByRole("option", { name: /SAT maths/ })).toHaveLength(1));
  });

  it("keeps local results and says so quietly when search is unavailable", async () => {
    remoteOk = false;
    const user = userEvent.setup();
    render(<Harness />);
    await openPalette(user);
    await user.keyboard("SAT");
    await waitFor(() => expect(screen.getByText("Some results unavailable.")).toBeInTheDocument());
    expect(screen.getByRole("option", { name: /SAT maths/ })).toBeInTheDocument();
  });

  it("does not query the server for a one-character query", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPalette(user);
    await user.keyboard("S");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("names the query when nothing matches", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPalette(user);
    await user.keyboard("zzzznothing");
    await waitFor(() => expect(screen.getByText(/No match for/)).toHaveTextContent("zzzznothing"));
  });
});

describe("CommandPalette — keyboard", () => {
  it("wraps in both directions with the arrow keys and tracks the active option", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const listbox = await openPalette(user);

    const options = () => within(listbox).getAllByRole("option");
    expect(options()[0]).toHaveAttribute("aria-selected", "true");

    const count = options().length;
    expect(count).toBeGreaterThan(1);

    await user.keyboard("{ArrowUp}");
    expect(options()[count - 1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(options()[0]).toHaveAttribute("aria-selected", "true");

    for (let step = 0; step < count; step += 1) await user.keyboard("{ArrowDown}");
    expect(options()[0]).toHaveAttribute("aria-selected", "true");
  });

  it("points aria-activedescendant at the active row so the input announces it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const listbox = await openPalette(user);
    const input = screen.getByRole("textbox", { name: "Search your workspace" });
    const first = within(listbox).getAllByRole("option")[0]!;
    expect(input).toHaveAttribute("aria-activedescendant", first.id);
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", within(listbox).getAllByRole("option")[1]!.id);
  });

  it("runs the highlighted action on Enter and closes", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    render(<Harness actions={[action({ run })]} />);
    await openPalette(user);
    await user.keyboard("Review{Enter}");
    expect(run).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("navigates to a destination view rather than pushing a URL for it", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<Harness actions={[]} onNavigate={onNavigate} />);
    await openPalette(user);
    await user.keyboard("Build");
    await user.click(screen.getByRole("option", { name: /Build/ }));
    expect(onNavigate).toHaveBeenCalledWith("code");
  });

  it("Escape closes and returns focus to where the user was", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const composer = screen.getByRole("textbox", { name: "Composer" });
    composer.focus();
    await user.keyboard("{Meta>}k{/Meta}");
    await screen.findByRole("listbox", { name: "Search results" });

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    await waitFor(() => expect(composer).toHaveFocus());
  });

  it("forgets the previous query when reopened", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPalette(user);
    await user.keyboard("SAT");
    expect(screen.getByRole("textbox", { name: "Search your workspace" })).toHaveValue("SAT");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    await openPalette(user);
    expect(screen.getByRole("textbox", { name: "Search your workspace" })).toHaveValue("");
  });

  it("promises it will not change anything", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPalette(user);
    expect(screen.getByText("Search opens the matching record; it never changes your data.")).toBeInTheDocument();
  });
});

describe("CommandPalette — caps", () => {
  it("shows at most five rows per section (§8.4)", async () => {
    remoteResults = Array.from({ length: 9 }, (_, index) => hit({ kind: "source", id: `source_${index}`, title: `Source ${index}`, context: "Source" }));
    const user = userEvent.setup();
    render(<Harness />);
    const listbox = await openPalette(user);
    await user.keyboard("Source");
    await waitFor(() => expect(screen.getByRole("option", { name: /Source 0/ })).toBeInTheDocument());
    const section = [...listbox.querySelectorAll(".command-section")].find((node) => node.querySelector("p")?.textContent === "Sources & papers")!;
    expect(within(section as HTMLElement).getAllByRole("option")).toHaveLength(5);
  });
});
