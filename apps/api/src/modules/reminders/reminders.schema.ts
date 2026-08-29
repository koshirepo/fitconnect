/**
 * Documentation: Request shapes for the reminder log.
 *
 * - `logReminderSchema` is what the app posts when staff hand a message to WhatsApp. The channel is constrained rather than free text because the history's whole value is being able to say how a member was reached.
 * - The message body is stored as it was sent, capped at a length that comfortably holds a rendered template but cannot be used as free storage.
 * - Primary exports: logReminderSchema, LogReminderInput.
 */
import { z } from "zod";

export const logReminderSchema = z.object({
  /** Only channels a person drives by hand; the cron writes its own rows. */
  channel: z.enum(["WHATSAPP"]).default("WHATSAPP"),
  reason: z.enum(["RENEWAL_DUE", "EXPIRED", "PENDING_PAYMENT"]).default("PENDING_PAYMENT"),
  message: z.string().trim().max(2000).optional(),
  /** The pending payment this message was chasing, when it was chasing one. */
  targetPaymentId: z.string().trim().optional(),
});

export type LogReminderInput = z.infer<typeof logReminderSchema>;
