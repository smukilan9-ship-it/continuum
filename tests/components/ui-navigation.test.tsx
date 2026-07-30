import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Breadcrumb, SegmentedNavigation, Tabs } from "@/components/ui/navigation";

type View = "overview" | "plan" | "study" | "sources";
const OPTIONS = [
  { value: "overview" as View, label: "Overview" },
  { value: "plan" as View, label: "Plan" },
  { value: "study" as View, label: "Study" },
  { value: "sources" as View, label: "Sources" },
];

function TabsHarness({ variant }: { variant?: "underline" | "segmented" } = {}) {
  const [value, setValue] = useState<View>("overview");
  return (
    <>
      <Tabs
        value={value}
        onChange={setValue}
        label="Goal views"
        variant={variant}
        options={OPTIONS.map((option) => ({ ...option, panelId: `panel-${option.value}` }))}
      />
      <div id={`panel-${value}`} role="tabpanel">{value} panel</div>
    </>
  );
}

describe("Tabs", () => {
  it("is a named tablist with one selected tab", () => {
    render(<TabsHarness />);
    const list = screen.getByRole("tablist", { name: "Goal views" });
    expect(within(list).getAllByRole("tab")).toHaveLength(4);
    expect(within(list).getByRole("tab", { selected: true })).toHaveAccessibleName("Overview");
  });

  it("keeps only the selected tab in the tab order (APG roving tabindex)", () => {
    render(<TabsHarness />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(tabs.slice(1).every((tab) => tab.getAttribute("tabindex") === "-1")).toBe(true);
  });

  it("wires each tab to the panel it controls", () => {
    render(<TabsHarness />);
    const selected = screen.getByRole("tab", { selected: true });
    expect(selected).toHaveAttribute("aria-controls", "panel-overview");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "panel-overview");
  });

  it("moves selection with the arrow keys and wraps at both ends", async () => {
    const user = userEvent.setup();
    render(<TabsHarness />);
    await user.tab();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(screen.getByRole("tab", { name: "Plan" })).toHaveFocus());
    expect(screen.getByRole("tab", { selected: true })).toHaveAccessibleName("Plan");

    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    await waitFor(() => expect(screen.getByRole("tab", { name: "Sources" })).toHaveFocus());
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(screen.getByRole("tab", { name: "Overview" })).toHaveFocus());
  });

  it("jumps to the ends with Home and End", async () => {
    const user = userEvent.setup();
    render(<TabsHarness />);
    await user.tab();
    await user.keyboard("{End}");
    await waitFor(() => expect(screen.getByRole("tab", { name: "Sources" })).toHaveFocus());
    await user.keyboard("{Home}");
    await waitFor(() => expect(screen.getByRole("tab", { name: "Overview" })).toHaveFocus());
  });

  it("selects on click", async () => {
    const user = userEvent.setup();
    render(<TabsHarness />);
    await user.click(screen.getByRole("tab", { name: "Study" }));
    expect(screen.getByRole("tab", { selected: true })).toHaveAccessibleName("Study");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("study panel");
  });

  it.each(["underline", "segmented"] as const)("renders the %s variant", (variant) => {
    render(<TabsHarness variant={variant} />);
    expect(screen.getByRole("tablist")).toHaveClass(`tabs-${variant}`);
  });

  it("renders a badge beside a tab label", () => {
    render(<Tabs value="a" onChange={() => {}} label="L" options={[{ value: "a", label: "Review", badge: "3" }]} />);
    expect(screen.getByRole("tab", { name: /Review/ })).toHaveTextContent("3");
  });
});

describe("SegmentedNavigation", () => {
  it("is a named tablist reporting the current selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedNavigation value="week" options={[{ value: "week", label: "Week" }, { value: "day", label: "Day" }]} onChange={onChange} label="Plan range" />);
    const list = screen.getByRole("tablist", { name: "Plan range" });
    expect(within(list).getByRole("tab", { selected: true })).toHaveAccessibleName("Week");
    expect(within(list).getByRole("tab", { name: "Week" })).toHaveClass("active");

    await user.click(within(list).getByRole("tab", { name: "Day" }));
    expect(onChange).toHaveBeenCalledWith("day");
  });

  it("is operable from the keyboard", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedNavigation value="week" options={[{ value: "week", label: "Week" }, { value: "day", label: "Day" }]} onChange={onChange} label="Plan range" />);
    await user.tab();
    await user.tab();
    expect(screen.getByRole("tab", { name: "Day" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("day");
  });
});

describe("Breadcrumb", () => {
  it("is a named nav whose last crumb is the current page and is not a link", () => {
    render(<Breadcrumb items={[{ label: "SAT maths", href: "/g/goal_demo_sat" }, { label: "Oasis" }]} />);
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("link", { name: "SAT maths" })).toHaveAttribute("href", "/g/goal_demo_sat");
    expect(within(nav).queryByRole("link", { name: "Oasis" })).not.toBeInTheDocument();
    expect(within(nav).getByText("Oasis")).toHaveAttribute("aria-current", "page");
  });

  it("truncates to the last two levels (§15.9)", () => {
    render(<Breadcrumb items={[{ label: "Home", href: "/home" }, { label: "Goals", href: "/g" }, { label: "SAT maths", href: "/g/x" }, { label: "Oasis" }]} />);
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getAllByRole("listitem")).toHaveLength(2);
    expect(within(nav).queryByText("Home")).not.toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "SAT maths" })).toBeInTheDocument();
  });

  it("hides the separator from assistive technology", () => {
    render(<Breadcrumb items={[{ label: "A", href: "/a" }, { label: "B" }]} />);
    expect(screen.getByText("›")).toHaveAttribute("aria-hidden", "true");
  });
});
