import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmationDialog, Drawer, Menu, Modal, Popover, SidePanel, type DialogSize } from "@/components/ui/overlay";

function Harness({
  render: renderOverlay,
}: {
  render: (open: boolean, setOpen: (next: boolean) => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open it</button>
      {renderOverlay(open, setOpen)}
    </>
  );
}

describe("Modal", () => {
  it.each(["sm", "md", "lg"] as DialogSize[])("renders the %s size", (size) => {
    render(<Modal open onOpenChange={() => {}} title="Add a source" size={size}>Body</Modal>);
    expect(screen.getByRole("dialog")).toHaveClass(`modal-${size}`);
  });

  it("names itself with its title and describes itself when given a description", () => {
    render(<Modal open onOpenChange={() => {}} title="Add a source" description="Pick a file to extract.">Body</Modal>);
    const dialog = screen.getByRole("dialog", { name: "Add a source" });
    expect(dialog).toHaveAccessibleDescription("Pick a file to extract.");
  });

  it("traps focus inside itself and restores it to the trigger on close", async () => {
    const user = userEvent.setup();
    render(<Harness render={(open, setOpen) => <Modal open={open} onOpenChange={setOpen} title="Add a source"><button type="button">Inside</button></Modal>} />);
    const trigger = screen.getByRole("button", { name: "Open it" });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Add a source" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    // Cycling forward past the last control must land back inside the dialog.
    for (let step = 0; step < 6; step += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes on Escape when clean", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Modal open onOpenChange={onOpenChange} title="Add a source">Body</Modal>);
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("asks before discarding when dirty, and Escape does not close on its own", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Modal open onOpenChange={onOpenChange} title="Add a source" dirty dirtyMessage="Discard this draft?">Body</Modal>);
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("alertdialog", { name: "Discard this draft?" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    await user.click(screen.getByRole("button", { name: "Close Add a source" }));
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders a footer only when one is supplied", () => {
    const { rerender } = render(<Modal open onOpenChange={() => {}} title="T">Body</Modal>);
    expect(screen.getByRole("dialog").querySelector(".modal-footer")).toBeNull();
    rerender(<Modal open onOpenChange={() => {}} title="T" footer={<button type="button">Save</button>}>Body</Modal>);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});

describe("ConfirmationDialog", () => {
  it("offers exactly one confirm and one cancel, and reports the destructive variant", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmationDialog
        open
        onOpenChange={onOpenChange}
        title="Delete this source?"
        description="The extracted text is removed too."
        confirmLabel="Delete source"
        destructive
        onConfirm={onConfirm}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Delete this source?" });
    expect(within(dialog).getByText("The extracted text is removed too.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Delete source" })).toHaveClass("button-danger");

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Delete source" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("prints the question exactly once", () => {
    render(<ConfirmationDialog open onOpenChange={() => {}} title="Delete this source?" description="The extracted text is removed too." confirmLabel="Delete" onConfirm={() => {}} />);
    expect(screen.getAllByText("The extracted text is removed too.")).toHaveLength(1);
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription("The extracted text is removed too.");
  });

  it("marks the confirm busy while the action runs", () => {
    render(<ConfirmationDialog open onOpenChange={() => {}} title="T" description="D" confirmLabel="Go" busy onConfirm={() => {}} />);
    expect(screen.getByRole("button", { name: /Working/ })).toHaveAttribute("aria-busy", "true");
  });
});

describe("Popover", () => {
  it("opens from its trigger and closes on Escape", async () => {
    const user = userEvent.setup();
    render(<Popover trigger={<button type="button">Details</button>}><p>Retrieved 3 records.</p></Popover>);
    await user.click(screen.getByRole("button", { name: "Details" }));
    expect(await screen.findByText("Retrieved 3 records.")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("Retrieved 3 records.")).not.toBeInTheDocument());
  });
});

describe("Menu", () => {
  const items = [
    { label: "Rerun", onSelect: vi.fn() },
    { label: "Clear console", onSelect: vi.fn() },
    { label: "Copy output", onSelect: vi.fn() },
  ];

  it("exposes a named menu of menuitems with roving tabindex", async () => {
    const user = userEvent.setup();
    render(<Menu label="Console options" trigger={<button type="button">Options</button>} items={items} />);
    await user.click(screen.getByRole("button", { name: "Options" }));

    const menu = await screen.findByRole("menu", { name: "Console options" });
    const entries = within(menu).getAllByRole("menuitem");
    expect(entries).toHaveLength(3);
    expect(entries[0]).toHaveAttribute("tabindex", "0");
    expect(entries[1]).toHaveAttribute("tabindex", "-1");
    await waitFor(() => expect(entries[0]).toHaveFocus());
  });

  it("moves focus with the arrow keys and wraps, and jumps with Home/End", async () => {
    const user = userEvent.setup();
    render(<Menu label="Console options" trigger={<button type="button">Options</button>} items={items} />);
    await user.click(screen.getByRole("button", { name: "Options" }));
    const menu = await screen.findByRole("menu", { name: "Console options" });
    const entries = within(menu).getAllByRole("menuitem");

    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(entries[1]).toHaveFocus());
    await user.keyboard("{ArrowUp}{ArrowUp}");
    await waitFor(() => expect(entries[2]).toHaveFocus());
    await user.keyboard("{Home}");
    await waitFor(() => expect(entries[0]).toHaveFocus());
    await user.keyboard("{End}");
    await waitFor(() => expect(entries[2]).toHaveFocus());
  });

  it("says why a disabled item is disabled and refuses to run it", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <Menu
        label="Console options"
        trigger={<button type="button">Options</button>}
        items={[{ label: "Copy output", onSelect, disabled: true, disabledReason: "Run the program first." }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Options" }));
    const entry = await screen.findByRole("menuitem", { name: "Copy output" });
    expect(entry).toBeDisabled();
    expect(entry).toHaveAttribute("title", "Run the program first.");
    await user.click(entry);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("says so rather than showing a blank surface when nothing is available", async () => {
    const user = userEvent.setup();
    render(<Menu label="Console options" trigger={<button type="button">Options</button>} items={[{ label: "Rerun", onSelect: vi.fn(), disabled: true }]} />);
    await user.click(screen.getByRole("button", { name: "Options" }));
    expect(await screen.findByText("Nothing available here")).toBeInTheDocument();
  });

  it("runs the selected item and closes", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Menu label="Console options" trigger={<button type="button">Options</button>} items={[{ label: "Rerun", onSelect }]} />);
    await user.click(screen.getByRole("button", { name: "Options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Rerun" }));
    expect(onSelect).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });
});

describe("SidePanel", () => {
  it("is a named dialog with a labelled close control", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<SidePanel open onOpenChange={onOpenChange} title="Context" headerActions={<button type="button">Pin</button>}>Body</SidePanel>);
    const panel = screen.getByRole("dialog", { name: "Context" });
    expect(within(panel).getByRole("button", { name: "Pin" })).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Close Context" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes on Escape and takes a caller-supplied width", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<SidePanel open onOpenChange={onOpenChange} title="Context" width={520}>Body</SidePanel>);
    expect(screen.getByRole("dialog", { name: "Context" }).style.getPropertyValue("--panel-w")).toBe("520px");
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("returns focus to whatever opened it", async () => {
    const user = userEvent.setup();
    render(<Harness render={(open, setOpen) => <SidePanel open={open} onOpenChange={setOpen} title="Context">Body</SidePanel>} />);
    const trigger = screen.getByRole("button", { name: "Open it" });
    await user.click(trigger);
    await screen.findByRole("dialog", { name: "Context" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

describe("Drawer", () => {
  it("carries a title for assistive technology without painting one", () => {
    render(<Drawer open onOpenChange={() => {}} title="Workspace navigation"><a href="/home">Home</a></Drawer>);
    const drawer = screen.getByRole("dialog", { name: "Workspace navigation" });
    expect(within(drawer).getByText("Workspace navigation")).toHaveClass("sr-only");
    expect(within(drawer).getByRole("link", { name: "Home" })).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Drawer open onOpenChange={onOpenChange} title="Workspace navigation">Links</Drawer>);
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("returns focus to the control that opened it", async () => {
    const user = userEvent.setup();
    render(<Harness render={(open, setOpen) => <Drawer open={open} onOpenChange={setOpen} title="Workspace navigation"><a href="/home">Home</a></Drawer>} />);
    const trigger = screen.getByRole("button", { name: "Open it" });
    await user.click(trigger);
    await screen.findByRole("dialog", { name: "Workspace navigation" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
