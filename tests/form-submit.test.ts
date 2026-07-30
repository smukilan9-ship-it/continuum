import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../apps/web/components/", import.meta.url));

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(`${dir}${entry.name}/`) : entry.name.endsWith(".tsx") ? [`${dir}${entry.name}`] : [],
  );

const files = walk(root);

/**
 * "Do not ship a control that does nothing."
 *
 * The `Button` primitive sets `type={props.type ?? "button"}` on purpose — a
 * stray Button inside a form should not submit it. The cost is that every
 * submit control has to say so, and four forgot: the assistant's send button,
 * "Create project", "Save accepted decision", and the source upload. Each sat
 * inside `<form onSubmit={…}>` rendering `<button type="button">`, so clicking
 * it did nothing at all. The composer's own component test passed throughout,
 * because it pressed Enter — the textarea's keydown handler — and never clicked
 * the button.
 *
 * A form that handles submit needs something that can submit it: a control with
 * `type="submit"`, one pointing at it with `form="id"`, or a bare `<button>`,
 * which is `type="submit"` by the HTML default.
 */
describe("every form can be submitted by its own controls", () => {
  const withForms = files.filter((file) => /<form[^>]*onSubmit/.test(readFileSync(file, "utf8")));

  it("finds the forms to check", () => {
    expect(withForms.length).toBeGreaterThanOrEqual(10);
  });

  // A submit control may live in another component and point back with
  // `form="id"`. SetupDialog does exactly that, taking the id as a `formId`
  // prop and rendering `form={formId} type="submit"` — so a form whose id is
  // handed to something that submits it is covered, even though nothing in its
  // own file says so.
  const submitsSomeForm = files.filter((file) => /\sform=\{?[\w"]+\}?[^>]*type="submit"|type="submit"[^>]*\sform=\{?[\w"]+\}?/s.test(readFileSync(file, "utf8")));
  const handedToASubmitter = new Set(
    files.flatMap((file) => [...readFileSync(file, "utf8").matchAll(/\bformId=\{?"([\w-]+)"\}?/g)].map((match) => match[1])),
  );
  const referencedFormIds = submitsSomeForm.length ? handedToASubmitter : new Set<string>();

  for (const file of withForms) {
    it(file.slice(file.indexOf("components/")), () => {
      const source = readFileSync(file, "utf8");
      const forms = source.match(/<form[^>]*onSubmit/g)?.length ?? 0;
      const explicit = source.match(/type="submit"/g)?.length ?? 0;
      const remote = [...source.matchAll(/<form[^>]*\sid="([\w-]+)"/g)].filter((match) => referencedFormIds.has(match[1])).length;
      const byFormId = remote + (source.match(/\sform="[\w-]+"/g)?.length ?? 0);
      // `<button` with no `type=` before the closing bracket is a native submit.
      const bare = source.match(/<button(?![^>]*\stype=)[^>]*>/g)?.length ?? 0;
      expect(explicit + byFormId + bare, `${forms} form(s) handle submit but nothing here can submit one`).toBeGreaterThanOrEqual(forms);
    });
  }

  it("the assistant's send button submits the composer", () => {
    const composer = readFileSync(`${root}assistant/composer.tsx`, "utf8");
    expect(composer).toMatch(/<Button\s+type="submit"[^>]*aria-label="Send message"/s);
  });
});
