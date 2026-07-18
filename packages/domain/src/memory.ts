import { memoryEventSchema, type MemoryEvent } from "@continuum/schemas";

export interface MemoryRecord {
  id: string;
  userId: string;
  type: string;
  entityId?: string;
  value: Record<string, unknown>;
  sourceEventId: string;
  updatedAt: string;
  superseded: boolean;
}

export class MemoryLedger {
  readonly #events: MemoryEvent[] = [];

  append(event: MemoryEvent) {
    const valid = memoryEventSchema.parse(event);
    if (this.#events.some((existing) => existing.id === valid.id)) throw new Error("Memory event IDs are immutable and unique");
    this.#events.push(structuredClone(valid));
    return structuredClone(valid);
  }

  events(userId?: string) {
    return this.#events.filter((event) => !userId || event.userId === userId).map((event) => structuredClone(event));
  }

  materialize(userId: string): MemoryRecord[] {
    const records = new Map<string, MemoryRecord>();
    for (const event of this.#events.filter((item) => item.userId === userId)) {
      const key = event.entityId ?? event.id;
      if (event.type.endsWith(".deleted")) {
        const existing = records.get(key);
        if (existing) records.set(key, { ...existing, superseded: true, updatedAt: event.timestamp });
        continue;
      }
      records.set(key, {
        id: `memory_${key.replace(/^[a-z]+_/, "")}`,
        userId,
        type: event.type,
        ...(event.entityId ? { entityId: event.entityId } : {}),
        value: structuredClone(event.payload),
        sourceEventId: event.id,
        updatedAt: event.timestamp,
        superseded: false,
      });
    }
    return [...records.values()];
  }
}

export function packRelevantContext(records: MemoryRecord[], query: string, maxRecords = 6) {
  const terms = new Set(query.toLowerCase().split(/\W+/).filter((term) => term.length > 2));
  return records
    .filter((record) => !record.superseded)
    .map((record) => {
      const haystack = JSON.stringify(record).toLowerCase();
      const score = [...terms].reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { record, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || Date.parse(b.record.updatedAt) - Date.parse(a.record.updatedAt))
    .slice(0, maxRecords)
    .map((entry) => entry.record);
}
