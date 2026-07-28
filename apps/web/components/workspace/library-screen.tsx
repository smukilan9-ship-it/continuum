"use client";

import { BookmarkCheck, ExternalLink, Network, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, DataRegion, EmptyState, ErrorState, LoadingState, type RegionStatus } from "@/components/ui";
import type { WorkspaceView } from "@/lib/workspace-routes";
import { PageHeader } from "./page-header";
import { ScholarlySearch, type SavedEntity, type ScholarlyKind } from "./scholarly-search";
import { ZoteroBrowser } from "./zotero-screen";

export type LibraryTab = "discover" | "saved" | "zotero";

const tabs: Array<{ id: LibraryTab; label: string }> = [
  { id: "discover", label: "Discover" },
  { id: "saved", label: "Saved" },
  { id: "zotero", label: "Zotero" },
];

/**
 * One destination for the whole "find and keep sources" job.
 *
 * Zotero and OpenAlex were two of twelve sidebar items pointing at two halves of
 * the same task, and one of them was empty for most users. They are now tabs of
 * a single Library screen that cross-links them: a Discover result matching a
 * Zotero item by DOI shows an "In your Zotero" chip, and a Zotero item with a
 * DOI can be opened in the citation graph.
 */
export function LibraryScreen({
  initialTab = "discover",
  showToast,
  onNavigate,
}: {
  initialTab?: LibraryTab;
  showToast: (message: string | null) => void;
  onNavigate: (view: WorkspaceView) => void;
}) {
  const [tab, setTab] = useState<LibraryTab>(initialTab);
  const [saved, setSaved] = useState<SavedEntity[]>([]);
  const [savedStatus, setSavedStatus] = useState<RegionStatus>("idle");
  const [savedError, setSavedError] = useState<string>();

  const loadSaved = useCallback(async () => {
    setSavedStatus("loading");
    setSavedError(undefined);
    try {
      const response = await fetch("/api/openalex?action=saved", { cache: "no-store" });
      const payload = await response.json() as { saved?: SavedEntity[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Saved entities are unavailable.");
      setSaved(payload.saved ?? []);
      setSavedStatus(payload.saved?.length ? "ready" : "empty");
    } catch (cause) {
      setSavedStatus("error");
      setSavedError(cause instanceof Error ? cause.message : "Saved entities are unavailable.");
    }
  }, []);

  // Loaded up front so the bookmark state on every result card is correct before
  // the user opens the Saved tab.
  useEffect(() => { void loadSaved(); }, [loadSaved]);

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
    } catch (cause) { showToast(cause instanceof Error ? cause.message : "The entity could not be removed."); }
  }

  function openInDiscover(kind: ScholarlyKind, id: string) {
    setTab("discover");
    window.history.pushState({}, "", `/library/${kind}/${id}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  return (
    <div className="screen library-screen">
      <PageHeader
        title="Library"
        description="Find sources in the public scholarly graph, keep the ones that matter, and browse your connected Zotero libraries. Discover and Zotero cross-reference each other by DOI."
        stats={[{ label: "saved", value: saved.length }]}
        actions={<Button className="button-secondary compact-button" onClick={() => onNavigate("integrations")}><ExternalLink size={14} aria-hidden="true" />Connections</Button>}
      >
        <nav className="section-tabs" role="tablist" aria-label="Library sections">
          {tabs.map((entry) => (
            <button key={entry.id} type="button" role="tab" aria-selected={tab === entry.id} className={tab === entry.id ? "active" : ""} onClick={() => setTab(entry.id)}>
              {entry.label}
              {entry.id === "saved" && saved.length ? <small>{saved.length}</small> : null}
            </button>
          ))}
        </nav>
      </PageHeader>

      {tab === "discover" ? (
        <ScholarlySearch mode="explore" showToast={showToast} savedEntities={saved} onSavedChange={() => void loadSaved()} deepLinkBase="/library" />
      ) : null}

      {tab === "saved" ? (
        <Card className="library-saved">
          <DataRegion
            status={savedStatus}
            loading={<LoadingState rows={4} label="Loading saved entities" />}
            error={<ErrorState title="We couldn't load your saved library" body={savedError} action={<Button className="button-secondary compact-button" onClick={() => void loadSaved()}>Try again</Button>} />}
            empty={<EmptyState icon={<BookmarkCheck size={20} />} title="Nothing saved yet" body="Bookmark a work, author, or topic to keep it here." action={<Button className="button-primary compact-button" onClick={() => setTab("discover")}><Search size={14} aria-hidden="true" />Discover sources</Button>} />}
          >
            {saved.map((entry) => (
              <article className="library-saved-row" key={entry.id}>
                <div>
                  <Badge tone="neutral">{entry.entity_type.slice(0, -1)}</Badge>
                  <strong>{entry.title}</strong>
                  <small>{entry.external_id}</small>
                </div>
                <div className="library-saved-actions">
                  <Button className="button-secondary compact-button" onClick={() => openInDiscover(entry.entity_type, entry.external_id)}><Network size={14} aria-hidden="true" />Open</Button>
                  <Button className="button-quiet compact-button" onClick={() => void unsave(entry)} aria-label={`Remove ${entry.title} from saved`}><Trash2 size={14} aria-hidden="true" />Remove</Button>
                </div>
              </article>
            ))}
          </DataRegion>
        </Card>
      ) : null}

      {tab === "zotero" ? <ZoteroBrowser showToast={showToast} onNavigate={onNavigate} /> : null}
    </div>
  );
}
