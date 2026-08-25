/**
 * Documentation: Horizontal swipe gestures.
 *
 * - Turns a touch drag across an element into a left/right callback, for the phone-sized screens this app mostly runs on.
 * - Deliberately touch-only. A mouse drag would fight text selection, and a trackpad has no equivalent gesture to bind here.
 * - The guards matter more than the detection: a swipe has to travel far enough, stay mostly horizontal, and finish quickly, or a slow vertical scroll would keep firing it by accident.
 * - Primary exports: useSwipe, SwipeHandlers.
 */
import * as React from "react";

/** How far a finger must travel before it counts as a swipe, in pixels. */
const MIN_DISTANCE = 60;
/** How much more horizontal than vertical the travel must be. */
const DIRECTION_RATIO = 1.5;
/** A drag slower than this is someone scrolling or hesitating, not swiping. */
const MAX_DURATION_MS = 800;

export type SwipeHandlers = {
  onTouchStart: (event: React.TouchEvent) => void;
  onTouchEnd: (event: React.TouchEvent) => void;
};

export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  enabled = true,
}: {
  /** Finger moved right-to-left — conventionally "forward". */
  onSwipeLeft?: () => void;
  /** Finger moved left-to-right — conventionally "back". */
  onSwipeRight?: () => void;
  enabled?: boolean;
}): SwipeHandlers {
  const start = React.useRef<{ x: number; y: number; at: number } | null>(null);

  const onTouchStart = React.useCallback(
    (event: React.TouchEvent) => {
      if (!enabled) return;
      // Two fingers is a pinch or a system gesture; leave it alone.
      if (event.touches.length !== 1) {
        start.current = null;
        return;
      }
      const touch = event.touches[0];
      start.current = { x: touch.clientX, y: touch.clientY, at: Date.now() };
    },
    [enabled],
  );

  const onTouchEnd = React.useCallback(
    (event: React.TouchEvent) => {
      const from = start.current;
      start.current = null;
      if (!enabled || !from) return;

      const touch = event.changedTouches[0];
      if (!touch) return;

      const dx = touch.clientX - from.x;
      const dy = touch.clientY - from.y;

      if (Date.now() - from.at > MAX_DURATION_MS) return;
      if (Math.abs(dx) < MIN_DISTANCE) return;
      if (Math.abs(dx) < Math.abs(dy) * DIRECTION_RATIO) return;

      if (dx < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    },
    [enabled, onSwipeLeft, onSwipeRight],
  );

  return { onTouchStart, onTouchEnd };
}
