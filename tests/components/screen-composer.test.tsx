import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Composer } from "@/components/assistant/composer";
import type { AssistantMessage, ComposerChip } from "@/components/assistant/types";
import { AssistantProvider, type AssistantController } from "@/components/assistant/use-assistant";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }) }));

type Overrides = Partial<AssistantController> & { initialChips?: ComposerChip[]; messages?: AssistantMessage[] };

/**
 * The real `Composer` inside a real `AssistantProvider`. Only the controller is
 * substituted — it is the piece that streams over the network — so every
 * keyboard rule, send guard, and chip render below is the component's own.
 */
function mount(overrides: Overrides = {}) {
  const send = vi.fn(async () => {});
  const stop = vi.fn();
  const spies = { send, stop };

  function Harness() {
    const [draft, setDraft] = useState("");
    const [chips, setChips] = useState<ComposerChip[]>(overrides.initialChips ?? []);
    const [mode, setMode] = useState<AssistantController["mode"]>(overrides.mode ?? "auto");
    const value = useMemo<AssistantController>(() => ({
      sessions: [], active: undefined, activeId: "session_1",
      messages: [], live: "", busy: false, status: "", loadingSession: false, error: undefined,
      confirmation: undefined, excludedRecordIds: [],
      hasPersonalKey: false, personalKeyProvider: undefined,
      panelOpen: false, setPanelOpen: vi.fn(), askFromPage: vi.fn(),
      setActiveId: vi.fn(),
      addChip: (chip: ComposerChip) => setChips((current) => [...current, chip]),
      removeChip: (id: string) => setChips((current) => current.filter((chip) => chip.id !== id)),
      updateChip: vi.fn(), excludeRecord: vi.fn(),
      resolveConfirmation: vi.fn(), retry: vi.fn(), newConversation: vi.fn(),
      createSession: vi.fn(), updateSession: vi.fn(), deleteSession: vi.fn(), branchFrom: vi.fn(),
      refreshSessions: vi.fn(), loadSession: vi.fn(), setPageContext: vi.fn(),
      ...overrides,
      // `draft`, `chips` and `mode` stay owned by the harness above so the
      // component's own writes to them are observable, and `send`/`stop` stay
      // the spies this helper returns. An override must not shadow them.
      draft, chips, mode, setDraft, setMode, send, stop,
    } as AssistantController), [draft, chips, mode]);
    return <AssistantProvider value={value}><Composer /></AssistantProvider>;
  }

  render(<Harness />);
  return spies;
}

const composerBox = () => screen.getByRole("textbox", { name: "Message Continuum" });

