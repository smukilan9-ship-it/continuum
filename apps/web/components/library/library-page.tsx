"use client";

import { ExternalLink, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Tabs, type RegionStatus } from "@/components/ui";
import { useAssistant } from "@/components/assistant/use-assistant";
import { PageHeader } from "@/components/workspace/page-header";
import { text, type WorkspaceState } from "@/components/workspace/types";
import type { SavedEntity, ScholarlyKind } from "@/components/workspace/scholarly-search";
import { ScholarlySearch } from "@/components/workspace/scholarly-search";
import type { NormalizedScholarlyWork } from "@/lib/scholarly";
import type { WorkspaceView } from "@/lib/workspace-routes";
import { AddSourceDialog } from "./add-source-dialog";
import { SavedTab } from "./saved-tab";
import { SourcesTab } from "./sources-tab";
import "./library.css";
import {
  isLibraryTab,
  normalizeSourceRow,
  savedWorkAsSource,
  unfiledDestination,
  type Destination,
  type LibrarySource,
  type LibraryTab,
} from "./types";
import { ZoteroBrowser } from "./zotero-browser";

const tabOptions: Array<{ value: LibraryTab; label: string }> = [
  { value: "sources", label: "Sources" },
  { value: "discover", label: "Discover" },
  { value: "saved", label: "Saved" },
  { value: "zotero", label: "Zotero" },
];

/**
 * `/library` — one place to find, keep, and open material (§13.2).
 *
 * Sources leads, because the first question anyone brings to a library is
 * "what do I have?", and the old screen could not answer it: uploads were
 * buried inside a Research project, Zotero imports were invisible, and saved
 * papers lived in a fourth place. Discover, Saved and Zotero are the three
 * ways material arrives; Sources is where all of it lands.
 */
