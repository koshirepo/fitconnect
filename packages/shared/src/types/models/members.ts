/**
 * Documentation: The roster: a member, their profile, and the shifts they train in.
 *
 * - One slice of the shared contract surface. `types/models.ts` re-exports every slice, so nothing that imports from there had to change when this was split out of it.
 * - Treat these as the shape the API promises, not as a mirror of Prisma's own models.
 */

import type { AccountStatus, PaymentStatus } from "../enums";
import type { Gender } from "./auth";
import type { PaymentSummary } from "./signup";
import type { OccupationSummary } from "./tenant";

// ─── Members ──────────────────────────────────────────────────────────────────

export interface TenantMember {
  id: string;
  memberId: number;
  userId: string;
  name: string;
  email: string;
  gender?: Gender | null;
  /** ISO date (YYYY-MM-DD) at UTC midnight. Null on accounts from before it was asked for. */
  dateOfBirth?: string | null;
  occupationId?: string | null;
  occupation?: OccupationSummary | null;
  phone?: string | null;
  avatarUrl?: string | null;
  /** Built-in (MEMBER/COACH/ADMIN) or a custom role key. */
  role: string;
  status: AccountStatus;
  joinedAt: string;
  /**
   * When this membership row last changed. On a suspended or deleted member it
   * stands in for the date they left — the same proxy the analytics screen
   * counts deactivations by — which is what lets the roster show exactly the
   * people behind a "deactivated this month" figure.
   */
  updatedAt?: string;
  isDue?: boolean;
  dueDate?: string | null;
  /** The number the attendance machines report for this member. */
  deviceUserPin?: number | null;
  /** What is printed on the card in their hand. */
  rfidCardNumber?: string | null;
  /** True while any payment against this member is still PENDING. */
  hasPendingPayment?: boolean;
  /** Sum of those pending rows, in rupees. */
  pendingPaymentAmount?: number;
  /** Badges awarded to this member. Ids alone — the roster filters on them. */
  badgeIds?: string[];
  shift?: Shift | null;
  referralCount?: number;
  referredBy?: MemberReferral | null;
}

export interface MemberReferral {
  id: string;
  memberId: number;
  userId: string;
  name: string;
  email: string;
  gender?: Gender | null;
  phone?: string | null;
  avatarUrl?: string | null;
  role: string;
  status: AccountStatus;
  joinedAt: string;
}

/**
 * A member whose birthday falls inside the window the desk is looking at.
 *
 * `inDays` is relative to that window rather than to the calendar, so a list
 * running across new year still reads in order.
 */
export interface MemberBirthday {
  id: string;
  memberId: number;
  userId: string;
  name: string;
  phone?: string | null;
  email: string;
  avatarUrl?: string | null;
  gender?: Gender | null;
  dateOfBirth: string;
  /** 0 is today, 1 tomorrow. */
  inDays: number;
  /** The age they reach on this birthday, when it can be worked out. */
  turning: number | null;
}

export interface MemberReferralLeader extends MemberReferral {
  referralCount: number;
  referrals: MemberReferral[];
}

export interface TenantProfile {
  id: string;
  /** Stable link to this member's card; contents render live. */
  idCardUrl?: string | null;
  memberId: number;
  userId: string;
  name: string;
  email: string;
  gender?: Gender | null;
  /** ISO date (YYYY-MM-DD) at UTC midnight. Null on accounts from before it was asked for. */
  dateOfBirth?: string | null;
  occupationId?: string | null;
  occupation?: OccupationSummary | null;
  phone?: string | null;
  avatarUrl?: string | null;
  userCreatedAt: string;
  role: string;
  status: AccountStatus;
  joinedAt: string;
  dueDate?: string | null;
  /** Badges this member holds. Ids alone — the names live on the badge list. */
  badgeIds?: string[];
  shift?: Shift | null;
  payments?: PaymentSummary[];
}

