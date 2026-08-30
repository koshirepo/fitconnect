/**
 * Documentation: Cross-fade between pages using the View Transitions API.
 *
 * - Holds back the location the router renders until the browser has taken a snapshot of the outgoing page, so React's swap happens *inside* a transition and the two screens cross-fade instead of replacing each other in one frame. Without the deferral there is nothing to fade from: React has already thrown the old DOM away by the time a transition could start.
 * - Only a change of `pathname` counts. The tab strips on the member and payment screens navigate by writing search params, and those are already animated by `SwipePane` — running a page transition over them would be two animations fighting for the same pixels.
 * - Unsupported browsers, and anyone who has asked for less motion, get the plain assignment. `startViewTransition` exists only in Chromium today, so this has to be an enhancement rather than the mechanism.
 * - Primary exports: useViewTransitionLocation.
 */
import * as React from "react";
import { flushSync } from "react-dom";
import { useLocation, type Location } from "react-router-dom";

/** Chromium-only today, so it is read defensively rather than typed as present. */
type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

/**
 * Whether this particular move is worth animating.
 *
 * A different path is a different page. The same path with different search
 * params is a tab or a filter, which `SwipePane` already animates — and which
 * has to reach the router immediately, because the screen reads its own state
 * out of those params.
 */
function shouldAnimate(next: Location, current: Location) {
  if (next.pathname === current.pathname) return false;
  if (typeof document === "undefined") return false;
  if (!(document as DocumentWithViewTransition).startViewTransition) return false;
  // A transition is motion. Somebody who has turned motion down has said what
  // they want, and it is not a cross-fade on every page.
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The location to hand `<Routes>`, one beat behind the real one while a
 * transition is running.
 */
export function useViewTransitionLocation(): Location {
  const location = useLocation();
  const [rendered, setRendered] = React.useState(location);

  // Everything that is not being animated is adopted during render rather than
  // in an effect: React's own "adjusting state when a prop changes" pattern.
  // Deferring a tab change to an effect would paint one frame of the old query
  // first, and the tab strips would visibly flick back before moving on.
  if (rendered !== location && !shouldAnimate(location, rendered)) {
    setRendered(location);
  }

  React.useEffect(() => {
    if (rendered === location || !shouldAnimate(location, rendered)) return;

    // `flushSync` is what makes this work: the callback must have finished
    // painting the new page before it returns, and React would otherwise batch
    // the update to after the transition had already given up waiting.
    (document as DocumentWithViewTransition).startViewTransition!(() => {
      flushSync(() => setRendered(location));
    });
  }, [location, rendered]);

  return rendered;
}