export function LibraryPage({
  initialTab,
  showToast,
  onNavigate,
  state,
}: {
  initialTab?: LibraryTab;
  showToast: (message: string | null) => void;
  state?: WorkspaceState;
  onNavigate: (view: WorkspaceView) => void;
}) {
  const assistant = useAssistant();
  const [tab, setTab] = useState<LibraryTab>(initialTab ?? "sources");
  const [sources, setSources] = useState<LibrarySource[]>([]);
  const [sourceStatus, setSourceStatus] = useState<RegionStatus>("loading");
  const [sourceError, setSourceError] = useState<string>();
  const [saved, setSaved] = useState<SavedEntity[]>([]);
  const [savedStatus, setSavedStatus] = useState<RegionStatus>("loading");
  const [savedError, setSavedError] = useState<string>();
  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState<string>();
  const [target, setTarget] = useState<Destination>();
  const [zoteroConnected, setZoteroConnected] = useState(false);
  const [seed, setSeed] = useState<{ query: string; searchBy?: "doi"; token: number }>();

  /**
   * The one place a save can land. `projects` carry the goal they serve so the
   * picker reads "OASIS — Raise SAT score", never a bare id.
   */
  const destinations = useMemo<Destination[]>(() => {
    const goalTitles = new Map<string, string>();
    for (const goal of state?.goals ?? []) {
      const id = text(goal, "id");
      if (id) goalTitles.set(id, text(goal, "title"));
    }
    const projects = (state?.projects ?? []).map((project) => {
      const id = text(project, "id");
      const goalId = text(project, "goalId") || text(project, "goal_id");
      return { id, label: text(project, "title", "Untitled project"), goalTitle: goalTitles.get(goalId), projectId: id };
    }).filter((entry) => entry.id);
    return [unfiledDestination, ...projects];
  }, [state]);

  /**
   * Discover opened as two empty panels with nothing to act on. These are real
   * starting points taken from the user's own research projects, so the first
   * search is one click rather than a blank field.
   *
   * Projects only — goal titles are outcome statements ("Raise SAT score from
   * 1520 to 1570+"), which make nonsense scholarly queries.
   */
  const suggestions = useMemo(() => {
    if (!state) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of state.projects) {
      const title = text(row, "title").trim();
      if (!title) continue;
      // Project titles are often "OASIS — cross-marker spatial association";
      // the descriptive half is the searchable part.
      const phrase = (title.split(/\s[—–-]\s/).pop() ?? title).trim();
      const key = phrase.toLowerCase();
      if (phrase.length < 4 || seen.has(key)) continue;
      seen.add(key);
      out.push(phrase.length > 64 ? `${phrase.slice(0, 61)}…` : phrase);
      if (out.length >= 5) break;
    }
    return out;
  }, [state]);

  const loadSources = useCallback(async () => {
    setSourceStatus("loading");
    setSourceError(undefined);
    try {
      const response = await fetch("/api/sources", { cache: "no-store" });
      const payload = await response.json() as { sources?: Array<Record<string, unknown>>; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Your sources are unavailable.");
      setSources((payload.sources ?? []).map(normalizeSourceRow).filter((row): row is LibrarySource => Boolean(row)));
      setSourceStatus("ready");
    } catch (cause) {
      setSourceStatus("error");
      setSourceError(cause instanceof Error ? cause.message : "Your sources are unavailable.");
    }
  }, []);

  const loadSaved = useCallback(async () => {
    setSavedStatus("loading");
    setSavedError(undefined);
    try {
      const response = await fetch("/api/openalex?action=saved", { cache: "no-store" });
      const payload = await response.json() as { saved?: SavedEntity[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Saved entities are unavailable.");
      setSaved(payload.saved ?? []);
      setSavedStatus("ready");
    } catch (cause) {
      setSavedStatus("error");
      setSavedError(cause instanceof Error ? cause.message : "Saved entities are unavailable.");
    }
  }, []);

  // Both load up front: the Sources tab merges them, and the bookmark state on
  // every Discover result has to be correct before the first search returns.
  useEffect(() => { void loadSources(); void loadSaved(); }, [loadSources, loadSaved]);

  // Zotero presence is a single probe, not a per-render guess: it decides
  // whether the Add-source dialog offers the import route at all.
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/connections/zotero?resource=libraries", { cache: "no-store" })
      .then((response) => { if (!cancelled) setZoteroConnected(response.ok); })
      .catch(() => { if (!cancelled) setZoteroConnected(false); });
    return () => { cancelled = true; };
  }, []);

  /**
   * `?tab=` selects the tab, `?target=` names where saves land, and a
   * `/library/{kind}/{id}` deep link is always a Discover selection.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const apply = () => {
      const parameters = new URLSearchParams(window.location.search);
      const requested = parameters.get("tab") ?? undefined;
      if (/^\/(?:library|openalex)\/[a-z]+\/[A-Za-z]\d+/i.test(window.location.pathname)) setTab("discover");
      else if (isLibraryTab(requested)) setTab(requested);
    };
    apply();
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = new URLSearchParams(window.location.search).get("target");
    if (!raw) return;
    const [kind, id] = raw.split(":");
    if (!id) return;
    if (kind === "p") {
      const match = destinations.find((entry) => entry.projectId === id);
      if (match) { setTarget(match); setTab("discover"); }
      return;
    }
    if (kind === "g") {
      // A goal is not itself a destination — its projects are. Land on the
      // first one and say so, rather than silently filing nowhere.
      const goalTitle = (state?.goals ?? []).map((goal) => ({ id: text(goal, "id"), title: text(goal, "title") })).find((goal) => goal.id === id)?.title;
      const match = destinations.find((entry) => entry.goalTitle && entry.goalTitle === goalTitle);
      if (match) { setTarget(match); setTab("discover"); }
    }
  }, [destinations, state]);

  function selectTab(next: LibraryTab) {
    setTab(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    // A deep-linked entity path is not a tab; going back to a tab returns to
    // /library so the two cannot disagree about what is on screen.
    url.pathname = "/library";
    url.searchParams.set("tab", next);
    window.history.pushState({}, "", `${url.pathname}${url.search}`);
  }

  /** Everything the user has, in one list (§13.2 Sources tab). */
  const allSources = useMemo(() => {
    const savedWorks = saved.filter((entry) => entry.entity_type === "works").map(savedWorkAsSource);
    return [...sources, ...savedWorks];
  }, [saved, sources]);

  /**
   * §8.5: "Ask about this" opens the ⌘J panel with the source attached as the
   * page chip, so the assistant retrieves that source's passages rather than
   * searching the whole library for a title the user just clicked.
   */
  function ask(subject: string, sourceId?: string) {
    assistant.askFromPage({
      page: { kind: "source", ...(sourceId && !sourceId.startsWith("saved:") ? { id: sourceId } : {}), label: `Source: ${subject}` },
      prompt: `About “${subject}”: `,
    });
  }

  async function deleteSource(source: LibrarySource) {
    if (source.id.startsWith("saved:")) {
      const entry = saved.find((candidate) => `saved:${candidate.entity_type}:${candidate.external_id}` === source.id);
      if (entry) await unsave(entry);
      return;
    }
    setBusyId(source.id);
    try {
      const response = await fetch(`/api/sources?sourceId=${encodeURIComponent(source.id)}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The source could not be removed.");
      showToast("Source excluded from retrieval and cleanup queued.");
      await loadSources();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "The source could not be removed.");
    } finally { setBusyId(undefined); }
  }

  /**
   * §13.2 "Send to project". `PATCH /api/sources` is the write that was missing
   * when this action shipped disabled; the project is ownership-checked server
   * side, so the picker cannot be used to reach someone else's work.
   */
  async function sendToProject(source: LibrarySource, projectId: string | null) {
    setBusyId(source.id);
    try {
      const response = await fetch("/api/sources", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceId: source.id, projectId }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The source could not be filed.");
      const label = projectId ? destinations.find((entry) => entry.projectId === projectId)?.label ?? "that project" : unfiledDestination.label;
      showToast(projectId ? `Filed into ${label}.` : "Removed from its project. It stays in your library.");
      await loadSources();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "The source could not be filed.");
    } finally { setBusyId(undefined); }
  }

  /**
   * The stored original never has a browser-reachable URL, so the download is a
   * same-origin request the server answers with the bytes. A failure is
   * reported in words rather than a broken tab.
   */
  async function downloadSource(source: LibrarySource) {
    setBusyId(source.id);
    try {
      const response = await fetch(`/api/sources/download?sourceId=${encodeURIComponent(source.id)}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error ?? "The original could not be downloaded.");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = source.title;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "The original could not be downloaded.");
    } finally { setBusyId(undefined); }
  }

  async function unsave(entry: SavedEntity) {
    try {
      const response = await fetch("/api/openalex", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "unsave", kind: entry.entity_type, id: entry.external_id }),
      });
      if (!response.ok) throw new Error("The entity could not be removed.");
      showToast("Removed from your saved library.");
      await loadSaved();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "The entity could not be removed.");
    }
  }

  function openInDiscover(kind: ScholarlyKind, id: string) {
    setTab("discover");
    if (typeof window === "undefined") return;
    window.history.pushState({}, "", `/library/${kind}/${id}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  /** Save from a Discover row into the destination the row's picker names. */
  async function saveWork(work: NormalizedScholarlyWork, destination: Destination) {
    try {
      if (destination.projectId) {
        const response = await fetch("/api/research/discovery", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "save", projectId: destination.projectId, work }),
        });
        const payload = await response.json() as { error?: string; message?: string };
        if (!response.ok) throw new Error(payload.error ?? "The paper could not be saved.");
        showToast(payload.message ?? `Saved to ${destination.label}.`);
        await loadSources();
        return;
      }
      if (work.sourceProvider !== "openalex") {
        showToast("Crossref-only records need a project. Choose one from Save ▾.");
        return;
      }
      const response = await fetch("/api/openalex", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save", kind: "works", id: work.providerId, title: work.title, metadata: work }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The work could not be saved.");
      showToast("Saved to your library.");
      await loadSaved();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "The work could not be saved.");
    }
  }

  return (
    <div className="screen library-screen">
      <PageHeader
        title="Library"
        description="Everything you have kept, one search across 250M+ works from OpenAlex, and your connected Zotero libraries. Discover and Zotero cross-reference each other by DOI."
        stats={[{ label: "sources", value: allSources.length }, { label: "saved", value: saved.length }]}
        actions={
          <>
            <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}><Plus size={14} aria-hidden="true" />Add source</Button>
            <Button variant="secondary" size="sm" onClick={() => onNavigate("integrations")}><ExternalLink size={14} aria-hidden="true" />Connections</Button>
          </>
        }
      >
        <Tabs
          label="Library sections"
          value={tab}
          onChange={selectTab}
          options={tabOptions.map((option) => ({
            ...option,
            panelId: `library-${option.value}`,
            badge: option.value === "sources" && allSources.length ? allSources.length : option.value === "saved" && saved.length ? saved.length : undefined,
          }))}
        />
      </PageHeader>

      <div id={`library-${tab}`} role="tabpanel" aria-labelledby={`library-${tab}-tab`} className="library-panel">
        {tab === "sources" ? (
          <SourcesTab
            sources={allSources}
            status={sourceStatus}
            error={sourceError}
            destinations={destinations}
            busyId={busyId}
            onReload={() => void loadSources()}
            onAdd={() => setAddOpen(true)}
            onAsk={(source) => ask(source.title, source.id)}
            onDelete={(source) => deleteSource(source)}
            onSendToProject={(source, projectId) => sendToProject(source, projectId)}
            onDownload={(source) => void downloadSource(source)}
          />
        ) : null}

        {tab === "discover" ? (
          <ScholarlySearch
            mode="explore"
            showToast={showToast}
            savedEntities={saved}
            onSavedChange={() => void loadSaved()}
            deepLinkBase="/library"
            suggestions={suggestions}
            destinations={destinations}
            target={target}
            onChangeTarget={(destination) => setTarget(destination)}
            onSaveWork={(work, destination) => saveWork(work, destination)}
            onAsk={(work) => ask(work.title)}
            seed={seed}
          />
        ) : null}

        {tab === "saved" ? (
          <SavedTab
            saved={saved}
            status={savedStatus}
            error={savedError}
            onReload={() => void loadSaved()}
            onOpen={openInDiscover}
            onRemove={(entry) => void unsave(entry)}
            onDiscover={() => selectTab("discover")}
          />
        ) : null}

        {tab === "zotero" ? (
          <ZoteroBrowser
            showToast={showToast}
            onImported={() => loadSources()}
            onFindInOpenAlex={(doi) => {
              // The crossing completes here: the Discover tab opens with the
              // DOI search already run, not with an empty field.
              setSeed({ query: doi, searchBy: "doi", token: Date.now() });
              selectTab("discover");
            }}
          />
        ) : null}
      </div>

      <AddSourceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        destinations={destinations}
        defaultDestinationId={target?.id}
        existing={allSources}
        zoteroConnected={zoteroConnected}
        showToast={showToast}
        onUploaded={async () => { await loadSources(); await loadSaved(); }}
        onOpenExisting={() => selectTab("sources")}
        onImportFromZotero={() => selectTab("zotero")}
      />
    </div>
  );
}
