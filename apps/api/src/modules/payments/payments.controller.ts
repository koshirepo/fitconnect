import type { Context } from "hono";
import { paymentService } from "./payments.service";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { parsePagination } from "../../lib/pagination";
import { ok, okPaginated, forbidden, notFound } from "../../lib/response";
import {
  createPaymentSchema,
  updatePaymentStatusSchema,
  updatePaymentSchema,
  createSubscriptionSchema,
} from "./payments.schema";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const paymentController = {
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

  async getMyPayments(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const result = await paymentService.getMyPayments(tenantId, c.get("authUser").id);
    if ("error" in result) return forbidden(c, result.error!);
    return ok(c, result.data);
  },

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

  async listSubscriptions(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const result = await paymentService.listSubscriptions(tenantId);
    c.header("Cache-Control", "private, max-age=300");
    return ok(c, result.data);
  },

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

  async getAnalytics(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const result = await paymentService.getAnalytics(tenantId);
    return ok(c, result.data);
  },
};
