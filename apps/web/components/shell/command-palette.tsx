"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Search, X } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./shell.css";
import { searchKindSection, settingsDestinations, workspaceMeta, workspacePath, type SearchHit, type WorkspaceView } from "@/lib/workspace-routes";

/** A runnable verb, always ranked above objects when the query matches it. */
export type PaletteAction = {
  id: string;
  label: string;
  hint: string;
  run: () => void;
  /** Rendered after the label, e.g. the pending-proposal count. */
  badge?: string;
};

type Row =
  | { type: "action"; key: string; label: string; hint: string; run: () => void; badge?: string }
  | { type: "link"; key: string; label: string; hint: string; href: Route }
  | { type: "view"; key: string; label: string; hint: string; view: WorkspaceView };

type Section = { label: string; rows: Row[] };

/** §8.4 caps every section at five rows. */
const SECTION_CAP = 5;
const DEBOUNCE_MS = 200;

/**
 * The `⌘K` palette (§8.4).
 *
 * The previous version searched only the four entity types the client already
 * held — goals, tasks, projects, receipts — so a source, a paper, a
 * conversation, or a concept simply could not be found by name (C13). Local
 * matching over shell data still answers instantly; `GET /api/search` covers
 * everything else and merges in when it arrives.
 */
export function CommandPalette({
  open,
  onOpenChange,
  actions,
  goals,
  projects,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: PaletteAction[];
  goals: Array<{ id: string; title: string }>;
  projects: Array<{ id: string; title: string }>;
  onNavigate: (view: WorkspaceView) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!open) { setQuery(""); setRemote([]); setActive(0); setFailed(false); } }, [open]);
  useEffect(() => { setActive(0); }, [query]);

  // Debounced, abortable — the palette types into this on every keystroke.
  useEffect(() => {
    if (!open || query.trim().length < 2) { setRemote([]); setLoading(false); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=30`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("unavailable");
        const payload = await response.json() as { results?: SearchHit[] };
        setRemote(payload.results ?? []);
        setFailed(false);
      } catch (cause) {
        if ((cause as { name?: string }).name === "AbortError") return;
        // Local results still stand; §8.4 says say so quietly rather than
        // replacing a partial answer with an error.
        setFailed(true);
        setRemote([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [open, query]);

  const sections = useMemo<Section[]>(() => {
    const needle = query.trim().toLowerCase();
    const matches = (...values: string[]) => !needle || values.some((value) => value.toLowerCase().includes(needle));

    const built: Section[] = [];

    const actionRows = actions
      .filter((action) => matches(action.label, action.hint))
      .slice(0, SECTION_CAP)
      .map<Row>((action) => ({ type: "action", key: action.id, label: action.label, hint: action.hint, run: action.run, ...(action.badge ? { badge: action.badge } : {}) }));
    if (actionRows.length) built.push({ label: "Actions", rows: actionRows });

    // Local shell data answers before the network does.
    const localGoals = goals.filter((goal) => matches(goal.title)).slice(0, SECTION_CAP);
    const localProjects = projects.filter((project) => matches(project.title)).slice(0, SECTION_CAP);
    const remoteIds = new Set(remote.map((hit) => hit.id));
    if (localGoals.length) {
      built.push({ label: "Goals", rows: localGoals.filter((goal) => !remoteIds.has(goal.id)).map<Row>((goal) => ({ type: "link", key: `goal-${goal.id}`, label: goal.title, hint: "Goal", href: `/g/${encodeURIComponent(goal.id)}` as Route })) });
    }
    if (localProjects.length) {
      built.push({ label: "Projects", rows: localProjects.filter((project) => !remoteIds.has(project.id)).map<Row>((project) => ({ type: "link", key: `project-${project.id}`, label: project.title, hint: "Research project", href: "/research" as Route })) });
    }

    for (const [section, hits] of groupHits(remote)) {
      built.push({ label: section, rows: hits.slice(0, SECTION_CAP).map<Row>((hit) => ({ type: "link", key: `${hit.kind}-${hit.id}`, label: hit.title, hint: hit.snippet ? `${hit.context} · ${hit.snippet}` : hit.context, href: (hit.href ?? "/today") as Route })) });
    }

    const destinations: Row[] = [
      ...Object.entries(workspaceMeta)
        .filter(([view]) => view !== "goal" && view !== "account")
        .filter(([, meta]) => matches(meta.title, meta.description))
        .map<Row>(([view, meta]) => ({ type: "view", key: `view-${view}`, label: meta.title, hint: meta.description, view: view as WorkspaceView })),
      ...settingsDestinations
        .filter((entry) => matches(entry.label, entry.description))
        .map<Row>((entry) => ({ type: "link", key: `settings-${entry.segment}`, label: entry.label, hint: entry.description, href: entry.href })),
    ].slice(0, SECTION_CAP);
    if (destinations.length) built.push({ label: "Go to", rows: destinations });

    return built.filter((section) => section.rows.length);
  }, [actions, goals, projects, query, remote]);

  const flat = useMemo(() => sections.flatMap((section) => section.rows), [sections]);

  const run = useCallback((row: Row) => {
    onOpenChange(false);
    if (row.type === "action") { row.run(); return; }
    if (row.type === "view") { onNavigate(row.view); return; }
    router.push(row.href);
  }, [onNavigate, onOpenChange, router]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => (index + 1) % Math.max(1, flat.length)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => (index - 1 + flat.length) % Math.max(1, flat.length)); }
    else if (event.key === "Enter") {
      event.preventDefault();
      const row = flat[active];
      if (row) run(row);
    }
  }

  useEffect(() => {
    listRef.current?.querySelectorAll<HTMLElement>("[data-palette-row]")[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let index = -1;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="command-overlay" />
        <Dialog.Content className="command-panel" aria-describedby="command-description" onKeyDown={onKeyDown}>
          <Dialog.Title className="sr-only">Search Continuum</Dialog.Title>
          <Dialog.Description className="sr-only" id="command-description">
            Search actions, goals, projects, sources, papers, conversations, and concepts.
          </Dialog.Description>
          <div className="command-input">
            <Search size={19} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your workspace, or type a command"
              aria-label="Search your workspace"
              aria-activedescendant={flat[active] ? `palette-row-${flat[active]!.key}` : undefined}
            />
            <Dialog.Close aria-label="Close search"><X size={17} /></Dialog.Close>
          </div>
          {loading ? <div className="command-progress" role="progressbar" aria-label="Searching" /> : null}
          <div className="command-results" ref={listRef} role="listbox" aria-label="Search results">
            {sections.map((section) => (
              <div key={section.label} className="command-section">
                <p>{section.label}</p>
                {section.rows.map((row) => {
                  index += 1;
                  const rowIndex = index;
                  return (
                    <button
                      key={row.key}
                      id={`palette-row-${row.key}`}
                      data-palette-row
                      role="option"
                      aria-selected={rowIndex === active}
                      className={rowIndex === active ? "active" : undefined}
                      onMouseEnter={() => setActive(rowIndex)}
                      onClick={() => run(row)}
                    >
                      <span>{row.label}{row.type === "action" && row.badge ? <em> {row.badge}</em> : null}</span>
                      <small>{row.hint}</small>
                    </button>
                  );
                })}
              </div>
            ))}
            {!flat.length ? (
              <div className="command-empty">
                <Search size={20} />
                <span>No match for “{query}”.</span>
              </div>
            ) : null}
            {failed ? <p className="command-degraded">Some results unavailable.</p> : null}
          </div>
          <footer>
            <span><kbd>↑↓</kbd> move · <kbd>↵</kbd> open · <kbd>esc</kbd> close</span>
            <span>Search opens the matching record; it never changes your data.</span>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function groupHits(hits: SearchHit[]): Array<[string, SearchHit[]]> {
  // §8.4's section order, so the palette does not reshuffle as results arrive.
  const order = ["Goals", "Projects", "Sources & papers", "Conversations", "Concepts", "Notes", "Tasks", "Context"];
  const buckets = new Map<string, SearchHit[]>();
  for (const hit of hits) {
    const section = searchKindSection[hit.kind];
    buckets.set(section, [...(buckets.get(section) ?? []), hit]);
  }
  return [...buckets.entries()].sort((left, right) => order.indexOf(left[0]) - order.indexOf(right[0]));
}

export { workspacePath };
