export interface AuditEntry {
  id: string;
  userId: string;
  action: string;
  entityIds: string[];
  actor: "user" | "mcp_client" | "system";
  occurredAt: string;
  changeSummary: string;
  metadata: Record<string, unknown>;
}

export class AuditTrail {
  readonly #entries: AuditEntry[] = [];

  append(entry: AuditEntry) {
    if (this.#entries.some((item) => item.id === entry.id)) throw new Error("Audit entries are append-only");
    this.#entries.push(structuredClone(entry));
    return entry;
  }

  list(userId: string) {
    return this.#entries.filter((entry) => entry.userId === userId).map((entry) => structuredClone(entry));
  }
}
