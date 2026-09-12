/**
 * Documentation: Plans, the money against them, and the gateway that collects it.
 *
 * - One slice of the shared contract surface. `types/models.ts` re-exports every slice, so nothing that imports from there had to change when this was split out of it.
 * - Treat these as the shape the API promises, not as a mirror of Prisma's own models.
 */

import type { AccountStatus, PaymentStatus, PaymentSource } from "../enums";
import type { Gender } from "./auth";
import type { Badge } from "./operations";

// ─── Subscriptions ────────────────────────────────────────────────────────────

export interface Subscription {
  id: string;
  title: string;
  description?: string | null;
  amount: number;
  durationDays: number;
  /** Days a term on this plan may be frozen for. 0 means it cannot be frozen. */
  freezeDays?: number;
  /** How many separate freezes that budget may be split across. */
  freezeCount?: number;
  isActive: boolean;
  badges: Pick<Badge, "id" | "name" | "color" | "icon" | "isActive">[];
}

export interface CreateSubscriptionPayload {
  title: string;
  description?: string;
  amount: number;
  durationDays?: number;
  freezeDays?: number;
  freezeCount?: number;
  badgeIds?: string[];
}

export interface UpdateSubscriptionPayload {
  title?: string;
  description?: string | null;
  amount?: number;
  durationDays?: number;
  freezeDays?: number;
  freezeCount?: number;
  isActive?: boolean;
  badgeIds?: string[];
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export interface Payment {
  id: string;
  amount: number;
  status: PaymentStatus;
  /**
   * Which of the gym's two businesses this money was for.
   *
   * Optional because an API deployed before the column existed does not send
   * it; a row without one is read as an ordinary membership payment, which is
   * what every such row was before the shop had its own ledger view.
   */
  source?: PaymentSource;
  paidAt?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  description?: string | null;
  note?: string | null;
  createdAt: string;
  updatedAt?: string;
  member?: {
    id: string;
    memberId: number;
    userId: string;
    name: string;
    email: string;
    gender?: Gender | null;
    phone?: string | null;
    avatarUrl?: string | null;
    status?: AccountStatus;
    dueDate?: string | null;
  };
  collectedBy?: {
    id: string;
    userId: string;
    name: string;
    email: string;
    gender?: Gender | null;
    phone?: string | null;
    avatarUrl?: string | null;
  };
  subscription?: {
    id: string;
    title: string;
    amount?: number;
    durationDays?: number;
  };
  /** "RAZORPAY" for online payments; absent for cash and other manual entries. */
  gateway?: string | null;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
}

// ─── Payment gateway ──────────────────────────────────────────────────────────

/**
 * What the settings screen knows about a gym's gateway setup.
 *
 * Deliberately contains no secret. `keyId` is public — the checkout widget needs
 * it in the browser — and the two `has*` flags say only whether a secret is on
 * file, never what it is.
 */
/**
 * Which mailbox a gym's transactional email leaves from.
 *
 * The same arrangement as the payment gateway below: a gym that saves its own
 * SMTP credentials sends from its own address, and one that has not falls back
 * to the platform's. The password is never part of this — `passwordSet` says
 * whether one is on file, and that is all a screen is told.
 */
export interface TenantEmailConfig {
  /** Whether this gym can send at all, from either mailbox. */
  enabled: boolean;
  /** TENANT when the gym sends from its own, PLATFORM when it falls back. */
  source: "TENANT" | "PLATFORM" | null;
  /** The address members would actually see. */
  sendingFrom: string | null;
  host: string | null;
  port: number | null;
  /** Implicit TLS (port 465). Null when the gym has saved nothing. */
  secure: boolean | null;
  user: string | null;
  /** The gym's own From header, if it set one. */
  from: string | null;
  passwordSet: boolean;
  /** False when the API has no CREDENTIALS_KEY and so cannot seal a password. */
  canStoreSecrets: boolean;
}

export interface UpdateTenantEmailPayload {
  /** Empty string clears the gym's mailbox back to the platform's. */
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  /** Only ever sent, never returned. Omit to leave the saved one alone. */
  password?: string;
  from?: string;
}

export interface PaymentGatewayConfig {
  provider: "RAZORPAY";
  /** Whether an online payment can be taken right now, from either account. */
  enabled: boolean;
  /** TENANT when the gym collects into its own account, PLATFORM when it falls back. */
  source: "TENANT" | "PLATFORM" | null;
  /** The gym's own key id, if saved. */
  keyId: string | null;
  hasKeySecret: boolean;
  hasWebhookSecret: boolean;
  /** The key id money falls back to when the gym has not set up its own. */
  platformKeyId: string | null;
  platformConfigured: boolean;
  /** False when the API has no CREDENTIALS_KEY and so cannot store gym secrets. */
  canStoreOwnKeys: boolean;
  /** LIVE moves real money; TEST does not. Null when nothing is configured. */
  mode: "LIVE" | "TEST" | null;
}

export interface UpdateGatewayPayload {
  /** An empty string clears the gym's keys and returns it to the platform account. */
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
}

/** Everything the browser needs to open Razorpay checkout for one payment. */
export interface CheckoutSession {
  paymentId: string;
  orderId: string;
  keyId: string;
  /** What the member pays: the plan plus any dues settled with it. */
  amount: number;
  currency: string;
  planTitle: string;
  /** The plan's own price, when the order also covers arrears. */
  planAmount?: number;
  outstandingAmount?: number;
  outstanding?: { id: string; amount: number; description?: string | null }[];
}

export interface VerifyCheckoutPayload {
  orderId: string;
  paymentId: string;
  signature: string;
}
