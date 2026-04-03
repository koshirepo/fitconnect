/**
 * Documentation: Payments controller.
 *
 * - Owns the HTTP boundary for subscription management, payment collection, and membership validity tracking, including request parsing, service invocation, response shaping, and request-scoped side effects such as audit logging.
 * - Controller code should stay thin: validate inputs, call the service layer, and convert outcomes into the shared response envelope.
 * - Primary exports: paymentController.
 */
import type { Context } from "hono";
import { paymentService } from "./payments.service";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { parsePagination } from "../../lib/pagination";
import { ok, okPaginated, forbidden, notFound, okMessage, conflict } from "../../lib/response";
import {
  createPaymentSchema,
  updatePaymentStatusSchema,
  updatePaymentSchema,
  createSubscriptionSchema,
  updateSubscriptionSchema,
} from "./payments.schema";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const paymentController = {
  /**
   * Handle the `list payments` HTTP action for the payments module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async listPayments(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const { page, limit } = parsePagination(c);
    const statusFilter = c.req.query("status");
    const search = c.req.query("search");
    const membershipId = c.req.query("membershipId");

    const { data, total } = await paymentService.listPayments(
      tenantId,
      page,
      limit,
      statusFilter,
      search,
      membershipId,
    );
    return okPaginated(c, data, { page, limit, total });
  },

  /**
   * Handle the `get my payments` HTTP action for the payments module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async getMyPayments(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const result = await paymentService.getMyPayments(tenantId, c.get("authUser").id);
    if ("error" in result) return forbidden(c, result.error!);
    return ok(c, result.data);
  },

  /**
   * Handle the `get payment by id` HTTP action for the payments module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async getPaymentById(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const paymentId = c.req.param("paymentId")!;
    const authUser = c.get("authUser");
    const tenantAccess = c.get("tenantAccess");

    const result = await paymentService.getPaymentById(
      tenantId,
      paymentId,
      authUser.id,
      tenantAccess?.role ?? null,
    );

    if ("error" in result) {
      if (result.status === 403) return forbidden(c, result.error!);
      return notFound(c, result.error!);
    }

    return ok(c, result.data);
  },

  /**
   * Handle the `create payment` HTTP action for the payments module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async createPayment(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, createPaymentSchema);
    if (!parsed.ok) return parsed.response;

    const result = await paymentService.createPayment(tenantId, c.get("authUser").id, parsed.data);

    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "CREATE",
      entity: "Payment",
      entityId: result.data.payment.id,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: {
        amount: parsed.data.amount,
        membershipId: parsed.data.membershipId,
        description: parsed.data.description,
      },

      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  /**
   * Handle the `update payment` HTTP action for the payments module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async updatePayment(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const paymentId = c.req.param("paymentId")!;
    const parsed = await parseBody(c, updatePaymentSchema);
    if (!parsed.ok) return parsed.response;

    const result = await paymentService.updatePayment(tenantId, paymentId, parsed.data);
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "UPDATE",
      entity: "Payment",
      entityId: paymentId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { changes: result.changes },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /**
   * Handle the `update payment status` HTTP action for the payments module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async updatePaymentStatus(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const paymentId = c.req.param("paymentId")!;
    const parsed = await parseBody(c, updatePaymentStatusSchema);
    if (!parsed.ok) return parsed.response;

    const result = await paymentService.updatePaymentStatus(
      tenantId,
      paymentId,
      parsed.data.status,
    );

    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "UPDATE",
      entity: "Payment",
      entityId: paymentId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { from: result.previousStatus, to: parsed.data.status },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /**
   * Handle the `delete payment` HTTP action for the payments module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async deletePayment(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const paymentId = c.req.param("paymentId")!;

    const result = await paymentService.deletePayment(tenantId, paymentId);
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "DELETE",
      entity: "Payment",
      entityId: paymentId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: result.deletedPayment,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return okMessage(c, "Payment deleted.");
  },

  /**
   * Handle the `list subscriptions` HTTP action for the payments module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async listSubscriptions(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const includeInactive =
      c.get("tenantAccess")?.role === "ADMIN" && c.req.query("includeInactive") === "true";
    const result = await paymentService.listSubscriptions(tenantId, includeInactive);
    c.header("Cache-Control", "no-store");
    return ok(c, result.data);
  },

  /**
   * Handle the `create subscription` HTTP action for the payments module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async createSubscription(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, createSubscriptionSchema);
    if (!parsed.ok) return parsed.response;

    const result = await paymentService.createSubscription(tenantId, parsed.data);

    await auditLog({
      action: "CREATE",
      entity: "Subscription",
      entityId: result.data.subscription.id,
      actorId: c.get("authUser").id,
      tenantId,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  /**
   * Handle the `update subscription` HTTP action for the payments module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async updateSubscription(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const subscriptionId = c.req.param("subscriptionId")!;
    const parsed = await parseBody(c, updateSubscriptionSchema);
    if (!parsed.ok) return parsed.response;

    const result = await paymentService.updateSubscription(tenantId, subscriptionId, parsed.data);
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "UPDATE",
      entity: "Subscription",
      entityId: subscriptionId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: parsed.data,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /**
   * Handle the `delete subscription` HTTP action for the payments module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async deleteSubscription(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const subscriptionId = c.req.param("subscriptionId")!;

    const result = await paymentService.deleteSubscription(tenantId, subscriptionId);
    if ("error" in result) {
      if (result.status === 409) return conflict(c, result.error!);
      return notFound(c, result.error!);
    }

    await auditLog({
      action: "DELETE",
      entity: "Subscription",
      entityId: subscriptionId,
      actorId: c.get("authUser").id,
      tenantId,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return okMessage(c, "Subscription deleted.");
  },

  /**
   * Handle the `get analytics` HTTP action for the payments module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async getAnalytics(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const result = await paymentService.getAnalytics(tenantId);
    return ok(c, result.data);
  },
};
