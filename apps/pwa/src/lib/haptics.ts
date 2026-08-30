/**
 * Documentation: Short vibrations for the two things a gym counts.
 *
 * - Money arriving and somebody joining are the events a gym reacts to, and both usually happen with the phone in a hand and eyes somewhere else — on the member, on the card machine, on the door. A buzz confirms the thing landed without anybody having to look at the screen.
 * - Deliberately only those two, plus a failure. A device that buzzes on every tap teaches its owner to ignore it, and then the buzz that mattered is ignored too.
 * - Every call is a no-op where the API is missing (all of iOS Safari today, and every desktop) or where the user has asked for less motion. Nothing here is load-bearing; a flow that depends on a vibration would be broken on most phones.
 * - Primary exports: haptics.
 */

/**
 * Patterns are milliseconds, alternating buzz and pause.
 *
 * Kept short on purpose: anything past roughly 100ms per pulse stops reading as
 * feedback and starts reading as an alarm.
 */
const PATTERNS = {
  /** Money in. Two quick pulses — distinct from a notification's single buzz. */
  payment: [35, 60, 35],
  /** Somebody joined. One longer, softer note. */
  member: [60],
  /** It did not work. A single blunt buzz, deliberately unlike the other two. */
  failure: [120],
} as const;

export type HapticKind = keyof typeof PATTERNS;

function canVibrate() {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  if (!("vibrate" in navigator)) return false;
  // Vibration is motion the hand feels rather than the eye sees, but it is
  // still motion, and somebody who has turned motion down has said enough.
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function buzz(kind: HapticKind) {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(PATTERNS[kind] as unknown as number[]);
  } catch {
    // Some browsers throw rather than returning false when the page has never
    // been interacted with. A failed buzz is not worth a broken flow.
  }
}

export const haptics = {
  /** A payment was taken — at the desk, online, or in the store. */
  payment: () => buzz("payment"),
  /** A member was added, whether by staff or by the member signing up. */
  member: () => buzz("member"),
  /** The action failed. */
  failure: () => buzz("failure"),
};
