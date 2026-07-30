import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { renderPackSections, type ContextPack } from "@/lib/context-packs";

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../apps/web/${path}`, import.meta.url)), "utf8");

/**
 * §9.9 and §14.4. The Context page is where infrastructure language leaked
 * hardest: the live build showed a "Postgres canonical" badge, described its own
 * search as "semantic + lexical retrieval · relevance and token budget applied",
 * and named an MCP tool in the pack detail. None of that means anything to a
 * student, and §9.9 bans it outright on this surface.
 */
describe("Context page terminology", () => {
  const source = read("components/context/context-page.tsx");

  // Comments are stripped first. A banned word is legitimate in a comment
  // explaining why it is banned — this file's own guidance names all of them —
  // and counting those would make the check unfixable rather than useful.
  const userFacing = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("import"))
    .join("\n");

  const BANNED = ["Postgres", "canonical", "vector", "embedding", "retrieval", "token budget", "MCP tool", "pack ID"];

  for (const term of BANNED) {
    it(`never shows "${term}" to the user`, () => {
      const pattern = new RegExp(`["'>\`][^"'<\`]*\\b${term.replace(/ /g, "\\s+")}\\b`, "i");
      expect(pattern.test(userFacing), `"${term}" appears in user-facing copy`).toBe(false);
    });
  }

  it("does not render a JSON dump as pack content (C21)", () => {
    // The old screen's primary pack view was <pre>{JSON.stringify(...)}</pre>.
    // JSON.stringify may still be used for the explicit download action.
    expect(source).not.toMatch(/<pre>\s*\{\s*JSON\.stringify/);
    expect(source).toContain("renderPackSections");
  });
});

describe("renderPackSections", () => {
  const pack: ContextPack = {
    metadata: {
      id: "goal:goal_demo_sat", title: "Raise SAT", description: "d", category: "goal",
      estimatedTokens: 10, recordCount: 3, provenance: [], privacyLevel: "private_account",
      updatedAt: "2026-07-29T00:00:00.000Z", mcpTool: "get_context_pack", exportFormats: ["markdown", "json"],
    },
    content: {
      goal: { id: "goal_demo_sat", title: "Raise SAT score", outcome: "1570+" },
      tasks: [
        { id: "task_a", title: "Timed drill", status: "in_progress" },
        { id: "task_b", title: "Review misses" },
      ],
      empties: [],
    },
    contextPolicy: "Private goal-scoped state.",
  };

  it("turns records into headed sections of readable bullets", () => {
    const sections = renderPackSections(pack);
    const goal = sections.find((section) => section.heading === "Goal");
    const tasks = sections.find((section) => section.heading === "Open work");

    expect(goal?.items).toEqual(["Raise SAT score — 1570+"]);
    expect(tasks?.items).toEqual(["Timed drill — in_progress", "Review misses"]);
  });

  it("omits empty collections rather than printing an empty heading", () => {
    expect(renderPackSections(pack).some((section) => section.heading === "Empties")).toBe(false);
  });

  it("states how much it truncated instead of dropping silently", () => {
    const many = { ...pack, content: { tasks: Array.from({ length: 12 }, (_, i) => ({ id: `task_${i}`, title: `Task ${i}` })) } };
    const [section] = renderPackSections(many, 5);
    expect(section?.items).toHaveLength(5);
    expect(section?.remaining).toBe(7);
  });

  it("exports Markdown as prose, not a JSON code fence", async () => {
    const { contextPackMarkdown } = await import("@/lib/context-packs");
    const markdown = contextPackMarkdown(pack);
    expect(markdown).not.toContain("```json");
    expect(markdown).toContain("## Open work");
    expect(markdown).toContain("- Timed drill — in_progress");
  });
});
