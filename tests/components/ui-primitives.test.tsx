import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  Badge,
  Button,
  Card,
  IconButton,
  LoadingButton,
  Progress,
  ProgressBar,
  StatusChip,
  Tooltip,
  type ButtonVariant,
  type ControlSize,
  type StatusTone,
} from "@/components/ui/primitives";

const VARIANTS: ButtonVariant[] = ["primary", "secondary", "quiet", "danger"];
const SIZES: ControlSize[] = ["sm", "md", "lg"];
const TONES: StatusTone[] = ["neutral", "success", "warning", "danger", "info", "processing"];

describe("Button", () => {
  it.each(VARIANTS)("renders the %s variant as a class rather than an inline style", (variant) => {
    render(<Button variant={variant}>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveClass("button", `button-${variant}`);
  });

  it.each(SIZES)("renders the %s size", (size) => {
    render(<Button size={size}>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    // `md` is the default and must not emit a redundant modifier class.
    if (size === "md") expect(button.className).not.toMatch(/\bbutton-md\b/);
    else expect(button).toHaveClass(`button-${size}`);
  });

  it("defaults to type=button so a button inside a form never submits it by accident", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "button");
  });

  it("honours an explicit submit type", () => {
    render(<Button type="submit">Send</Button>);
    expect(screen.getByRole("button", { name: "Send" })).toHaveAttribute("type", "submit");
  });

  it("is operable with Enter and Space from the keyboard", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Run</Button>);
    await user.tab();
    expect(screen.getByRole("button", { name: "Run" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("does not fire while disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Run</Button>);
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
  });
});

describe("IconButton", () => {
  it("always carries an accessible name because the label is invisible", () => {
    render(<IconButton label="Close search"><span aria-hidden="true">x</span></IconButton>);
    expect(screen.getByRole("button", { name: "Close search" })).toBeInTheDocument();
  });

  it.each([28, 32, 36] as const)("renders at %spx", (size) => {
    render(<IconButton label="Options" size={size}><span aria-hidden="true">…</span></IconButton>);
    expect(screen.getByRole("button", { name: "Options" })).toHaveClass(`icon-button-${size}`);
  });

  it("renders the danger variant", () => {
    render(<IconButton label="Delete" variant="danger"><span aria-hidden="true">x</span></IconButton>);
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("icon-button-danger");
  });

  it("is reachable by keyboard", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton label="Options" onClick={onClick}><span aria-hidden="true">…</span></IconButton>);
    await user.tab();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("LoadingButton", () => {
  it("sets aria-busy and swaps in the loading label while loading", () => {
    render(<LoadingButton loading loadingLabel="Saving…">Save week</LoadingButton>);
    const button = screen.getByRole("button", { name: /Saving/ });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
    expect(screen.queryByText("Save week")).not.toBeInTheDocument();
  });

  it("is not busy and not disabled when idle", () => {
    render(<LoadingButton>Save week</LoadingButton>);
    const button = screen.getByRole("button", { name: "Save week" });
    expect(button).not.toHaveAttribute("aria-busy", "true");
    expect(button).toBeEnabled();
  });

  it("cannot be activated while loading, so a slow save is not submitted twice", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<LoadingButton loading onClick={onClick}>Save week</LoadingButton>);
    await user.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("StatusChip", () => {
  it.each(TONES)("renders the %s tone with its word, never colour alone", (tone) => {
    render(<StatusChip tone={tone} label="Working" />);
    const chip = screen.getByText("Working");
    expect(chip).toHaveClass("status-chip", `status-chip-${tone}`);
  });

  it("hides a decorative icon from assistive technology", () => {
    render(<StatusChip label="Done" icon={<svg data-testid="tick" />} />);
    expect(screen.getByTestId("tick").parentElement).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Done")).toBeInTheDocument();
  });
});

describe("Badge", () => {
  it("renders its tone as a class", () => {
    render(<Badge tone="success">4 new</Badge>);
    expect(screen.getByText("4 new")).toHaveClass("badge", "badge-success");
  });

  it("defaults to the neutral tone", () => {
    render(<Badge>Draft</Badge>);
    expect(screen.getByText("Draft")).toHaveClass("badge-neutral");
  });
});

describe("Card", () => {
  it("passes DOM attributes through", () => {
    render(<Card data-testid="card" aria-label="Goal">Body</Card>);
    const card = screen.getByTestId("card");
    expect(card).toHaveClass("card");
    expect(card).toHaveAttribute("aria-label", "Goal");
  });
});

describe("Progress", () => {
  it("exposes the value through the progressbar role", () => {
    render(<Progress value={42} label="Upload" />);
    const bar = screen.getByRole("progressbar", { name: "Upload" });
    expect(bar).toHaveAttribute("data-value", "42");
  });
});

describe("ProgressBar", () => {
  it("publishes value, bounds, and a readable value text", () => {
    render(<ProgressBar value={37} label="SAT progress" />);
    const bar = screen.getByRole("progressbar", { name: "SAT progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "37");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuetext", "37%");
  });

  it("clamps out-of-range input instead of painting outside the track", () => {
    render(
      <>
        <ProgressBar value={140} label="Over" />
        <ProgressBar value={-20} label="Under" />
      </>,
    );
    expect(screen.getByRole("progressbar", { name: "Over" })).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByRole("progressbar", { name: "Under" })).toHaveAttribute("aria-valuenow", "0");
  });

  it("prefers a caller-supplied value text over the bare percentage", () => {
    render(<ProgressBar value={50} label="Milestones" valueText="2 of 4 milestones" />);
    expect(screen.getByRole("progressbar", { name: "Milestones" })).toHaveAttribute("aria-valuetext", "2 of 4 milestones");
  });

  it.each([2, 4] as const)("renders the %spx size", (size) => {
    render(<ProgressBar value={10} label="Bar" size={size} />);
    expect(screen.getByRole("progressbar", { name: "Bar" })).toHaveClass(`progress-bar-${size}`);
  });
});

describe("Tooltip", () => {
  it("reveals its label on keyboard focus, not only on hover", async () => {
    const user = userEvent.setup();
    render(<Tooltip label="Copy the run output"><button type="button">Copy</button></Tooltip>);
    await user.tab();
    expect(screen.getByRole("button", { name: "Copy" })).toHaveFocus();
    expect(await screen.findAllByText("Copy the run output")).not.toHaveLength(0);
  });
});
