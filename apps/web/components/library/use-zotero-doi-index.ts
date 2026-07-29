"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeDoi } from "./types";

/**
 * The DOI index behind the "In your Zotero" chip (§13.2, AC-Z3, finding S6).
 *
 * Continuum has cross-referenced Zotero against OpenAlex by DOI since the
 * integration shipped and has never shown it to anyone. `/api/openalex`
 * attaches `zoteroMatches` to a *detail* response, which is one work at a time;
 * a result list needs the answer for twenty-five works at once, and AC-Z3
 * requires it "within one render of the results loading" — so a per-row lookup
 * is out.
 *
 * The index is therefore built once per session, in the background, from the
 * library the user is already entitled to read. Nothing blocks on it: results
 * render immediately and chips appear as soon as the index resolves.
 */

type ZoteroLibrary = { type: "user" | "group"; id: string; name: string };
type ZoteroItem = { key: string; title: string; doi?: string };

/** One page is 100 items; five pages is the point where the cost stops paying for itself. */
const pageSize = 100;
const maxPages = 5;

export type ZoteroDoiIndex = {
  /** Normalised DOI → the Zotero item title, for the chip's tooltip. */
  matches: Map<string, string>;
  /** True while pages are still arriving. Chips may still be incomplete. */
  loading: boolean;
  /** Zotero is connected and readable. False silences the chip entirely. */
  available: boolean;
  /** True when the library is larger than what was indexed, so absence is not proof. */
  partial: boolean;
};

const empty: ZoteroDoiIndex = { matches: new Map(), loading: false, available: false, partial: false };

export function useZoteroDoiIndex(enabled: boolean): ZoteroDoiIndex {
  const [index, setIndex] = useState<ZoteroDoiIndex>(empty);
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    const controller = new AbortController();

    async function build() {
      setIndex((current) => ({ ...current, loading: true }));
      try {
        const librariesResponse = await fetch("/api/connections/zotero?resource=libraries", { cache: "no-store", signal: controller.signal });
        if (!librariesResponse.ok) { setIndex(empty); return; }
        const payload = await librariesResponse.json() as { libraries?: ZoteroLibrary[] };
        const library = payload.libraries?.[0];
        if (!library) { setIndex(empty); return; }

        const matches = new Map<string, string>();
        let partial = false;
        for (let page = 0; page < maxPages; page += 1) {
          const parameters = new URLSearchParams({
            resource: "items",
            libraryType: library.type,
            libraryId: library.id,
            start: String(page * pageSize),
            limit: String(pageSize),
            sort: "dateModified",
            direction: "desc",
          });
          const response = await fetch(`/api/connections/zotero?${parameters}`, { cache: "no-store", signal: controller.signal });
          if (!response.ok) break;
          const body = await response.json() as { items?: ZoteroItem[]; total?: number };
          for (const item of body.items ?? []) {
            const doi = normalizeDoi(item.doi);
            if (doi) matches.set(doi, item.title);
          }
          const seen = page * pageSize + (body.items?.length ?? 0);
          if (!body.items?.length || seen >= (body.total ?? seen)) break;
          if (page === maxPages - 1 && seen < (body.total ?? 0)) partial = true;
        }
        setIndex({ matches, loading: false, available: true, partial });
      } catch {
        // A Zotero outage must never degrade scholarly browsing: the chip is an
        // enrichment, so failure means "no chips", not an error on the page.
        if (!controller.signal.aborted) setIndex(empty);
      }
    }

    void build();
    return () => controller.abort();
  }, [enabled]);

  return index;
}
