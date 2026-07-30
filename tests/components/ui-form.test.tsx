import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Checkbox, Field, Input, Radio, Select, Switch, Textarea } from "@/components/ui/form";

describe("Field", () => {
  it("labels the control it wraps, so clicking the label focuses it", async () => {
    const user = userEvent.setup();
    render(<Field label="Goal title">{({ id }) => <Input id={id} />}</Field>);
    await user.click(screen.getByText("Goal title"));
    expect(screen.getByLabelText("Goal title")).toHaveFocus();
  });

  it("associates a hint through aria-describedby without the caller wiring ids", () => {
    render(<Field label="Deadline" hint="The date the exam is sat.">{({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} />}</Field>);
    const input = screen.getByLabelText("Deadline");
    const described = input.getAttribute("aria-describedby");
    expect(described).toBeTruthy();
    expect(document.getElementById(described!)).toHaveTextContent("The date the exam is sat.");
  });

  it("associates an error, announces it, and reports invalid to the control", () => {
    render(<Field label="Email" error="Enter an email address.">{({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} invalid={invalid} />}</Field>);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter an email address.");
    expect(input.getAttribute("aria-describedby")).toContain(screen.getByRole("alert").id);
  });

  it("describes by hint and error together when both are present", () => {
    render(
      <Field label="Password" hint="At least 12 characters." error="Too short.">
        {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} />}
      </Field>,
    );
    const ids = screen.getByLabelText("Password").getAttribute("aria-describedby")!.split(" ");
    expect(ids).toHaveLength(2);
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual(["At least 12 characters.", "Too short."]);
  });

  it("marks required with a hidden asterisk, so the accessible name stays the label", () => {
    render(<Field label="Title" required>{({ id }) => <Input id={id} />}</Field>);
    const input = screen.getByLabelText(/^Title/);
    const label = document.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`)!;
    // Accessible-name computation skips aria-hidden subtrees, so the name is
    // "Title" even though the label's textContent is "Title *".
    const announced = [...label.childNodes]
      .filter((node) => !(node instanceof HTMLElement && node.getAttribute("aria-hidden") === "true"))
      .map((node) => node.textContent)
      .join("");
    expect(announced.trim()).toBe("Title");
    expect(label.querySelector("[aria-hidden='true']")).toHaveTextContent("*");
  });

  it("adds no describedby and no alert when the field is clean", () => {
    render(<Field label="Notes">{({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} invalid={invalid} />}</Field>);
    expect(screen.getByLabelText("Notes")).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Input / Textarea / Select", () => {
  it("accepts typing and reports the value", async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Query" />);
    await user.type(screen.getByLabelText("Query"), "spatial");
    expect(screen.getByLabelText("Query")).toHaveValue("spatial");
  });

  it.each([
    ["Input", <Input key="i" aria-label="Field" invalid />],
    ["Textarea", <Textarea key="t" aria-label="Field" invalid />],
    ["Select", <Select key="s" aria-label="Field" invalid><option>a</option></Select>],
  ])("%s sets aria-invalid and the invalid class only when invalid", (_name, element) => {
    render(element);
    const control = screen.getByLabelText("Field");
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control).toHaveClass("input-invalid");
  });

  it("omits aria-invalid entirely when valid", () => {
    render(<Input aria-label="Clean" />);
    expect(screen.getByLabelText("Clean")).not.toHaveAttribute("aria-invalid");
  });

  it("Textarea is multi-line and keeps newlines", async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="Program input" />);
    await user.type(screen.getByLabelText("Program input"), "3{Enter}4");
    expect(screen.getByLabelText("Program input")).toHaveValue("3\n4");
  });

  it("Select is operable with the keyboard", async () => {
    const user = userEvent.setup();
    render(
      <Select aria-label="Response mode" defaultValue="auto">
        <option value="auto">Auto</option>
        <option value="fast">Fast</option>
        <option value="deep">Deep</option>
      </Select>,
    );
    await user.selectOptions(screen.getByLabelText("Response mode"), "deep");
    expect(screen.getByLabelText("Response mode")).toHaveValue("deep");
  });

  it("Select is disabled when told to be", () => {
    render(<Select aria-label="Mode" disabled><option>a</option></Select>);
    expect(screen.getByLabelText("Mode")).toBeDisabled();
  });
});

describe("Checkbox", () => {
  it("is labelled and toggles by clicking the label text", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox label="Remember this device" onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: "Remember this device" });
    expect(box).not.toBeChecked();
    await user.click(screen.getByText("Remember this device"));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("toggles with Space from the keyboard", async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Include drafts" defaultChecked={false} />);
    await user.tab();
    await user.keyboard(" ");
    expect(screen.getByRole("checkbox", { name: "Include drafts" })).toBeChecked();
  });

  it("does not toggle while disabled", async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Locked" disabled />);
    await user.click(screen.getByText("Locked"));
    expect(screen.getByRole("checkbox", { name: "Locked" })).not.toBeChecked();
  });
});

describe("Radio", () => {
  it("keeps one selection per name group", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Radio name="retention" value="session" label="Use in this message only" />
        <Radio name="retention" value="library" label="Add to my Library" />
      </>,
    );
    await user.click(screen.getByRole("radio", { name: "Add to my Library" }));
    expect(screen.getByRole("radio", { name: "Add to my Library" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Use in this message only" })).not.toBeChecked();
  });
});

function ControlledSwitch({ description }: { description?: string } = {}) {
  const [on, setOn] = useState(false);
  return <Switch label="Reduce motion" checked={on} onCheckedChange={setOn} description={description} />;
}

describe("Switch", () => {
  it("uses the switch role and publishes its state", () => {
    render(<Switch label="Reduce motion" checked onCheckedChange={() => {}} />);
    expect(screen.getByRole("switch", { name: "Reduce motion" })).toHaveAttribute("aria-checked", "true");
  });

  it("takes effect immediately on activation rather than deferring to a Save", async () => {
    const user = userEvent.setup();
    render(<ControlledSwitch />);
    const control = screen.getByRole("switch", { name: "Reduce motion" });
    expect(control).toHaveAttribute("aria-checked", "false");
    await user.click(control);
    expect(control).toHaveAttribute("aria-checked", "true");
    expect(control).toHaveClass("switch-on");
  });

  it("toggles from the keyboard", async () => {
    const user = userEvent.setup();
    render(<ControlledSwitch />);
    await user.tab();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("switch", { name: "Reduce motion" })).toHaveAttribute("aria-checked", "true");
  });

  it("associates its description so the reason is announced with the control", () => {
    render(<ControlledSwitch description="Removes every transition across the app." />);
    const control = screen.getByRole("switch", { name: "Reduce motion" });
    const described = control.getAttribute("aria-describedby");
    expect(described).toBeTruthy();
    expect(document.getElementById(described!)).toHaveTextContent("Removes every transition across the app.");
  });

  it("does not change while disabled", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch label="Locked" checked={false} disabled onCheckedChange={onCheckedChange} />);
    await user.click(screen.getByRole("switch", { name: "Locked" }));
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: "Locked" })).toBeDisabled();
  });
});
