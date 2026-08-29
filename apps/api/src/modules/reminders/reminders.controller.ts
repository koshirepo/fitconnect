/**
 * Documentation: HTTP surface for the reminder log.
 *
 * - Two reads and one write: a member's chase history, what a given payment cost to collect, and the row staff create by opening a WhatsApp message.
 * - The actor on a manual row is the caller's own membership, resolved here rather than trusted from the body — the log is only worth keeping if it cannot be authored on someone else's behalf.
 * - Primary exports: reminderController.
 */
import type { Context } from "hono";
import { reminderService } from "./reminders.service";
import { reminderRepository } from "./reminders.repository";
import { logReminderSchema } from "./reminders.schema";
import { parseBody } from "../../lib/http";
import { ok, notFound } from "../../lib/response";
import { prisma } from "../../lib/prisma";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const reminderController = {
  /** Everything sent to one member, newest first. */
  async listForMember(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;

    const result = await reminderService.listForMember(tenantId, membershipId);
    if ("error" in result) return notFound(c, result.error!);

    return ok(c, result.data);
  },

  /** What it took to collect one payment. */
  async listForPayment(c: AppContext) {
    const paymentId = c.req.param("paymentId")!;
    const tenantId = c.req.param("tenantId")!;

    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, tenantId },
      select: { id: true },
    });
    if (!payment) return notFound(c, "Payment not found.");

    const reminders = await reminderRepository.listForPayment(paymentId);
    return ok(c, { reminders });
  },

  /**
   * Record a message a member of staff just sent by hand.
   *
   * Called as the app hands the message to WhatsApp. It records the intent to
   * send, which is the last thing observable from here.
   */
  async log(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;
    const parsed = await parseBody(c, logReminderSchema);
    if (!parsed.ok) return parsed.response;

    const actor = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId: c.get("authUser").id } },
      select: { id: true },
    });

    const result = await reminderService.recordManual({
      tenantId,
      membershipId,
      channel: parsed.data.channel,
      reason: parsed.data.reason,
      message: parsed.data.message ?? null,
      actorMembershipId: actor?.id ?? null,
      targetPaymentId: parsed.data.targetPaymentId ?? null,
    });

    if ("error" in result) return notFound(c, result.error!);
    return ok(c, result.data, 201);
  },
};
