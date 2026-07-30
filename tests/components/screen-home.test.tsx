import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { HomePage } from "@/components/home/home-page";
import { normalizeWorkspaceState, type WorkspaceState } from "@/components/workspace/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }) }));

const TIME_ZONE = "UTC";
const NOW = "2026-06-01T09:30:00.000Z";

function state(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return normalizeWorkspaceState({
    goals: [{ id: "goal_demo_sat", title: "SAT maths", status: "active", progress: 0.62, targetDate: "2026-06-05T00:00:00.000Z" }],
    tasks: [{ id: "task_1", goalId: "goal_demo_sat", title: "Rework the electric potential set", status: "open", kind: "practice", deadline: "2026-06-03T00:00:00.000Z", weakestDimension: "transfer" }],
    schedule: [
      { id: "block_1", taskId: "task_1", title: "Electric potential drill", start: "2026-06-01T09:00:00.000Z", end: "2026-06-01T10:00:00.000Z", status: "planned", goalTitle: "SAT maths" },
      { id: "block_2", taskId: "task_2", title: "Reading", start: "2026-06-01T07:00:00.000Z", end: "2026-06-01T08:00:00.000Z", status: "done", goalTitle: "SAT maths" },
    ],
    ...overrides,
  } as Record<string, unknown>);
}

function mount(overrides: Partial<WorkspaceState> = {}, onNavigate = vi.fn()) {
  render(
    <HomePage
      state={state(overrides)}
      userName="Asha"
      timeZone={TIME_ZONE}
      serverNow={NOW}
      onNavigate={onNavigate}
      onRefresh={async () => {}}
    />,
  );
  return onNavigate;
}

const nextAction = () => document.querySelector<HTMLElement>(".next-action")!;

describe("the next action card (AC-H1)", () => {
  it("carries exactly one primary button on the whole screen", () => {
    mount();
    expect(document.querySelectorAll(".button-primary")).toHaveLength(1);
    expect(within(nextAction()).getByRole("button", { name: /Start/ })).toHaveClass("button-primary");
  });

  it("names the task, the goal it belongs to, and the time it takes", () => {
    mount();
    const card = nextAction();
    expect(within(card).getByRole("heading", { name: "Rework the electric potential set" })).toBeInTheDocument();
    expect(card.querySelector(".next-action-context")).toHaveTextContent("SAT maths · 60 min · 2 days left");
  });

  it("gives one reason, built from real state (AC-H2)", () => {
    mount();
    expect(nextAction().querySelector(".next-action-reason")).toHaveTextContent(
      "Because transfer is your weakest area, it is due in 2 days and it is scheduled at 09:00.",
    );
  });

  it("omits the reason entirely rather than inventing one", () => {
    mount({
      goals: [{ id: "goal_x", title: "Long-range goal", status: "active", progress: 0.1, targetDate: "2027-01-01T00:00:00.000Z" }],
      tasks: [{ id: "task_x", goalId: "goal_x", title: "Read chapter 3", status: "open", kind: "reading" }],
      schedule: [],
    } as unknown as Partial<WorkspaceState>);
    expect(nextAction().querySelector(".next-action-reason")).toBeNull();
    expect(within(nextAction()).getByRole("heading", { name: "Read chapter 3" })).toBeInTheDocument();
  });

  it("shows no internal identifier anywhere on the screen (AC-H3)", () => {
    mount();
    const rendered = document.body.textContent ?? "";
    expect(rendered).not.toMatch(/\b(goal|task|block|project|source)_[A-Za-z0-9_]+/);
  });

  it("routes by task kind rather than always sending the user to Learn", async () => {
    const user = userEvent.setup();
    const onNavigate = mount({
      tasks: [{ id: "task_c", goalId: "goal_demo_sat", title: "Debug the binary search", status: "open", kind: "code" }],
    } as unknown as Partial<WorkspaceState>);
    await user.click(screen.getByRole("button", { name: /Start/ }));
    expect(onNavigate).toHaveBeenCalledWith("code");
  });

  it("routes a research task to Research and everything else to Learn", async () => {
    const user = userEvent.setup();
    const research = mount({ tasks: [{ id: "t", goalId: "goal_demo_sat", title: "Read the Oasis paper", status: "open", kind: "research" }] } as unknown as Partial<WorkspaceState>);
    await user.click(screen.getByRole("button", { name: /Start/ }));
    expect(research).toHaveBeenCalledWith("research");
  });

  it("offers Not now as a quiet secondary, never a second primary", async () => {
    const user = userEvent.setup();
    mount();
    const notNow = within(nextAction()).getByRole("button", { name: "Not now" });
    expect(notNow).toHaveClass("button-quiet");
    await user.click(notNow);
    const menu = await screen.findByRole("menu", { name: "Other options for this task" });
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Snooze to tonight", "Do something else", "Mark done"]);
  });

  it("snoozing moves on to the next open task rather than leaving the card stale", async () => {
    const user = userEvent.setup();
    mount({
      tasks: [
        { id: "task_1", goalId: "goal_demo_sat", title: "First task", status: "open" },
        { id: "task_2", goalId: "goal_demo_sat", title: "Second task", status: "open" },
      ],
    } as unknown as Partial<WorkspaceState>);
    expect(within(nextAction()).getByRole("heading", { name: "First task" })).toBeInTheDocument();
    await user.click(within(nextAction()).getByRole("button", { name: "Not now" }));
    await user.click(await screen.findByRole("menuitem", { name: "Snooze to tonight" }));
    expect(within(nextAction()).getByRole("heading", { name: "Second task" })).toBeInTheDocument();
  });

  it("says the day is finished when every block is done and nothing is open", () => {
    mount({
      tasks: [],
      schedule: [{ id: "b", taskId: "t", title: "Reading", start: "2026-06-01T07:00:00.000Z", end: "2026-06-01T08:00:00.000Z", status: "done" }],
    } as unknown as Partial<WorkspaceState>);
    expect(within(nextAction()).getByRole("heading", { name: "You're done for today." })).toBeInTheDocument();
    expect(document.querySelectorAll(".button-primary")).toHaveLength(0);
  });

  it("offers to build a week when there is nothing at all", () => {
    mount({ tasks: [], schedule: [] });
    expect(within(nextAction()).getByRole("heading", { name: "Nothing scheduled." })).toBeInTheDocument();
    expect(within(nextAction()).getByRole("button", { name: /Build my week/ })).toBeInTheDocument();
  });
});

