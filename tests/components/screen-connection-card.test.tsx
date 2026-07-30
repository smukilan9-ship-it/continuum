import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConnectionCard, ConnectionCardError, ConnectionCardSkeleton, ConnectionGroup } from "@/components/settings/connection-card";
import { CONNECTION_STATUS, isLive, needsUser, statusTone, type ConnectionStatus } from "@/components/settings/status";

const ALL: ConnectionStatus[] = Object.values(CONNECTION_STATUS);

function card(status: ConnectionStatus, overrides: Partial<React.ComponentProps<typeof ConnectionCard>> = {}) {
  return render(
    <ConnectionCard icon={<svg />} title="Zotero" outcome="Your reading, in Continuum" status={status} {...overrides}>
      <button type="button">Reconnect</button>
    </ConnectionCard>,
  );
}

describe("the connection status vocabulary (§9.10)", () => {
  it("is exactly seven words, and nothing invents an eighth", () => {
    expect(ALL).toEqual([
      "Not connected",
      "Working",
      "Working — no setup needed",
      "Syncing…",
      "Needs attention",
      "Expired",
      "Paused",
    ]);
  });

  it("derives the tone from the word rather than from each call site", () => {
    expect(ALL.map(statusTone)).toEqual(["neutral", "success", "success", "processing", "warning", "danger", "neutral"]);
  });

  it("does not report a keyless capability as disconnected (C8)", () => {
    expect(statusTone(CONNECTION_STATUS.WORKING_NO_SETUP)).toBe("success");
    expect(CONNECTION_STATUS.WORKING_NO_SETUP).not.toBe(CONNECTION_STATUS.NOT_CONNECTED);
  });

  it("classifies which states are live and which need the user", () => {
    expect(ALL.filter(isLive)).toEqual(["Working", "Syncing…"]);
    expect(ALL.filter(needsUser)).toEqual(["Needs attention", "Expired"]);
  });
});

describe("ConnectionCard", () => {
  it.each(ALL)("shows %s as a word in the summary, readable without opening the card", (status) => {
    card(status);
    const summary = document.querySelector("summary")!;
    expect(within(summary).getByText(status)).toHaveClass(`status-chip-${statusTone(status)}`);
    expect(within(summary).getByText("Zotero")).toBeInTheDocument();
    expect(within(summary).getByText("Your reading, in Continuum")).toBeInTheDocument();
  });

  it.each(ALL)("opens by default for %s only when the controls are why you came", (status) => {
    card(status);
    const details = document.querySelector("details")!;
    expect(details.open).toBe(isLive(status) || needsUser(status));
  });

  it("keeps a featured card open regardless of status", () => {
    card(CONNECTION_STATUS.NOT_CONNECTED, { featured: true });
    const details = document.querySelector("details")!;
    expect(details.open).toBe(true);
    expect(details).toHaveClass("connection-card-featured");
  });

  it("is a native disclosure, so it is keyboard operable without any wiring", async () => {
    const user = userEvent.setup();
    card(CONNECTION_STATUS.PAUSED);
    const details = document.querySelector("details")!;
    expect(details.open).toBe(false);
    await user.click(document.querySelector("summary")!);
    expect(details.open).toBe(true);
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
  });

  it("renders its explanatory detail inside the body", () => {
    card(CONNECTION_STATUS.WORKING, { detail: "Continuum reads your library; it never writes to it." });
    expect(screen.getByText("Continuum reads your library; it never writes to it.")).toBeInTheDocument();
  });

  it("takes an id so a deep link can target it", () => {
    card(CONNECTION_STATUS.WORKING, { id: "connection-zotero" });
    expect(document.querySelector("details")).toHaveAttribute("id", "connection-zotero");
  });
});

describe("ConnectionCardSkeleton", () => {
  it("announces itself as loading so the page shell can paint first (S14)", () => {
    render(<ConnectionCardSkeleton />);
    expect(screen.getByRole("status", { name: "Loading this connection" })).toHaveClass("connection-card-skeleton");
  });
});

describe("ConnectionCardError", () => {
  it("fails per card, naming the card, with a way to retry", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ConnectionCardError title="Zotero" message="The library index did not respond." onRetry={onRetry} />);
    const alert = screen.getByRole("alert");
    expect(within(alert).getByRole("heading", { name: "Zotero could not be loaded" })).toBeInTheDocument();
    expect(within(alert).getByText("The library index did not respond.")).toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("ConnectionGroup", () => {
  it("is a named section describing the outcome, not the vendor", () => {
    render(<ConnectionGroup title="Your reading" summary="Bring papers and notes into Continuum."><p>cards</p></ConnectionGroup>);
    const group = screen.getByRole("region", { name: "Your reading" });
    expect(within(group).getByRole("heading", { name: "Your reading" })).toBeInTheDocument();
    expect(within(group).getByText("Bring papers and notes into Continuum.")).toBeInTheDocument();
  });

  it("collapses to a disclosure when the group is secondary", () => {
    render(<ConnectionGroup collapsed title="Advanced" summary="Rarely needed."><p>cards</p></ConnectionGroup>);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    const details = document.querySelector("details.connection-group-collapsed")!;
    expect(details).not.toHaveAttribute("open");
    expect(within(details as HTMLElement).getByText("Advanced")).toBeInTheDocument();
  });
});
