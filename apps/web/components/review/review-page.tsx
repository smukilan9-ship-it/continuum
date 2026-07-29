"use client";

import { Check, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button, EmptyState, Menu, StatusChip, Switch } from "@/components/ui";
import { eventTypeLabel, formatLabel, humanize } from "@/lib/labels";

import { formatDate, text, type Row, type WorkspaceState } from "../workspace/types";
import "./review.css";

type Toast = (message: string | null) => void;

/**
 * Event types an ordinary user has a reason to read. Everything else — routing
 * decisions, cache activity, internal bookkeeping — is real audit data but is
 * noise in a review queue, so it sits behind the toggle rather than forming an
 * unfiltered wall (§9.8).
 */
const MEANINGFUL_EVENT = /^(goal|task|project|milestone|decision|receipt|schedule|source|claim|note|learning|resource|proposal)/;

function changeEntries(proposal: Row) {
  const payload = proposal.payload;
  if (!payload || typeof payload !== "object") return [] as Array<[string, unknown]>;
  const next = (payload as Row).changes;
  return next && typeof next === "object" ? Object.entries(next as Row) : [];
}

function targetId(proposal: Row) {
  const payload = proposal.payload;
  if (!payload || typeof payload !== "object") return "";
  const row = payload as Row;
  return text(row, "entityId") || text(row, "goalId") || text(row, "taskId") || text(row, "projectId");
}

/** Resolve the record a proposal targets so "before" is a fact, not a blank. */
function findTarget(state: WorkspaceState, proposal: Row) {
  const id = targetId(proposal);
  if (!id) return undefined;
  for (const collection of [state.goals, state.tasks, state.projects, state.milestones]) {
    const found = collection.find((row) => text(row, "id") === id);
    if (found) return found;
  }
  return undefined;
}

/**
 * Renders a value the way a person reads it. The old screen printed
 * "3 structured fields" for anything non-scalar, which is a count, not a
 * change — AC-RV1 requires the user to see what would actually differ.
 */
