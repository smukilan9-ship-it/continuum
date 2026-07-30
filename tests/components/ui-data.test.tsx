import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { List, Row, Table, type Column } from "@/components/ui/data";

describe("List", () => {
  it("is a real list, named for assistive technology", () => {
    render(<List label="Your goals"><Row title="SAT maths" /></List>);
    const list = screen.getByRole("list", { name: "Your goals" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  });
});

describe("Row", () => {
  it("makes the whole row the link target rather than only the title text", () => {
    render(<List><Row href="/g/goal_demo_sat" title="SAT maths" meta="4 milestones" trailing="62%" /></List>);
    const link = screen.getByRole("link", { name: /SAT maths/ });
    expect(link).toHaveClass("row-hit");
    expect(link).toHaveTextContent("4 milestones");
    expect(link).toHaveTextContent("62%");
  });

  it("marks a selected link row as current", () => {
    render(<List><Row href="/plan" title="Plan" selected /></List>);
    expect(screen.getByRole("link", { name: "Plan" })).toHaveAttribute("aria-current", "true");
  });

  it("uses a button and aria-pressed when it selects rather than navigates", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<List><Row onSelect={onSelect} title="Electric potential" selected /></List>);
    const button = screen.getByRole("button", { name: "Electric potential" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    await user.click(button);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("is inert — neither link nor button — when it does nothing", () => {
    render(<List><Row title="Read only" /></List>);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Read only")).toBeInTheDocument();
  });

  it("keeps row actions operable independently of the row hit area", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<List><Row href="/g/x" title="SAT maths" actions={<button type="button" onClick={onAction}>Remove</button>} /></List>);
    const action = screen.getByRole("button", { name: "Remove" });
    expect(screen.getByRole("link", { name: /SAT maths/ }).contains(action)).toBe(false);
    await user.click(action);
    expect(onAction).toHaveBeenCalledOnce();
  });

  it.each(["compact", "default", "comfortable"] as const)("renders the %s density", (density) => {
    render(<List><Row title="Row" density={density} /></List>);
    expect(screen.getByRole("listitem")).toHaveClass(`row-${density}`);
  });

  it("marks itself interactive only when it is", () => {
    render(
      <List>
        <Row title="Static" />
        <Row title="Clickable" onSelect={() => {}} />
      </List>,
    );
    const [staticRow, interactiveRow] = screen.getAllByRole("listitem");
    expect(staticRow).not.toHaveClass("row-interactive");
    expect(interactiveRow).toHaveClass("row-interactive");
  });
});

type Score = { concept: string; retention: number };
const COLUMNS: Array<Column<Score>> = [
  { key: "concept", header: "Concept", render: (item) => item.concept },
  { key: "retention", header: "Retention", numeric: true, width: "90px", render: (item) => `${item.retention}%` },
];

describe("Table", () => {
  it("carries a caption for assistive technology and column headers with scope", () => {
    render(<Table items={[{ concept: "Electric potential", retention: 62 }]} columns={COLUMNS} caption="Mastery by concept" getKey={(item) => item.concept} />);
    const table = screen.getByRole("table", { name: "Mastery by concept" });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual(["Concept", "Retention"]);
    expect(headers.every((header) => header.getAttribute("scope") === "col")).toBe(true);
  });

  it("marks numeric columns in both the header and the cells", () => {
    render(<Table items={[{ concept: "Electric potential", retention: 62 }]} columns={COLUMNS} caption="Mastery" getKey={(item) => item.concept} />);
    expect(screen.getByRole("columnheader", { name: "Retention" })).toHaveClass("numeric");
    expect(screen.getByRole("cell", { name: "62%" })).toHaveClass("numeric");
    expect(screen.getByRole("columnheader", { name: "Concept" })).not.toHaveClass("numeric");
  });

  it("renders one row per item and applies a caller-supplied width", () => {
    render(
      <Table
        items={[{ concept: "A", retention: 1 }, { concept: "B", retention: 2 }, { concept: "C", retention: 3 }]}
        columns={COLUMNS}
        caption="Mastery"
        getKey={(item) => item.concept}
      />,
    );
    // Header row plus three body rows.
    expect(screen.getAllByRole("row")).toHaveLength(4);
    expect(screen.getByRole("columnheader", { name: "Retention" })).toHaveStyle({ width: "90px" });
  });

  it("makes its horizontally scrolling wrapper reachable by keyboard (WCAG 2.1.1)", () => {
    render(<Table items={[]} columns={COLUMNS} caption="Mastery by concept" getKey={(item) => item.concept} />);
    const region = screen.getByRole("region", { name: "Mastery by concept" });
    expect(region).toHaveClass("table-scroll");
    expect(region).toHaveAttribute("tabindex", "0");
  });

  it("renders headers with no rows rather than collapsing to nothing", () => {
    render(<Table items={[]} columns={COLUMNS} caption="Mastery" getKey={(item) => item.concept} />);
    expect(screen.getAllByRole("row")).toHaveLength(1);
    expect(screen.getByRole("columnheader", { name: "Concept" })).toBeInTheDocument();
  });
});
