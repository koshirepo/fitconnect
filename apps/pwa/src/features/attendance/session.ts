/**
 * Documentation: Reading one attendance session.
 *
 * - A visit is a check-in, a check-out, and the shift it fell in. These helpers are the one place that decides what a session with no check-out means, so the register, the calendar and a member's own history agree.
 * - "Inside" is only ever today. A session from an earlier day with no tap out is somebody who forgot to check out, whether or not the nightly sweep has reached it yet.
 * - Primary exports: SessionState, sessionState, stayMinutes, stayLabel, clockTime.
 */

export type SessionLike = {
  checkInAt: string;
  checkOutAt?: string | null;
  closedAutomatically?: boolean;
};

export type SessionState = "out" | "inside" | "no-checkout";

/** "07:12", in the viewer's own clock. */
export function clockTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** "1h 12m", "45m". */
export function stayLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h${rest ? ` ${rest}m` : ""}` : `${rest}m`;
}

/** How long the visit lasted, or null while it has no check-out. */
export function stayMinutes(session: SessionLike) {
  if (!session.checkOutAt) return null;
  const minutes =
    (new Date(session.checkOutAt).getTime() - new Date(session.checkInAt).getTime()) / 60_000;
  return minutes > 0 ? minutes : null;
}

/** Where a visit stands, given whether it is on today's date. */
export function sessionState(session: SessionLike, isToday: boolean): SessionState {
  if (session.checkOutAt) return "out";
  if (isToday && !session.closedAutomatically) return "inside";
  return "no-checkout";
}
