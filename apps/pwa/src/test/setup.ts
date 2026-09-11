/**
 * Documentation: What every PWA test gets for free.
 *
 * - `jest-dom` matchers, so an assertion reads `toBeDisabled()` rather than a hand-rolled attribute check.
 * - Stubs for the browser APIs jsdom does not implement but this app calls on render. Without them a component fails on a missing `matchMedia` before it reaches anything worth asserting, which reads as a broken test rather than a missing environment.
 * - Nothing here mocks application code. A stub that hides the behaviour under test is worse than no test.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Each test starts on an empty document. Without this, a query that should
// find one element finds three, from the two tests before it.
afterEach(() => {
  cleanup();
  localStorage.clear();
});

/** The theme toggle and the responsive layout both read this on mount. */
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

/** Lists that lazy-load on scroll observe themselves into view. */
if (!window.IntersectionObserver) {
  window.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
    takeRecords: vi.fn(() => []),
  })) as unknown as typeof IntersectionObserver;
}

if (!window.ResizeObserver) {
  window.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })) as unknown as typeof ResizeObserver;
}

/** `scrollIntoView` is called by pill strips and confirm dialogs. */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}
