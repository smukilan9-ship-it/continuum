import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Testing Library's auto-cleanup only registers itself when it can see a global
// `afterEach`, which vitest does not expose unless `globals: true`. Registering
// it here keeps `globals` off (the node suite imports its own `describe`/`it`).
afterEach(() => {
  cleanup();
});

/**
 * jsdom implements neither of these, and Radix calls both on every open. Without
 * them a dialog throws before it renders, which looks like a component bug.
 */
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

// Radix's `DismissableLayer` and Popover rely on Pointer Events, which jsdom
// does not implement at all.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

// `next/navigation` reads from an App Router context that no unit test can
// provide. Every screen-level component here is exercised through props, so the
// router is stubbed once rather than per file.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/home",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));
