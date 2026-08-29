/**
 * Documentation: Once-a-day cadence for the app's own prompts.
 *
 * - The install and notification offers are worth repeating — someone who says "not now" on Tuesday may well install on Wednesday — but repeating them within a session is nagging. So each is allowed one appearance per calendar day, per device.
 * - Keyed on the local calendar date rather than a rolling 24 hours: a member who dismissed at 9pm should see it again the next evening, not be told at 9pm sharp. Day boundaries are also what a person means by "every day".
 * - `never` is the escape hatch behind "Don't ask again", so a member who has decided can be left alone without the app pretending to forget.
 * - Primary exports: shouldNudgeToday, snoozeNudgeForToday, silenceNudge, isNudgeSilenced.
 */

const STORAGE_PREFIX = "fitconnect.nudge";

export type NudgeKey = "install" | "notifications";

/** Local calendar day, e.g. "2026-08-29". */
function today(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function read(key: NudgeKey) {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}.${key}`);
  } catch {
    return null;
  }
}

function write(key: NudgeKey, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}.${key}`, value);
  } catch {
    // A device with no storage simply gets asked again; that is the safe way to fail.
  }
}

/** True when this prompt has not already had its turn today. */
export function shouldNudgeToday(key: NudgeKey, now = new Date()) {
  const stored = read(key);
  if (stored === "never") return false;
  return stored !== today(now);
}

/** Take this prompt out of rotation until tomorrow. */
export function snoozeNudgeForToday(key: NudgeKey, now = new Date()) {
  write(key, today(now));
}

/** Stop asking altogether, for a member who has made up their mind. */
export function silenceNudge(key: NudgeKey) {
  write(key, "never");
}

export function isNudgeSilenced(key: NudgeKey) {
  return read(key) === "never";
}
