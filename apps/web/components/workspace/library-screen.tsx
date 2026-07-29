"use client";

/**
 * `/library` moved into `components/library/*` in Phase 6 (redesign.md §13.2).
 *
 * This file stays as the entry point the workspace screen registry imports, so
 * the route wiring did not have to change while the screen was rebuilt. It
 * carries no logic.
 */

export { LibraryPage as LibraryScreen } from "@/components/library/library-page";
export type { LibraryTab } from "@/components/library/types";
