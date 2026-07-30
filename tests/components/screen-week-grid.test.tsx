import type { ScheduleBlock } from "@continuum/schemas";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { useBlockMove } from "@/components/plan/use-block-move";
import { WeekGrid, type PlanBlock } from "@/components/plan/week-grid";

/**
 * Everything is built in the machine's own zone and rendered in it, so the day
 * columns and the `HH:MM` labels agree wherever the suite runs. 1 June 2026 is a
 * Monday, which fixes the weekday names.
 */
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const WEEK = Array.from({ length: 7 }, (_, index) => new Date(2026, 5, 1 + index, 12));
const at = (day: number, hour: number, minute = 0) => new Date(2026, 5, day, hour, minute).toISOString();
const TODAY_KEY = "2026-06-01";

function block(overrides: Partial<PlanBlock> = {}): PlanBlock {
  return {
    id: "block_one",
    taskId: "task_one",
    title: "Electric potential",
    start: at(1, 9),
    end: at(1, 10),
    status: "planned",
    flexible: true,
    completionEvidenceRequired: false,
    ...overrides,
  };
}

function describeBlock(candidate: ScheduleBlock) {
  return `${candidate.title} at ${candidate.start}`;
}

/** The real hook wired to the real grid — the keyboard path under test. */
function MovableWeek({ onCommit }: { onCommit: (next: ScheduleBlock) => void }) {
  const [blocks, setBlocks] = useState<PlanBlock[]>([block()]);
  const move = useBlockMove({
    onCommit: (next) => {
      setBlocks((current) => current.map((item) => (item.id === next.id ? { ...item, ...next } : item)));
      onCommit(next);
    },
    describe: describeBlock,
  });
  const rendered = move.preview ? blocks.map((item) => (item.id === move.preview!.id ? { ...item, ...move.preview! } : item)) : blocks;
  return (
    <>
      <div role="status">{move.announcement}</div>
      <WeekGrid
        week={WEEK}
        timeZone={TIME_ZONE}
        blocks={rendered}
        commitments={[]}
        draft
        overlapIds={new Set()}
        movingId={move.movingId}
        todayKey={TODAY_KEY}
        onSelect={() => {}}
        onKeyDown={move.onKeyDown}
      />
    </>
  );
}

