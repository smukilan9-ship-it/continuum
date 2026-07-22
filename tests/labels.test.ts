import { describe, expect, it } from "vitest";
import {
  conceptLabel,
  eventTypeLabel,
  formatLabel,
  humanize,
  languageLabel,
  masteryLabel,
  priorityLabel,
  sourceTypeLabel,
  statusTone,
} from "../apps/web/lib/labels";

describe("presentation layer — humanize", () => {
  it("turns snake_case into sentence case", () => {
    expect(humanize("in_progress")).toBe("In progress");
    expect(humanize("not_started")).toBe("Not started");
    expect(humanize("needs_review")).toBe("Needs review");
  });

  it("does not title-case every word", () => {
    expect(humanize("schedule_change")).toBe("Schedule change");
  });

  it("handles dotted and camelCase tokens", () => {
    expect(humanize("resource.activity.started")).toBe("Resource activity started");
    expect(humanize("taskClass")).toBe("Task class");
  });
});

describe("presentation layer — formatLabel", () => {
  it("uses friendly overrides where humanize would be wrong", () => {
    expect(formatLabel("python_mysql")).toBe("Python & MySQL");
    expect(formatLabel("sql")).toBe("SQL");
    expect(formatLabel("mcp")).toBe("MCP");
    expect(formatLabel("resource_activity")).toBe("Guided resource activity");
    expect(formatLabel("independent_passed")).toBe("Independently verified");
    expect(formatLabel("native")).toBe("In Continuum");
  });

  it("falls back to sentence case for unknown enums", () => {
    expect(formatLabel("in_progress")).toBe("In progress");
    expect(formatLabel("some_new_status")).toBe("Some new status");
  });

  it("returns the fallback for empty values", () => {
    expect(formatLabel(undefined)).toBe("—");
    expect(formatLabel(null)).toBe("—");
    expect(formatLabel("", "n/a")).toBe("n/a");
  });

  it("never leaves a raw snake_case string", () => {
    for (const raw of ["in_progress", "not_started", "needs_review", "high_impact_memory", "goal_created"]) {
      expect(formatLabel(raw)).not.toContain("_");
    }
  });
});

describe("presentation layer — domain helpers", () => {
  it("maps numeric priority to a word", () => {
    expect(priorityLabel(5)).toBe("Highest");
    expect(priorityLabel(3)).toBe("Normal");
    expect(priorityLabel(1)).toBe("Lowest");
  });

  it("labels durable events as human phrases", () => {
    expect(eventTypeLabel("learning.verified")).toBe("Verified checkpoint");
    expect(eventTypeLabel("misconception.resolved")).toBe("Misconception resolved");
    expect(eventTypeLabel("resource.activity.started")).toBe("Resource started");
    // unknown event still humanized, never raw
    expect(eventTypeLabel("some.new.event")).toBe("Some new event");
  });

  it("labels mastery states in curriculum-friendly terms", () => {
    expect(masteryLabel("misconception_detected")).toBe("Misconception to fix");
    expect(masteryLabel("mastered")).toBe("Mastered");
    expect(masteryLabel(undefined)).toBe("Not started");
  });

  it("maps MIME types to friendly source kinds", () => {
    expect(sourceTypeLabel("text/markdown")).toBe("Markdown");
    expect(sourceTypeLabel("application/pdf")).toBe("PDF");
    expect(sourceTypeLabel("text/plain")).toBe("Text");
  });

  it("cleans concept identifiers and preserves acronyms", () => {
    expect(conceptLabel("concept_demo_sql_commit")).toBe("SQL commit");
    expect(conceptLabel("concept_ihc_registration")).toBe("IHC registration");
    expect(conceptLabel(undefined)).toBe("Tracked concept");
  });

  it("labels programming languages", () => {
    expect(languageLabel("javascript")).toBe("JavaScript");
    expect(languageLabel("cpp")).toBe("C++");
    expect(languageLabel("python")).toBe("Python");
  });

  it("derives sensible badge tones", () => {
    expect(statusTone("done")).toBe("green");
    expect(statusTone("in_progress")).toBe("blue");
    expect(statusTone("blocked")).toBe("orange");
    expect(statusTone("contradicted")).toBe("red");
    expect(statusTone("planned")).toBe("neutral");
  });
});
