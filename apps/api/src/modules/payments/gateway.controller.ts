/**
 * Documentation: Payment gateway controller.
 *
 * - Owns the HTTP boundary for Razorpay configuration, member checkout, and inbound webhooks.
 * - Configuration changes are audited, but never with the values: the audit trail records that a key changed and who changed it, not what it changed to.
 * - The webhook handler reads the raw request body rather than a parsed object, because the signature covers the exact bytes Razorpay sent.
 * - Primary exports: gatewayController.
 */
import type { Context } from "hono";
import { gatewayService } from "./gateway.service";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import {
  badRequest,
  conflict,
  error,
  forbidden,
  notFound,
  ok,
} from "../../lib/response";
import {
  checkoutSchema,
  updateGatewaySchema,
  verifyCheckoutSchema,
} from "./payments.schema";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

/** Map a service failure onto the matching response helper. */
function fail(c: AppContext, result: { error?: string; status?: number }) {
  const message = result.error ?? "Request failed.";
  switch (result.status) {
    case 400:
      return badRequest(c, message);
    case 403:
      return forbidden(c, message);
    case 404:
      return notFound(c, message);
    case 409:
      return conflict(c, message);
    default:
      // 502/503 from here mean Razorpay refused or could not be reached — an
      // upstream failure, not a bug in this request.
      return error(c, (result.status ?? 502) as 502, "GATEWAY_ERROR", message);
  }
}

export const gatewayController = {
  /**
   * Handle the `get gateway config` HTTP action.
   * Returns which account the gym collects into and whether secrets are on file — never the secrets themselves.
   */
  async getConfig(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const result = await gatewayService.getConfig(tenantId);
    return ok(c, result.data);
  },

  /**
   * Handle the `update gateway config` HTTP action.
   * Saves or clears the gym's own Razorpay credentials.
   */
  async updateConfig(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, updateGatewaySchema);
    if (!parsed.ok) return parsed.response;

    const result = await gatewayService.updateConfig(tenantId, parsed.data);
    if ("error" in result) return fail(c, result);

    await auditLog({
      action: "UPDATE",
      entity: "PaymentGateway",
      entityId: tenantId,
      actorId: c.get("authUser").id,
      tenantId,
      // Deliberately records only what changed, never the values.
      metadata: {
        provider: "RAZORPAY",
        keyIdChanged: parsed.data.keyId !== undefined,
        keySecretChanged: parsed.data.keySecret !== undefined,
        webhookSecretChanged: parsed.data.webhookSecret !== undefined,
        cleared: parsed.data.keyId === "",
        source: result.data.gateway.source,
      },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /**
   * Handle the `test gateway` HTTP action.
   * Asks Razorpay to create a throwaway order so an admin finds out about a bad key here rather than at a member's first payment.
   */
  async testConnection(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const result = await gatewayService.testConnection(tenantId);
    if ("error" in result) return fail(c, result);
    return ok(c, result.data);
  },

  /**
   * Handle the `create checkout` HTTP action.
   * Opens a Razorpay order for the signed-in member and returns what the browser needs to launch checkout.
   */
  async createCheckout(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, checkoutSchema);
    if (!parsed.ok) return parsed.response;

    const result = await gatewayService.createCheckout(
      tenantId,
      c.get("authUser").id,
      parsed.data,
    );
    if ("error" in result) return fail(c, result);

    return ok(c, result.data, 201);
  },

  /**
   * Handle the `verify checkout` HTTP action.
   * Settles a payment against the signature the checkout widget returned.
   */
  async verifyCheckout(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, verifyCheckoutSchema);
    if (!parsed.ok) return parsed.response;

    const result = await gatewayService.verifyCheckout(
      tenantId,
      c.get("authUser").id,
      parsed.data,
    );
    if ("error" in result) return fail(c, result);

    if (!result.data.alreadySettled) {
      await auditLog({
        action: "UPDATE",
        entity: "Payment",
        entityId: result.data.payment.id,
        actorId: c.get("authUser").id,
        tenantId,
        metadata: {
          via: "RAZORPAY_CHECKOUT",
          amount: result.data.payment.amount,
          gatewayPaymentId: parsed.data.paymentId,
        },
        ip: c.req.header("x-forwarded-for") ?? undefined,
      });
    }

    return ok(c, result.data);
  },

  /**
   * Handle the `razorpay webhook` HTTP action.
   *
   * Unauthenticated by necessity — Razorpay has no session — so the signature is
   * the only thing that makes this trustworthy. The body is read as raw text
   * because re-serializing parsed JSON would change the bytes the signature
   * covers and every delivery would fail to verify.
   */
  async webhook(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const rawBody = await c.req.text();
    const signature = c.req.header("x-razorpay-signature") ?? null;

    const result = await gatewayService.handleWebhook(
      tenantId,
      rawBody,
      signature,
    );
    if ("error" in result) return fail(c, result);

    return ok(c, result.data);
  },
};