describe("WeekGrid", () => {
  it("renders seven named day lists so a screen reader gets a sequence, not absolute divs", () => {
    render(<WeekGrid week={WEEK} timeZone={TIME_ZONE} blocks={[block()]} commitments={[]} draft={false} overlapIds={new Set()} movingId="" todayKey={TODAY_KEY} />);
    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(7);
    expect(within(screen.getByRole("list", { name: "Blocks on Mon" })).getByText("Electric potential")).toBeInTheDocument();
  });

  it("places a block in the column for its own day", () => {
    render(
      <WeekGrid
        week={WEEK}
        timeZone={TIME_ZONE}
        blocks={[block(), block({ id: "block_two", title: "Kinematics", start: at(4, 14), end: at(4, 15) })]}
        commitments={[]}
        draft={false}
        overlapIds={new Set()}
        movingId=""
        todayKey={TODAY_KEY}
      />,
    );
    expect(within(screen.getByRole("list", { name: "Blocks on Mon" })).getByText("Electric potential")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Blocks on Thu" })).getByText("Kinematics")).toBeInTheDocument();
  });

  it("sizes a block by its duration rather than a fixed card height", () => {
    render(
      <WeekGrid
        week={WEEK}
        timeZone={TIME_ZONE}
        blocks={[block(), block({ id: "block_two", title: "Long session", start: at(2, 9), end: at(2, 12) })]}
        commitments={[]}
        draft={false}
        overlapIds={new Set()}
        movingId=""
        todayKey={TODAY_KEY}
      />,
    );
    const short = screen.getByText("Electric potential").closest("li")!;
    const long = screen.getByText("Long session").closest("li")!;
    expect(Number.parseFloat(long.style.height)).toBeCloseTo(Number.parseFloat(short.style.height) * 3, 4);
  });

  it("is read-only when the week is saved: no move affordance, no button role", () => {
    render(<WeekGrid week={WEEK} timeZone={TIME_ZONE} blocks={[block()]} commitments={[]} draft={false} overlapIds={new Set()} movingId="" todayKey={TODAY_KEY} onSelect={() => {}} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Electric potential").closest("li")).not.toHaveAttribute("tabindex");
  });

  it("names an overlapping block in text, not only in colour", () => {
    render(<WeekGrid week={WEEK} timeZone={TIME_ZONE} blocks={[block()]} commitments={[]} draft={false} overlapIds={new Set(["block_one"])} movingId="" todayKey={TODAY_KEY} />);
    const item = screen.getByText("Electric potential").closest("li")!;
    expect(item).toHaveClass("is-overlapping");
    expect(within(item).getByText("Overlaps")).toBeInTheDocument();
  });

  it("marks the current day", () => {
    const { container } = render(<WeekGrid week={WEEK} timeZone={TIME_ZONE} blocks={[]} commitments={[]} draft={false} overlapIds={new Set()} movingId="" todayKey="2026-06-03" />);
    expect(container.querySelectorAll(".plan-day.is-today")).toHaveLength(1);
  });

  it("renders a fixed commitment behind the blocks rather than describing it in a badge", () => {
    render(
      <WeekGrid
        week={WEEK}
        timeZone={TIME_ZONE}
        blocks={[]}
        commitments={[{ id: "c1", title: "Physics lecture", start: at(1, 11), end: at(1, 12) }]}
        draft={false}
        overlapIds={new Set()}
        movingId=""
        todayKey={TODAY_KEY}
      />,
    );
    expect(screen.getByText("Physics lecture")).toBeInTheDocument();
  });

  describe("keyboard move (AC-PL2)", () => {
    it("exposes a draft block as a focusable button that says how to move it", async () => {
      const user = userEvent.setup();
      render(<MovableWeek onCommit={vi.fn()} />);
      const item = screen.getByRole("button", { name: /Electric potential, 09:00 to 10:00 on Mon\. Press Enter to move\./ });
      await user.tab();
      expect(item).toHaveFocus();
    });

    it("moves 15 minutes per arrow press and announces every step", async () => {
      const user = userEvent.setup();
      const onCommit = vi.fn();
      render(<MovableWeek onCommit={onCommit} />);
      await user.tab();
      await user.keyboard("{Enter}");
      expect(screen.getByRole("status")).toHaveTextContent("Arrow keys shift by 15 minutes or one day");

      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("status")).toHaveTextContent(at(1, 9, 15));
      await user.keyboard("{ArrowDown}");
      expect(screen.getByRole("status")).toHaveTextContent(at(1, 9, 30));

      await user.keyboard("{Enter}");
      expect(onCommit).toHaveBeenCalledOnce();
      expect(onCommit.mock.calls[0]![0]).toMatchObject({ start: at(1, 9, 30), end: at(1, 10, 30) });
      expect(screen.getByRole("status")).toHaveTextContent("Dropped.");
    });

    it("moves one day per horizontal arrow, landing in the next column", async () => {
      const user = userEvent.setup();
      const onCommit = vi.fn();
      render(<MovableWeek onCommit={onCommit} />);
      await user.tab();
      await user.keyboard("{Enter}{ArrowRight}{ArrowRight}{Enter}");
      expect(onCommit.mock.calls[0]![0]).toMatchObject({ start: at(3, 9) });
      expect(within(screen.getByRole("list", { name: "Blocks on Wed" })).getByText("Electric potential")).toBeInTheDocument();
    });

    it("previews the in-flight position so the block visibly moves before it is dropped", async () => {
      const user = userEvent.setup();
      render(<MovableWeek onCommit={vi.fn()} />);
      await user.tab();
      await user.keyboard("{Enter}{ArrowRight}");
      expect(within(screen.getByRole("list", { name: "Blocks on Tue" })).getByText("Electric potential")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Electric potential/ })).toHaveAttribute("aria-grabbed", "true");
    });

    it("Escape cancels and puts the block back without committing", async () => {
      const user = userEvent.setup();
      const onCommit = vi.fn();
      render(<MovableWeek onCommit={onCommit} />);
      await user.tab();
      await user.keyboard("{Enter}{ArrowRight}{ArrowDown}{Escape}");
      expect(onCommit).not.toHaveBeenCalled();
      expect(screen.getByRole("status")).toHaveTextContent("Move cancelled.");
      expect(within(screen.getByRole("list", { name: "Blocks on Mon" })).getByText("Electric potential")).toBeInTheDocument();
    });

    it("ignores arrows until move mode has been entered", async () => {
      const user = userEvent.setup();
      const onCommit = vi.fn();
      render(<MovableWeek onCommit={onCommit} />);
      await user.tab();
      await user.keyboard("{ArrowDown}{ArrowRight}");
      expect(screen.getByRole("status")).toHaveTextContent("");
      expect(within(screen.getByRole("list", { name: "Blocks on Mon" })).getByText("Electric potential")).toBeInTheDocument();
      expect(onCommit).not.toHaveBeenCalled();
    });

    it("offers a resize control that states the current duration and the keys", () => {
      render(
        <WeekGrid
          week={WEEK}
          timeZone={TIME_ZONE}
          blocks={[block()]}
          commitments={[]}
          draft
          overlapIds={new Set()}
          movingId=""
          todayKey={TODAY_KEY}
          onSelect={() => {}}
          onResizeStart={() => {}}
        />,
      );
      expect(screen.getByRole("button", { name: /Resize Electric potential\. Currently 60 minutes\. Use the up and down arrow keys\./ })).toBeInTheDocument();
    });
  });
});
