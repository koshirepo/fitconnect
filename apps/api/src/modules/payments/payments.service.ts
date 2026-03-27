import type { PaymentStatus, TenantRole } from "../../shared/types/enums";
import { memberRepository } from "../members/members.repository";
import { paymentRepository } from "./payments.repository";
import { flattenNestedMember } from "../../lib/flatten";
import type {
  CreatePaymentInput,
  UpdatePaymentInput,
  CreateSubscriptionInput,
} from "./payments.schema";

export const paymentService = {
  async listPayments(
    tenantId: string,
    page: number,
    limit: number,
    statusFilter?: string,
    search?: string,
    membershipId?: string,
  ) {
    const { payments, total } = await paymentRepository.listPayments(
      tenantId,
      page,
      limit,
      statusFilter,
      search,
      membershipId,
    );
    const flat = payments.map((p: {
      id: string;
      amount: number;
      status: string;
      paidAt?: Date | null;
      validFrom?: Date | null;
      validUntil?: Date | null;
      description?: string | null;
      note?: string | null;
      createdAt: Date;
      member?: unknown;
      collectedBy?: unknown;
    }) => ({
      ...p,
      member: p.member ? flattenNestedMember(p.member as any) : undefined,
      collectedBy: p.collectedBy ? flattenNestedMember(p.collectedBy as any) : undefined,
    }));
    return { data: { payments: flat }, total };
  },

  async getMyPayments(tenantId: string, userId: string) {
    const membership = await paymentRepository.findMembershipByUser(tenantId, userId);
    if (!membership) {
      return { error: "Not a member of this tenant.", status: 403 as const };
    }

    const payments = await paymentRepository.listMyPayments(membership.id);
    return { data: { payments } };
  },

  async getPaymentById(
    tenantId: string,
    paymentId: string,
    userId: string,
    callerRole: TenantRole | null,
  ) {
    const payment = await paymentRepository.findPaymentDetail(paymentId, tenantId);
    if (!payment) {
      return { error: "Payment not found.", status: 404 as const };
    }

    if (callerRole === "MEMBER") {
      const membership = await paymentRepository.findMembershipByUser(tenantId, userId);
      if (!membership || membership.id !== payment.membershipId) {
        return { error: "You can only view your own payments.", status: 403 as const };
      }
    }

    return {
      data: {
        payment: {
          id: payment.id,
          amount: payment.amount,
          description: payment.description,
          note: payment.note,
          status: payment.status,
          paidAt: payment.paidAt,
          validFrom: payment.validFrom,
          validUntil: payment.validUntil,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
          member: payment.member ? flattenNestedMember(payment.member as any) : undefined,
          collectedBy: payment.collectedBy ? flattenNestedMember(payment.collectedBy as any) : undefined,
          subscription: payment.subscription,
        },
      },
    };
  },

  async createPayment(tenantId: string, userId: string, input: CreatePaymentInput) {
    // Run independent validation lookups in parallel
    const [targetMembership, subscription, collector] = await Promise.all([
      paymentRepository.findMembershipById(input.membershipId, tenantId),
      input.subscriptionId
        ? paymentRepository.findSubscription(input.subscriptionId, tenantId)
        : null,
      paymentRepository.findMembershipByUser(tenantId, userId),
    ]);

    if (!targetMembership) {
      return { error: "Target member not found in this tenant.", status: 404 as const };
    }

    if (input.subscriptionId && !subscription) {
      return { error: "Subscription not found in this tenant.", status: 404 as const };
    }

    const payment = await paymentRepository.createPayment({
      tenantId,
      membershipId: input.membershipId,
      subscriptionId: input.subscriptionId,
      chargeId: input.chargeId,
      description: input.description,
      note: input.note,
      status: input.status,
      amount: input.amount,
      collectorId: collector?.id,
      paidAt: input.status === "COMPLETED" ? new Date() : undefined,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
    });

    // Keep membership.dueDate in sync
    if (input.validUntil) {
      await paymentRepository.refreshDueDate(input.membershipId);
    }

    // Reactivate inactive member when due date is today or future
    if (targetMembership.status !== "ACTIVE") {
      const updatedMembership = await memberRepository.findMembershipById(
        input.membershipId,
        tenantId,
      );

      if (updatedMembership?.dueDate) {
        const now = new Date();
        const dueUtc = new Date(
          Date.UTC(
            updatedMembership.dueDate.getUTCFullYear(),
            updatedMembership.dueDate.getUTCMonth(),
            updatedMembership.dueDate.getUTCDate(),
          ),
        );
        const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

        if (dueUtc >= todayUtc) {
          await memberRepository.updateMembershipStatus(input.membershipId, "ACTIVE");
        }
      }
    }

    return {
      data: {
        payment: {
          ...payment,
          member: payment.member ? flattenNestedMember(payment.member as any) : undefined,
        },
      },
    };
  },

  async updatePayment(tenantId: string, paymentId: string, input: UpdatePaymentInput) {
    const existing = await paymentRepository.findPayment(paymentId, tenantId);
    if (!existing) {
      return { error: "Payment not found.", status: 404 as const };
    }

    // Build changes diff (only fields that actually changed)
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const fields = ["amount", "description", "note", "validFrom", "validUntil"] as const;
    for (const key of fields) {
      if (!(key in input)) continue;
      const oldVal = existing[key];
      const newVal = input[key];
      const oldStr = oldVal instanceof Date ? oldVal.toISOString() : (oldVal ?? null);
      const newStr = newVal instanceof Date ? newVal.toISOString() : (newVal ?? null);
      if (String(oldStr) !== String(newStr)) {
        changes[key] = { from: oldStr, to: newStr };
      }
    }

    const payment = await paymentRepository.updatePayment(paymentId, input);

    // Keep membership.dueDate in sync if validity dates changed
    if (existing.membershipId && ("validUntil" in input || "validFrom" in input)) {
      await paymentRepository.refreshDueDate(existing.membershipId);
    }

    return { data: { payment }, changes };
  },

  async updatePaymentStatus(tenantId: string, paymentId: string, status: PaymentStatus) {
    const existing = await paymentRepository.findPayment(paymentId, tenantId);
    if (!existing) {
      return { error: "Payment not found.", status: 404 as const };
    }

    const payment = await paymentRepository.updatePaymentStatus(paymentId, status);

    // Keep membership.dueDate in sync
    if (existing.membershipId) {
      await paymentRepository.refreshDueDate(existing.membershipId);
    }

    return { data: { payment }, previousStatus: existing.status };
  },

  async listSubscriptions(tenantId: string) {
    const subscriptions = await paymentRepository.listSubscriptions(tenantId);
    return { data: { subscriptions } };
  },

  async createSubscription(tenantId: string, input: CreateSubscriptionInput) {
    const subscription = await paymentRepository.createSubscription(tenantId, input);
    return { data: { subscription } };
  },

  async getAnalytics(tenantId: string) {
    const analytics = await paymentRepository.getPaymentAnalytics(tenantId);
    return { data: { analytics } };
  },
};
