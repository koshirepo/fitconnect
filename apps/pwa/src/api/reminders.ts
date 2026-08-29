/**
 * Documentation: The reminder log, from the browser.
 *
 * - Reads a member's chase history and what a payment cost to collect, and records the WhatsApp messages staff send by hand — the only part of the chase the server cannot see for itself.
 * - Logging is fire-and-forget at the call sites: a failed log must never stop a member of staff from sending the message they were about to send.
 * - Primary exports: remindersApi, and the reminder types the screens render.
 */
import { api } from "./client";
import type { ApiResponse } from "@/types/api";

export type ReminderChannel = "PUSH" | "WHATSAPP";
export type ReminderReason = "RENEWAL_DUE" | "EXPIRED" | "PENDING_PAYMENT" | "SUSPENDED";

export type PaymentReminder = {
  id: string;
  channel: ReminderChannel;
  reason: ReminderReason;
  message?: string | null;
  sentAt: string;
  paymentId?: string | null;
  actor?: { id: string; user: { name: string } } | null;
};

export type LogReminderPayload = {
  channel?: "WHATSAPP";
  reason?: Exclude<ReminderReason, "SUSPENDED">;
  message?: string;
  targetPaymentId?: string;
};

/** One day of the gym-wide calendar. */
export type ReminderDay = {
  count: number;
  push: number;
  whatsapp: number;
  reminders: {
    id: string;
    membershipId: string;
    memberId: number | null;
    memberName: string;
    channel: ReminderChannel;
    reason: ReminderReason;
    message: string | null;
    sentAt: string;
    settled: boolean;
    actorName: string | null;
  }[];
};

export type ReminderCalendar = {
  month: string;
  total: number;
  days: Record<string, ReminderDay>;
};

/** One reminder in full, as the detail page shows it. */
export type ReminderDetail = PaymentReminder & {
  membershipId: string;
  targetPaymentId?: string | null;
  member?: {
    id: string;
    memberId: number | null;
    status: string;
    dueDate?: string | null;
    user: { name: string; phone?: string | null; avatarUrl?: string | null };
  } | null;
  payment?: {
    id: string;
    amount: number;
    description?: string | null;
    status: string;
    paidAt?: string | null;
  } | null;
};

export const remindersApi = {
  getById: (tenantId: string, reminderId: string) =>
    api.get<ApiResponse<{ reminder: ReminderDetail }>>(
      `/tenants/${tenantId}/reminders/${reminderId}`,
    ),

  calendar: (tenantId: string, month: string) =>
    api.get<ApiResponse<ReminderCalendar>>(`/tenants/${tenantId}/reminders/calendar`, {
      params: { month },
    }),

  listForMember: (tenantId: string, membershipId: string) =>
    api.get<ApiResponse<{ reminders: PaymentReminder[]; outstanding: number }>>(
      `/tenants/${tenantId}/members/${membershipId}/reminders`,
    ),

  listForPayment: (tenantId: string, paymentId: string) =>
    api.get<ApiResponse<{ reminders: PaymentReminder[] }>>(
      `/tenants/${tenantId}/payments/${paymentId}/reminders`,
    ),

  log: (tenantId: string, membershipId: string, payload: LogReminderPayload) =>
    api.post<ApiResponse<{ reminder: { id: string; sentAt: string } }>>(
      `/tenants/${tenantId}/members/${membershipId}/reminders`,
      payload,
    ),
};
