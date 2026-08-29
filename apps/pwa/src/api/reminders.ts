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

export const remindersApi = {
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
