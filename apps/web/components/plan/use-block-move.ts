"use client";

/**
 * Moving a block without a mouse (redesign.md §14.2, AC-PL2).
 *
 * Drag was the only way to move a block, which made the whole planning surface
 * unusable by keyboard and by anyone who cannot hold a pointer steady. The
 * model here is the one calendar apps already teach:
 *
 *   Enter        enter move mode on the focused block
 *   ↑ / ↓        shift 15 minutes
 *   ← / →        shift one day
 *   Enter        drop
 *   Escape       cancel and put it back
 *
 * The in-flight position is **state**, not a ref, so the block visibly moves as
 * the arrows are pressed; every transition is also announced through an
 * `aria-live` region, because a silent move is indistinguishable from a broken
 * one. Nothing is committed until the drop, so the undo stack gets one entry
 * per move rather than one per keypress, and Escape can restore exactly.
 */
import { useCallback, useState } from "react";
import type { ScheduleBlock } from "@continuum/schemas";
import { SNAP_MINUTES, shiftBlock } from "./plan-time";

export type BlockMoveApi = {
  movingId: string;
  /** The block at its in-flight position. Render this instead of the stored one. */
  preview?: ScheduleBlock;
  announcement: string;
  onKeyDown: (event: React.KeyboardEvent, block: ScheduleBlock) => void;
  cancel: () => void;
};

export function useBlockMove({
  onCommit,
  describe,
}: {
  onCommit: (block: ScheduleBlock) => void;
  describe: (block: ScheduleBlock) => string;
}): BlockMoveApi {
  const [moving, setMoving] = useState<{ origin: ScheduleBlock; preview: ScheduleBlock }>();
  const [announcement, setAnnouncement] = useState("");

  const cancel = useCallback(() => {
    setMoving((current) => {
      setAnnouncement(current ? `Move cancelled. ${describe(current.origin)}` : "Move cancelled.");
      return undefined;
    });
  }, [describe]);

  const onKeyDown = useCallback((event: React.KeyboardEvent, block: ScheduleBlock) => {
    const active = moving?.origin.id === block.id;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!active) {
        setMoving({ origin: block, preview: block });
        setAnnouncement(`Moving ${block.title}. Arrow keys shift by 15 minutes or one day. Enter drops it, Escape cancels.`);
        return;
      }
      const dropped = moving!.preview;
      setMoving(undefined);
      onCommit(dropped);
      setAnnouncement(`Dropped. ${describe(dropped)}`);
      return;
    }

    if (!active) return;

    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
      return;
    }

    const minutes = event.key === "ArrowUp" ? -SNAP_MINUTES : event.key === "ArrowDown" ? SNAP_MINUTES : 0;
    const days = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (!minutes && !days) return;
    event.preventDefault();
    const next = shiftBlock(moving!.preview, minutes, days);
    setMoving({ origin: moving!.origin, preview: next });
    setAnnouncement(describe(next));
  }, [cancel, describe, moving, onCommit]);

  return { movingId: moving?.origin.id ?? "", preview: moving?.preview, announcement, onKeyDown, cancel };
}