export interface AddMemberPayload {
  name: string;
  email: string;
  phone: string;
  gender?: Gender;
  /** Required on a new member: an ISO date, "1998-04-23". */
  dateOfBirth: string;
  occupationId?: string;
  /** Built-in (MEMBER/COACH/ADMIN) or a custom role key. */
  role?: string;
  avatarUrl?: string;
  subscriptionId?: string;
  chargeIds?: string[];
  /**
   * A joining offer. The code only — the server decides what it is worth, so
   * a browser can never name its own discount.
   */
  couponCode?: string;
  shiftId?: string;
  referredByMembershipId?: string;
  /**
   * That the person at the desk confirmed this member accepted the gym's
   * terms — usually on the paper version.
   *
   * Optional, unlike the public form: this endpoint also creates coaches and
   * admins, and is used by imports where there is nobody to ask. Omitted
   * simply records no consent rather than refusing the admission.
   */
  consentAccepted?: boolean;
}

export interface UpdateProfilePayload {
  name?: string;
  phone?: string | null;
  gender?: Gender | null;
  dateOfBirth?: string | null;
  occupationId?: string | null;
  avatarUrl?: string | null;
  currentPassword?: string;
  newPassword?: string;
}

export interface UpdateMemberPayload {
  name?: string;
  phone?: string | null;
  gender?: Gender | null;
  dateOfBirth?: string | null;
  occupationId?: string | null;
  avatarUrl?: string | null;
  newPassword?: string;
  shiftId?: string | null;
}

export interface MemberDetail {
  id: string;
  /** Stable link to this member's card; contents render live. */
  idCardUrl?: string | null;
  memberId: number;
  userId: string;
  name: string;
  email: string;
  gender?: Gender | null;
  /** ISO date (YYYY-MM-DD) at UTC midnight. Null on accounts from before it was asked for. */
  dateOfBirth?: string | null;
  occupationId?: string | null;
  occupation?: OccupationSummary | null;
  phone?: string | null;
  avatarUrl?: string | null;
  userCreatedAt: string;
  role: string;
  status: AccountStatus;
  joinedAt: string;
  dueDate?: string | null;
  /** The number the attendance machines report for this member. */
  deviceUserPin?: number | null;
  /** What is printed on the card in their hand. */
  rfidCardNumber?: string | null;
  shift?: Shift | null;
  referralCount: number;
  referredBy?: MemberReferral | null;
  referrals: MemberReferral[];
  payments: {
    id: string;
    amount: number;
    description?: string | null;
    status: PaymentStatus;
    paidAt?: string | null;
    validFrom?: string | null;
    validUntil?: string | null;
    createdAt: string;
    subscription?: { id: string; title: string } | null;
  }[];
  badges: {
    id: string;
    name: string;
    description?: string | null;
    color: string;
    icon?: string | null;
  }[];
  planAssignments: {
    id: string;
    assignedAt: string;
    plan: {
      id: string;
      title: string;
      description?: string | null;
    };
  }[];
  /** Diet plans assigned to this member, shaped like `planAssignments`. */
  dietPlanAssignments?: {
    id: string;
    assignedAt: string;
    plan: {
      id: string;
      title: string;
      description?: string | null;
    };
  }[];
}

/** What a member ID card prints. Re-read on every open, never stored. */
export interface MemberIdCard {
  member: {
    /**
     * The membership id, which is what the card's QR points at.
     *
     * Safe to carry on a public payload: it only names a row, and the screen
     * behind it is behind a login and `members:read:detail`.
     */
    id: string;
    name: string;
    memberId: number;
    avatarUrl?: string | null;
    gender?: Gender | null;
    role: string;
    status: AccountStatus;
    joinedAt: string;
    validUntil?: string | null;
    shift?: { name: string; startTime: string; endTime: string } | null;
  };
  gym: {
    name: string;
    slug: string;
    logoUrl?: string | null;
    address?: string | null;
    phone?: string | null;
    /** The gym's own colour, so a printed card matches its walls and its website. */
    brandColor?: string | null;
  };
  issuedAt: string;
}

export interface Shift {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  startTime: string;
  endTime: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateShiftPayload {
  name: string;
  description?: string;
  startTime: string;
  endTime: string;
  isActive?: boolean;
}

export interface UpdateShiftPayload {
  name?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  isActive?: boolean;
}
