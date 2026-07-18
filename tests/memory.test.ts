import { describe, expect, it } from "vitest";
import { MemoryLedger, packRelevantContext } from "../packages/domain/src/memory";
import type { MemoryEvent } from "../packages/schemas/src";

const event = (overrides: Partial<MemoryEvent> = {}): MemoryEvent => ({
  id: "event_decision_1",
  userId: "user_maya",
  type: "research.decision.saved",
  entityId: "decision_validation",
  timestamp: "2026-07-18T09:00:00+05:30",
  payload: { text: "Use patient-grouped validation", project: "H-DAB" },
  source: { surface: "standalone_app", sessionId: "session_1" },
  ...overrides,
});

describe("memory ledger", () => {
  it("appends immutable unique events", () => {
    const ledger = new MemoryLedger();
    ledger.append(event());
    expect(() => ledger.append(event())).toThrow(/unique/i);
    expect(ledger.events()).toHaveLength(1);
  });

  it("materializes current records without deleting history", () => {
    const ledger = new MemoryLedger();
    ledger.append(event());
    ledger.append(event({ id: "event_decision_2", timestamp: "2026-07-18T10:00:00+05:30", payload: { text: "Use grouped held-out validation", project: "H-DAB" } }));
    expect(ledger.events()).toHaveLength(2);
    expect(ledger.materialize("user_maya")).toHaveLength(1);
    expect(ledger.materialize("user_maya")[0]?.sourceEventId).toBe("event_decision_2");
  });

  it("excludes obsolete records from context", () => {
    const ledger = new MemoryLedger();
    ledger.append(event());
    ledger.append(event({ id: "event_delete_1", type: "research.decision.deleted", timestamp: "2026-07-18T11:00:00+05:30", payload: {} }));
    expect(packRelevantContext(ledger.materialize("user_maya"), "grouped validation")).toEqual([]);
  });

  it("packs only query-relevant records", () => {
    const ledger = new MemoryLedger();
    ledger.append(event());
    ledger.append(event({ id: "event_learning_1", entityId: "concept_potential", type: "learning.checkpoint.saved", payload: { text: "Electric potential misconception" } }));
    const packed = packRelevantContext(ledger.materialize("user_maya"), "patient validation");
    expect(packed).toHaveLength(1);
    expect(packed[0]?.entityId).toBe("decision_validation");
  });
});
