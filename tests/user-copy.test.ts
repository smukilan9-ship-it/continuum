import { describe, expect, it } from "vitest";

import { containsInternalId, plainCopy } from "@/lib/user-copy";

/**
 * §9.4 AC-H3. The deployed build rendered a raw record id inside a sentence on
 * Today, and the assistant streamed several more (C1). The identifiers are
 * supposed to be gone at the source now; this suite is the backstop that fails
 * loudly if one is ever written into user-facing copy again.
 */
describe("plainCopy", () => {
  it("removes the identifier shape observed live on Today", () => {
    const leaked = "Recorded after verified resource activity activity_d61e36a01a9e4275aa1c3368";
    expect(plainCopy(leaked)).toBe("Recorded after verified resource activity");
    expect(containsInternalId(plainCopy(leaked))).toBe(false);
  });

  it("removes every prefix the workspace mints", () => {
    const prefixes = ["activity", "task", "goal", "receipt", "block", "concept", "project", "record", "event", "mchunk", "memory", "source", "chunk", "proposal", "session"];
    for (const prefix of prefixes) {
      const value = `Continue ${prefix}_demo_a1b2c3d4 now`;
      expect(containsInternalId(plainCopy(value)), `${prefix} survived`).toBe(false);
    }
  });

  it("removes the assistant's leaked context identifiers", () => {
    // Verbatim from the audit: the model echoed retrieved chunk ids.
    const leaked = "Active Goals: goal_demo_sat and mchunk_demo_progress_sat cover this.";
    const cleaned = plainCopy(leaked);
    expect(containsInternalId(cleaned)).toBe(false);
    expect(cleaned).not.toContain("goal_demo_sat");
    expect(cleaned).not.toContain("mchunk_demo_progress_sat");
  });

  it("repairs the punctuation and spacing removal leaves behind", () => {
    expect(plainCopy("Finish the drill task_demo_geometry .")).toBe("Finish the drill.");
    expect(plainCopy("Review  goal_demo_sat  and continue")).toBe("Review and continue");
    expect(plainCopy("Open the file (source_demo_abcdef)")).toBe("Open the file");
  });

  it("leaves ordinary copy untouched", () => {
    const copy = [
      "Timed drill: parabolas & circles (20 questions)",
      "Raise SAT score from 1520 to 1570+",
      "Because advanced geometry is your weakest area and it is scheduled at 19:00.",
      "student_records.py",
      "Weakest: transfer 28%",
    ];
    for (const value of copy) expect(plainCopy(value)).toBe(value);
  });

  it("does not strip words that merely contain a prefix", () => {
    // "subtask_" and "megablock_" must not be treated as identifiers, and a
    // short suffix is not an id — the shape needs 6+ hex-ish characters.
    expect(plainCopy("task_ab")).toBe("task_ab");
    expect(plainCopy("Update the concept map")).toBe("Update the concept map");
  });
});
