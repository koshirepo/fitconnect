/**
 * Documentation: Who came in, when, and who has stopped coming.
 *
 * - One slice of the shared contract surface. `types/models.ts` re-exports every slice, so nothing that imports from there had to change when this was split out of it.
 * - Treat these as the shape the API promises, not as a mirror of Prisma's own models.
 */

import type { TodoVisibility } from "../enums";

// ─── Attendance ───────────────────────────────────────────────────────────────

export interface TodoActor {
  membershipId: string;
  userId: string;
  memberId: number;
  name: string;
  avatarUrl?: string | null;
  role: string;
}

export interface Todo {
  id: string;
  tenantId: string;
  title: string;
  description?: string | null;
  visibility: TodoVisibility;
  isCompleted: boolean;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: TodoActor | null;
  updatedBy?: TodoActor | null;
  completedBy?: TodoActor | null;
}

export interface CreateTodoPayload {
  title: string;
  description?: string;
  visibility?: TodoVisibility;
}

export interface UpdateTodoPayload {
  title?: string;
  description?: string | null;
  visibility?: TodoVisibility;
  isCompleted?: boolean;
}

export interface AttendanceRecord {
  id: string;
  /**
   * The shift day. For a shift that runs past midnight this is the date the
   * shift *started*, not the date on the clock when the punch happened.
   */
  date: string;
  /** The first tap of the session. */
  checkInAt: string;
  /**
   * The last tap. Null while somebody is still inside — and also on a session
   * nobody ever closed, which `closedAutomatically` is what distinguishes.
   */
  checkOutAt?: string | null;
  /** The shift the session belongs to, absent for a visit outside every one. */
  shiftId?: string | null;
  /** That shift's name, for the register. */
  shiftName?: string | null;
  /** True when the nightly sweep gave up on an unclosed session. */
  closedAutomatically?: boolean;
  note?: string | null;
  membershipId?: string;
  memberId?: number;
  memberName?: string;
  memberAvatarUrl?: string | null;
  markedBy?: { id: string; name: string } | null;
}

export interface AttendanceSummary {
  thisMonth: number;
  thisWeek: number;
}

/**
 * A member who has stopped turning up while their membership is still running.
 *
 * The renewal date says when the money is at stake; `absentDays` says whether
 * it is already lost. Both travel together because the call the desk makes
 * depends on the pair — somebody absent three weeks who renews on Friday is a
 * phone call today, and the same absence with eight months paid up is not.
 */
export interface AtRiskMember {
  membershipId: string;
  memberId: number;
  name: string;
  phone?: string | null;
  avatarUrl?: string | null;
  /** Last check-in, or null for a member who has never been recorded present. */
  lastVisitOn: string | null;
  /** Days since that visit, counted from the gym's own today. */
  absentDays: number | null;
  /** When their current term runs out, if they are on one. */
  dueDate?: string | null;
  /** Days until that date. Negative once it has passed. */
  daysToDue: number | null;
  joinedAt: string;
  /**
   * When somebody last messaged this member about the absence, so the desk can
   * see a chase is already in flight rather than making it twice.
   */
  lastNudgedOn: string | null;
}

export interface AtRiskSummary {
  /** The absence threshold this list was built with. */
  thresholdDays: number;
  /** Members past it. */
  total: number;
  /** Of those, how many also renew within the next fortnight. */
  dueSoon: number;
  /** Excluded from the list because their term is deliberately paused. */
  frozen: number;
  timezone: string;
}

/**
 * When the floor is busy, as a week of local hours.
 *
 * Self check-ins only. A staff mark records when somebody at the desk pressed
 * the button, not when the member walked in, so counting those would invent
 * whatever hour the desk does its paperwork in. `manualMarks` says how many
 * were left out for that reason — a gym that marks everybody by hand needs to
 * be told why its chart is empty.
 */
export interface AttendanceHeatmap {
  /** `[day][hour]` visit counts. Day 0 is Monday, hour 0 is local midnight. */
  grid: number[][];
  summary: AttendanceHeatmapSummary;
  /** How full the floor was, from whole visits: check-in to check-out. */
  occupancy?: AttendanceOccupancy;
}

export interface AttendanceOccupancy {
  /**
   * `[day][hour]` average headcount over the window. 6.5 means that on a
   * typical day at that hour six or seven people were inside.
   */
  grid: number[][];
  peakDay: number | null;
  peakHour: number | null;
  /** The fullest cell's value. */
  peak: number;
  /** Mean length of a completed visit, in minutes. */
  averageStayMinutes: number | null;
  /** Visits spread onto the grid. */
  sessions: number;
  /** Visits left out because nobody tapped out, so their length is unknown. */
  withoutCheckout: number;
}

export interface AttendanceHeatmapSummary {
  weeks: number;
  /** Self check-ins placed on the grid. */
  total: number;
  /** Local hour with the most visits, or null when there are none. */
  busiestHour: number | null;
  /** Day 0–6 with the most visits, or null when there are none. */
  busiestDay: number | null;
  /** Staff-marked visits in the window, excluded from the grid. */
  manualMarks: number;
  /** Visits that could not be placed because the zone was unreadable. */
  unplaced: number;
  timezone: string;
  from: string;
  to: string;
}

export interface MarkAttendancePayload {
  membershipId?: string;
  date?: string;
  note?: string;
}

export interface MarkAllAttendancePayload {
  membershipIds: string[];
  date?: string;
}
