import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CitationChip, ContextChip, type ContextKind } from "@/components/ui/chips";

const KINDS: ContextKind[] = ["goal", "project", "source", "paper", "concept", "conversation", "decision", "note", "file", "week"];

describe("ContextChip", () => {
  it.each(KINDS)("renders the %s kind, showing both the kind and the label", (kind) => {
    render(<ContextChip kind={kind} label="Spatial transcriptomics" />);
    const chip = screen.getByText("Spatial transcriptomics").closest(".context-chip")!;
    expect(chip).toHaveClass(`context-chip-${kind}`);
    expect(chip).toHaveTextContent(kind);
  });

  it("offers a removal control whose name says what it removes", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<ContextChip kind="source" label="Halliday ch. 24" onRemove={onRemove} />);
    await user.click(screen.getByRole("button", { name: "Remove Halliday ch. 24 from context" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("is removable from the keyboard", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<ContextChip kind="goal" label="SAT maths" onRemove={onRemove} />);
    await user.tab();
    expect(screen.getByRole("button", { name: "Remove SAT maths from context" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("has no removal control when the chip is not removable", () => {
    render(<ContextChip kind="week" label="This week" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("hides a decorative icon from assistive technology", () => {
    render(<ContextChip kind="file" label="notes.pdf" icon={<svg data-testid="glyph" />} />);
    expect(screen.getByTestId("glyph").parentElement).toHaveAttribute("aria-hidden", "true");
  });
});

describe("CitationChip", () => {
  it("is static when it has nothing to open", () => {
    render(<CitationChip kind="source" label="Halliday ch. 24" detail="p. 612" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    const chip = screen.getByText("Halliday ch. 24").closest(".citation-chip")!;
    expect(chip).toHaveTextContent("p. 612");
    expect(chip).toHaveTextContent("source");
  });

  it("becomes a labelled button that opens the record it cites", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<CitationChip kind="paper" label="Spatial transcriptomics" onOpen={onOpen} />);
    const chip = screen.getByRole("button", { name: "Open Spatial transcriptomics" });
    expect(chip).toHaveClass("citation-chip-interactive");
    await user.click(chip);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("opens from the keyboard", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<CitationChip kind="conversation" label="Week 3 review" onOpen={onOpen} />);
    await user.tab();
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
