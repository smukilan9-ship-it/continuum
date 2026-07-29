"use client";

import { useCallback, useEffect, useState } from "react";

export type Resource<T> = {
  status: "loading" | "ready" | "error";
  data?: T;
  error?: string;
};

/**
 * One independently-resolving read.
 *
 * Connections used to `await Promise.allSettled([...])` over three endpoints and
 * then set every piece of state at once, so the slowest request decided when
 * anything appeared — roughly seven seconds of blank page with no skeleton
 * (S14). Each card now owns a resource that starts in `loading`, so the shell
 * paints immediately and a slow endpoint only delays its own card.
 */
export function useResource<T>(url: string, fallbackError: string) {
  const [resource, setResource] = useState<Resource<T>>({ status: "loading" });

  const load = useCallback(async () => {
    setResource((current) => ({ status: "loading", data: current.data }));
    try {
      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json() as T & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? fallbackError);
      setResource({ status: "ready", data: payload });
    } catch (cause) {
      setResource({ status: "error", error: cause instanceof Error ? cause.message : fallbackError });
    }
  }, [fallbackError, url]);

  useEffect(() => { void load(); }, [load]);

  return [resource, load] as const;
}