describe("Composer — send rules (§11.2)", () => {
  it("sends on Enter", async () => {
    const user = userEvent.setup();
    const { send } = mount();
    await user.click(composerBox());
    await user.keyboard("What is due this week?{Enter}");
    expect(send).toHaveBeenCalledWith("What is due this week?");
  });

  it("inserts a newline on Shift+Enter and does not send", async () => {
    const user = userEvent.setup();
    const { send } = mount();
    await user.click(composerBox());
    await user.keyboard("first{Shift>}{Enter}{/Shift}second");
    expect(composerBox()).toHaveValue("first\nsecond");
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses to send an empty or whitespace-only message", async () => {
    const user = userEvent.setup();
    const { send } = mount();
    await user.click(composerBox());
    await user.keyboard("{Enter}");
    await user.keyboard("   {Enter}");
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("enables the send button as soon as there is something to send", async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    await user.type(composerBox(), "hi");
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  it("sends a message with only a ready attachment and no text", () => {
    mount({ initialChips: [{ id: "source_1", kind: "file", label: "notes.pdf", origin: "attachment", state: "ready" }] });
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  it("will not send while an attachment is still being read", () => {
    mount({ initialChips: [{ id: "upload_1", kind: "file", label: "notes.pdf", origin: "attachment", state: "extracting" }] });
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(screen.getByText("Reading…")).toBeInTheDocument();
  });

  it("swaps Send for Stop while a response is streaming", async () => {
    const user = userEvent.setup();
    const { stop } = mount({ busy: true });
    expect(screen.queryByRole("button", { name: "Send message" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stop response" }));
    expect(stop).toHaveBeenCalledOnce();
  });
});

describe("Composer — ↑ recalls the last message (§11.2)", () => {
  const history: AssistantMessage[] = [
    { id: "m1", role: "user", content: "What is due this week?" },
    { id: "m2", role: "assistant", content: "Three tasks." },
    { id: "m3", role: "user", content: "And next week?" },
    { id: "m4", role: "assistant", content: "One task." },
  ];

  it("puts the most recent user message back in an empty composer", async () => {
    const user = userEvent.setup();
    mount({ messages: history });
    await user.click(composerBox());
    await user.keyboard("{ArrowUp}");
    expect(composerBox()).toHaveValue("And next week?");
  });

  it("never recalls an assistant turn", async () => {
    const user = userEvent.setup();
    mount({ messages: [{ id: "m1", role: "assistant", content: "Three tasks." }] });
    await user.click(composerBox());
    await user.keyboard("{ArrowUp}");
    expect(composerBox()).toHaveValue("");
  });

  it("leaves a non-empty draft alone, so ↑ is still cursor movement", async () => {
    const user = userEvent.setup();
    mount({ messages: history });
    await user.type(composerBox(), "in progress");
    await user.keyboard("{ArrowUp}");
    expect(composerBox()).toHaveValue("in progress");
  });

  it("does nothing in a conversation with no user turn yet", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(composerBox());
    await user.keyboard("{ArrowUp}");
    expect(composerBox()).toHaveValue("");
  });
});

describe("Composer — context chips replace the checkboxes (AC-A8)", () => {
  it("renders zero checkboxes", () => {
    mount({ initialChips: [{ id: "goal_demo_sat", kind: "goal", label: "SAT maths", origin: "page" }] });
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("shows a chip per pinned record and removes the one you ask it to", async () => {
    const user = userEvent.setup();
    mount({
      initialChips: [
        { id: "goal_demo_sat", kind: "goal", label: "SAT maths", origin: "page" },
        { id: "source_1", kind: "source", label: "Halliday ch. 24", origin: "pinned" },
      ],
    });
    expect(screen.getByText("SAT maths")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Halliday ch. 24 from context" }));
    expect(screen.queryByText("Halliday ch. 24")).not.toBeInTheDocument();
    expect(screen.getByText("SAT maths")).toBeInTheDocument();
  });

  it("keeps attachments in their own tray, not in the chip row", () => {
    mount({
      initialChips: [
        { id: "goal_demo_sat", kind: "goal", label: "SAT maths", origin: "page" },
        { id: "source_1", kind: "file", label: "notes.pdf", origin: "attachment", state: "ready", message: "Attached · not saved to Library" },
      ],
    });
    const tray = document.querySelector(".assistant-attachment-tray")!;
    expect(within(tray as HTMLElement).getByText("notes.pdf")).toBeInTheDocument();
    expect(within(tray as HTMLElement).queryByText("SAT maths")).not.toBeInTheDocument();
    expect(screen.getByText("Attached · not saved to Library")).toBeInTheDocument();
  });

  it("offers a labelled way to remove an attachment and to add context", () => {
    mount({ initialChips: [{ id: "source_1", kind: "file", label: "notes.pdf", origin: "attachment", state: "ready" }] });
    expect(screen.getByRole("button", { name: "Remove notes.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add context to this message" })).toBeInTheDocument();
  });

  it("offers a retry on a failed extraction rather than a dead chip", () => {
    mount({ initialChips: [{ id: "upload_1", kind: "file", label: "notes.pdf", origin: "attachment", state: "error", message: "Extraction failed" }] });
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByText("Extraction failed")).toBeInTheDocument();
  });
});

describe("Composer — mode and destination", () => {
  it("offers three modes, not five (§11.7)", () => {
    mount();
    const select = screen.getByRole("combobox", { name: "Response mode" });
    expect(within(select).getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual(["auto", "fast", "deep"]);
  });

  it("switches mode and reflects it in the hint line", async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.getByText(/^Auto · Enter to send · Shift\+Enter for a new line$/)).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Response mode" }), "deep");
    expect(screen.getByText(/^Deep · Enter to send/)).toBeInTheDocument();
  });

  it("hides the BYOK chip when the platform key is paying", () => {
    mount();
    expect(screen.queryByText("Your key")).not.toBeInTheDocument();
  });

  it("shows the BYOK chip, naming the account being billed, when a personal key is in use", () => {
    mount({ hasPersonalKey: true, personalKeyProvider: "Groq" });
    expect(screen.getByText("Your key")).toHaveAttribute("title", "Requests are billed to your Groq account");
  });

  it("asks where an attachment should be filed before reading it (§11.4)", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Attach files" }));
    const menu = await screen.findByRole("menu", { name: "Attachment destination" });
    expect(within(menu).getByRole("menuitem", { name: "Use in this message only" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Add to my Library" })).toBeInTheDocument();
  });

  it("labels the file input and accepts a documented set of types", () => {
    mount();
    const input = screen.getByLabelText("Attach files to this conversation");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("multiple");
    expect(input.getAttribute("accept")).toContain(".pdf");
  });

  it("caps a single message at 12,000 characters", () => {
    mount();
    expect(composerBox()).toHaveAttribute("maxlength", "12000");
  });

  it("opens the pin picker as a labelled dialog", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Add context to this message" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Add context" })).toBeInTheDocument());
  });
});
