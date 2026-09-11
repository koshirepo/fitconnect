/**
 * Documentation: Pausing a membership.
 *
 * - One slice of the shared contract surface. `types/models.ts` re-exports every slice, so nothing that imports from there had to change when this was split out of it.
 * - Treat these as the shape the API promises, not as a mirror of Prisma's own models.
 */

// ─── Membership freezes ───────────────────────────────────────────────────────

export interface MembershipFreeze {
  id: string;
  startsOn: string;
  plannedEndsOn: string;
  endedOn?: string | null;
  daysUsed: number;
  reason?: string | null;
  /** "ENDED_EARLY" | "ATTENDED", or null when it ran its course. */
  endedBy?: string | null;
  createdAt: string;
}

/** Everything a screen needs to decide whether to offer a freeze. */
export interface FreezeStatus {
  canFreeze: boolean;
  reason?: string | null;
  planTitle?: string;
  allowanceDays: number;
  usedDays: number;
  remainingDays: number;
  allowedFreezes: number;
  usedFreezes: number;
  /** Running right now — the member is paused today. */
  currentFreeze: MembershipFreeze | null;
  /**
   * Booked but not yet started. Cancelling it returns every day to the budget.
   *
   * Separate from `currentFreeze` because a member with a break booked for next
   * month is still training today, and reporting them as frozen contradicted
   * the guard that decides whether they may buy a new term.
   */
  scheduledFreeze?: MembershipFreeze | null;
  history: MembershipFreeze[];
  termEndsOn?: string | null;
}