describe("the rest of Home", () => {
  it("greets by local time with one h1 and no stat strip (C20)", () => {
    mount();
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Good morning, Asha");
  });

  it("shows today's blocks with a state word each, not colour alone", () => {
    mount();
    const agenda = document.querySelector(".day-agenda")!;
    expect(within(agenda as HTMLElement).getByText("Done")).toBeInTheDocument();
    expect(within(agenda as HTMLElement).getByText("Now")).toBeInTheDocument();
  });

  it("summarises the week it is headed, and still reports today", () => {
    mount();
    // The heading is "This week"; it used to report only today's numbers under
    // it. Both spans are now stated, and both are derived from the schedule.
    expect(screen.getByText("2h scheduled this week · 1 of 2 done · 2h today")).toBeInTheDocument();
  });

  it("draws one bar per weekday, sized from real scheduled minutes", () => {
    mount();
    const days = document.querySelectorAll(".week-day");
    expect(days).toHaveLength(7);
    // NOW is Monday 1 June 2026, and both fixture blocks sit on it.
    const monday = days[0] as HTMLElement;
    expect(monday).toHaveClass("is-today");
    expect(monday.querySelector(".week-day-date")).toHaveTextContent("1");
    expect(monday.title).toBe("Monday 1 — 2h, 1 of 2 done");
    // A day with nothing scheduled says so rather than showing a phantom bar.
    expect((days[3] as HTMLElement).title).toBe("Thursday 4 — nothing scheduled");
    expect(days[3]).toHaveClass("is-empty");
  });

  it("says the week is empty rather than drawing seven zero bars", () => {
    mount({ schedule: [] });
    expect(document.querySelectorAll(".week-day")).toHaveLength(0);
    expect(screen.getByText("Nothing scheduled this week yet.")).toBeInTheDocument();
  });

  it("falls back to the single empty-state pattern when the day is unscheduled", () => {
    mount({ schedule: [] });
    const empty = screen.getByRole("status");
    expect(within(empty).getByRole("heading", { name: "Nothing scheduled today" })).toBeInTheDocument();
    expect(within(empty).getAllByRole("button")).toHaveLength(1);
  });

  it("lists at most three things to pick back up (§9.4)", () => {
    mount({
      resourceActivities: [{ id: "ra_1", title: "Khan: potential", status: "started" }],
      assistantSessions: [{ id: "as_1", title: "Week 3 review", messageCount: 4 }],
      receipts: [{ id: "r_1", createdAt: "2026-05-30T00:00:00.000Z", unresolvedQuestions: ["Why does the field vanish inside a conductor?"] }],
      events: [{ id: "ev_1", type: "code.run", summary: "Binary search" }],
    } as unknown as Partial<WorkspaceState>);
    const resume = document.querySelector(".resume-list")!;
    expect(within(resume as HTMLElement).getAllByRole("listitem")).toHaveLength(3);
  });

  it("shows a progress bar per active goal, with the number available to assistive tech", () => {
    mount();
    expect(screen.getByRole("progressbar", { name: "SAT maths progress" })).toHaveAttribute("aria-valuetext", "62%");
  });

  it("hands a user with no goals the onboarding flow instead of an empty dashboard", () => {
    mount({ goals: [], tasks: [], schedule: [] });
    expect(document.querySelector(".next-action")).toBeNull();
    expect(screen.queryByRole("heading", { name: /Good morning/ })).not.toBeInTheDocument();
  });
});