function readable(key: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) {
    if (!value.length) return "None";
    if (key === "blocks") return `${value.length} study block${value.length === 1 ? "" : "s"}`;
    return value.map((entry) => (typeof entry === "string" ? formatLabel(entry, entry) : humanize(String(entry)))).join(", ");
  }
  if (value instanceof Date) return formatDate(value.toISOString(), { dateStyle: "medium" });
  if (typeof value === "object") {
    const entries = Object.entries(value as Row).slice(0, 3);
    return entries.map(([k, v]) => `${humanize(k)}: ${readable(k, v)}`).join(" · ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return formatDate(raw, { dateStyle: "medium", timeStyle: "short" });
  return raw.length > 160 ? `${raw.slice(0, 157)}…` : formatLabel(raw, raw);
}

function proposalSignature(proposal: Row) {
  return `${text(proposal, "kind", "change")}::${text(proposal, "status", "pending")}::${text(proposal, "summary", "")}`;
}

/**
 * §9.8: `<ins>`/`<del>` carry the change with text markers, so the diff does not
 * depend on colour alone.
 */
function DiffRow({ label, before, after }: { label: string; before: string; after: string }) {
  const unchanged = before === after;
  return (
    <div className="diff-row">
      <dt>{label}</dt>
      <dd>
        {unchanged ? (
          <span className="diff-same">{after}</span>
        ) : (
          <>
            <del><span className="sr-only">Currently: </span>{before}</del>
            <span className="diff-arrow" aria-hidden="true">→</span>
            <ins><span className="sr-only">Changes to: </span>{after}</ins>
          </>
        )}
      </dd>
    </div>
  );
}

export function ReviewPage({
  state,
  timeZone,
  showToast,
  onRefresh,
}: {
  state: WorkspaceState;
  timeZone: string;
  showToast: Toast;
  onRefresh: () => Promise<void>;
}) {
  const [busyId, setBusyId] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showTechnical, setShowTechnical] = useState(false);

  const proposals = useMemo(
    () => state.proposals.filter((proposal) => ["pending", "confirmed"].includes(text(proposal, "status", "pending"))),
    [state.proposals],
  );

  // The demo queue carried four byte-identical proposals differing only by
  // timestamp. Group them, show the newest, offer one action to clear the rest.
  const groups = useMemo(() => {
    const bySignature = new Map<string, Row[]>();
    for (const proposal of proposals) {
      const key = proposalSignature(proposal);
      bySignature.set(key, [...(bySignature.get(key) ?? []), proposal]);
    }
    return [...bySignature.entries()].map(([key, entries]) => {
      const sorted = [...entries].sort((left, right) => Date.parse(String(right.createdAt ?? 0)) - Date.parse(String(left.createdAt ?? 0)));
      return { key, current: sorted[0]!, superseded: sorted.slice(1) };
    });
  }, [proposals]);

  const visibleEvents = useMemo(() => {
    const filtered = showTechnical ? state.events : state.events.filter((event) => MEANINGFUL_EVENT.test(text(event, "type", "")));
    const byDay = new Map<string, Row[]>();
    for (const event of filtered.slice(0, 60)) {
      const day = formatDate(event.occurredAt, { dateStyle: "full" }, timeZone);
      byDay.set(day, [...(byDay.get(day) ?? []), event]);
    }
    return [...byDay.entries()];
  }, [state.events, showTechnical, timeZone]);

  const hiddenEventCount = state.events.length - state.events.filter((event) => MEANINGFUL_EVENT.test(text(event, "type", ""))).length;

  async function review(proposal: Row, action: "confirm" | "reject" | "commit_schedule") {
    const proposalId = text(proposal, "id");
    if (!proposalId) return;
    setBusyId(proposalId);
    try {
      const response = await fetch("/api/proposals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, proposalId }) });
      const body = await response.json() as { changeSummary?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? "The proposal could not be reviewed");
      setBusyId("");
      showToast(body.changeSummary ?? "Proposal reviewed.");
      await onRefresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "The proposal could not be reviewed");
      setBusyId("");
    }
  }

  async function rejectSuperseded(entries: Row[]) {
    for (const entry of entries) await review(entry, "reject");
  }

  return (
    <div className="review">
      <header className="review-head">
        <h1>Review</h1>
        <p>Anything an assistant wants to change waits here until you approve it.</p>
      </header>

      <section className="review-section" aria-labelledby="pending-heading">
        <h2 id="pending-heading">Waiting for your approval{groups.length ? ` (${groups.length})` : ""}</h2>

        {groups.length ? (
          <div className="proposal-stack">
            {groups.map((group) => {
              const proposal = group.current;
              const status = text(proposal, "status", "pending");
              const kind = text(proposal, "kind", "change");
              const id = text(proposal, "id");
              const target = findTarget(state, proposal);
              const entries = changeEntries(proposal);
              const goalTitle = text(state.goals.find((goal) => text(goal, "id") === text(proposal, "goalId")), "title");

              return (
                <article className="proposal" key={id} aria-labelledby={`proposal-${id}`}>
                  <header>
                    <div className="proposal-meta">
                      <StatusChip tone={text(proposal, "risk") === "high" ? "warning" : "neutral"} label={`${formatLabel(text(proposal, "risk", "medium"))} risk`} />
                      <StatusChip tone="neutral" label={formatLabel(kind)} />
                      {goalTitle ? <span className="proposal-scope">{goalTitle}</span> : null}
                    </div>
                    <time>{formatDate(proposal.createdAt, undefined, timeZone)}</time>
                  </header>

                  <h3 id={`proposal-${id}`}>{text(proposal, "summary", "Assistant-proposed update")}</h3>

                  {entries.length ? (
                    <dl className="diff">
                      {entries.slice(0, 8).map(([key, value]) => (
                        <DiffRow
                          key={key}
                          label={humanize(key)}
                          before={readable(key, target?.[key])}
                          after={readable(key, value)}
                        />
                      ))}
                    </dl>
                  ) : (
                    <p className="proposal-note">This proposal carries no field-level change — approve it on the summary above.</p>
                  )}

                  <footer className="proposal-actions">
                    {status === "pending" ? (
                      <>
                        <Button variant="secondary" disabled={busyId === id} onClick={() => void review(proposal, "reject")}><X size={15} aria-hidden="true" />Decline</Button>
                        <Button variant="primary" disabled={busyId === id} onClick={() => void review(proposal, "confirm")}>
                          <Check size={15} aria-hidden="true" />
                          {busyId === id ? "Applying…" : "Approve"}
                        </Button>
                      </>
                    ) : (
                      /* Schedule changes keep their two-phase contract: approving
                         a schedule proposal does not commit it. */
                      <>
                        <StatusChip tone="info" label="Approved — not yet committed" />
                        <Button variant="primary" disabled={busyId === id} onClick={() => void review(proposal, "commit_schedule")}>
                          <Check size={15} aria-hidden="true" />
                          {busyId === id ? "Committing…" : "Commit schedule"}
                        </Button>
                      </>
                    )}
                    {group.superseded.length ? (
                      <Menu
                        label="Earlier duplicates"
                        trigger={<Button variant="quiet" size="sm">{group.superseded.length} earlier duplicate{group.superseded.length === 1 ? "" : "s"}</Button>}
                        items={[
                          { label: `Decline all ${group.superseded.length}`, onSelect: () => void rejectSuperseded(group.superseded), destructive: true },
                          { label: expandedGroups.has(group.key) ? "Hide dates" : "Show dates", onSelect: () => setExpandedGroups((current) => { const next = new Set(current); if (next.has(group.key)) next.delete(group.key); else next.add(group.key); return next; }) },
                        ]}
                      />
                    ) : null}
                  </footer>

                  {expandedGroups.has(group.key) ? (
                    <ul className="proposal-superseded">
                      {group.superseded.map((entry) => <li key={text(entry, "id")}>{formatDate(entry.createdAt, undefined, timeZone)}</li>)}
                    </ul>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={<ShieldCheck size={20} />} title="Nothing needs your approval." body="Changes proposed by Claude or by Continuum's own assistant appear here before they touch your work." />
        )}
      </section>

      <section className="review-section" aria-labelledby="changes-heading">
        <div className="review-section-head">
          <h2 id="changes-heading">Recent changes</h2>
          {hiddenEventCount > 0 ? (
            <Switch
              label="Show technical events"
              description={`${hiddenEventCount} routing and bookkeeping entries`}
              checked={showTechnical}
              onCheckedChange={setShowTechnical}
            />
          ) : null}
        </div>

        {visibleEvents.length ? (
          <div className="event-days">
            {visibleEvents.map(([day, events]) => (
              <section key={day} aria-label={day}>
                <h3>{day}</h3>
                <ul>
                  {events.map((event) => (
                    <li key={text(event, "id")}>
                      <StatusChip tone="neutral" label={eventTypeLabel(text(event, "type", "event"))} />
                      <span>{text(event, "summary")}</span>
                      <time>{formatDate(event.occurredAt, { timeStyle: "short" }, timeZone)}</time>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState title="Nothing has changed yet" body="Completed work, accepted decisions, and assistant updates appear here with their provenance." />
        )}
      </section>
    </div>
  );
}
