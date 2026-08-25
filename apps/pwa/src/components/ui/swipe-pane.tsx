/**
 * Documentation: Swipeable content with a directional transition.
 *
 * - Wraps whatever is currently showing — a filtered list, one record's detail — and animates it in from the side the movement came from, so going forward slides in from the right and going back slides in from the left.
 * - Direction is derived from `paneIndex` rather than from the gesture, so a tab tap, a swipe, and the browser back button all animate the same way. Position in the set is the thing that actually moved.
 * - The animation replays because `paneKey` changes remount the inner element. No key change, no animation — re-rendering the same content should not flash.
 * - Honours `prefers-reduced-motion` by skipping the movement rather than shortening it.
 * - Primary exports: SwipePane.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { useSwipe } from "@/lib/use-swipe";

export function SwipePane({
  paneKey,
  paneIndex,
  onNext,
  onPrevious,
  enabled = true,
  className,
  children,
}: {
  /** Changing this replays the transition. Usually the tab value or record id. */
  paneKey: string;
  /** Where this pane sits in the set; the change in it gives the direction. */
  paneIndex: number;
  /** Swipe right-to-left: forward, the next tab or next record. */
  onNext?: () => void;
  /** Swipe left-to-right: back. */
  onPrevious?: () => void;
  enabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const lastIndex = React.useRef(paneIndex);

  // Read during render so the class is right on the first paint after a change;
  // an effect would run a frame too late and the animation would start from the
  // wrong side.
  const direction =
    paneIndex > lastIndex.current
      ? "next"
      : paneIndex < lastIndex.current
        ? "previous"
        : null;

  React.useEffect(() => {
    lastIndex.current = paneIndex;
  }, [paneIndex]);

  const swipe = useSwipe({
    enabled: enabled && Boolean(onNext || onPrevious),
    onSwipeLeft: () => onNext?.(),
    onSwipeRight: () => onPrevious?.(),
  });

  return (
    // `touch-pan-y` keeps vertical scrolling native while horizontal drags
    // reach the handlers.
    <div {...swipe} className={cn("touch-pan-y", className)}>
      <div
        key={paneKey}
        className={cn(
          "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 motion-safe:ease-out",
          direction === "next" && "motion-safe:slide-in-from-right-6",
          direction === "previous" && "motion-safe:slide-in-from-left-6",
        )}
      >
        {children}
      </div>
    </div>
  );
}
