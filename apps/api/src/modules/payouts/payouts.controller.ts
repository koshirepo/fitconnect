/**
 * Documentation: HTTP boundary for gym payouts.
 *
 * - Two audiences with opposite jobs. A gym sees what it is owed and asks for it; platform staff see the queue and settle it. Both live here because they are two ends of one ledger, and splitting them would put the arithmetic in two places.
 * - Every write is audited. This is the only part of the app where somebody says money left a bank account, and the record of who said so is the point.
 * - Relative endpoints declared here: GET /:tenantId/payouts/balance, GET /:tenantId/payouts, GET /:tenantId/payouts/bank-account, PUT /:tenantId/payouts/bank-account, POST /:tenantId/payouts, and the platform-side queue under /admin/payouts.
 * - Primary exports: payoutsController.
 */
import type { Context } from "hono";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { failWith, ok } from "../../lib/response";
import { payoutsService } from "./payouts.service";
import {
  markPaidSchema,
  rejectPayoutSchema,
  saveBankAccountSchema,
} from "./payouts.schema";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const payoutsController = {
  // ─── The gym's side ────────────────────────────────────────────────────────

  async getBalance(c: AppContext) {
    const result = await payoutsService.balance(c.req.param("tenantId")!);
    if ("error" in result) return failWith(c, result);
    return ok(c, result.data);
  },

  async listMine(c: AppContext) {
    const result = await payoutsService.listForTenant(c.req.param("tenantId")!);
    return ok(c, result.data);
  },

  async getBankAccount(c: AppContext) {
    const result = await payoutsService.getBankAccount(c.req.param("tenantId")!);
    return ok(c, result.data);
  },

  async saveBankAccount(c: AppContext) {
    const parsed = await parseBody(c, saveBankAccountSchema);
    if (!parsed.ok) return parsed.response;

    const tenantId = c.req.param("tenantId")!;
    const result = await payoutsService.saveBankAccount(tenantId, parsed.data);

    await auditLog({
      action: "UPDATE",
      entity: "TenantBankAccount",
      entityId: tenantId,
      tenantId,
      actorId: c.get("authUser").id,
      // The number itself never reaches the audit log. Where the money goes is
      // the fact worth keeping; the account that receives it is not.
      metadata: { last4: result.data.account.accountLast4, ifsc: result.data.account.ifsc },
    });

    return ok(c, result.data);
  },

  async requestPayout(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const actorId = c.get("authUser").id;
    const result = await payoutsService.requestPayout(tenantId, actorId);
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "CREATE",
      entity: "TenantPayout",
      entityId: result.data.payout.id,
      tenantId,
      actorId,
      metadata: { netPaise: result.data.payout.netPaise },
    });

    return ok(c, result.data);
  },

  // ─── The platform's side ───────────────────────────────────────────────────

  async listPending(c: AppContext) {
    const result = await payoutsService.listPending();
    return ok(c, result.data);
  },

  /**
   * The account to transfer into.
   *
   * The only endpoint that unseals an account number, which is why it is a
   * separate call rather than a field on the queue: staff fetch it when they are
   * about to make a transfer, and it never sits in a list on a shared screen.
   */
  async revealAccount(c: AppContext) {
    const payoutId = c.req.param("payoutId")!;
    const result = await payoutsService.revealAccountForPayout(payoutId);
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "UPDATE",
      entity: "TenantBankAccount",
      entityId: payoutId,
      actorId: c.get("authUser").id,
      metadata: { reason: "preparing a transfer" },
    });

    return ok(c, result.data);
  },

  async approve(c: AppContext) {
    const payoutId = c.req.param("payoutId")!;
    const actorId = c.get("authUser").id;
    const result = await payoutsService.approve(payoutId, actorId);
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "UPDATE",
      entity: "TenantPayout",
      entityId: payoutId,
      tenantId: result.data.payout?.tenantId ?? undefined,
      actorId,
      metadata: { status: "APPROVED" },
    });

    return ok(c, result.data);
  },

  async reject(c: AppContext) {
    const parsed = await parseBody(c, rejectPayoutSchema);
    if (!parsed.ok) return parsed.response;

    const payoutId = c.req.param("payoutId")!;
    const actorId = c.get("authUser").id;
    const result = await payoutsService.reject(payoutId, parsed.data.note, actorId);
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "UPDATE",
      entity: "TenantPayout",
      entityId: payoutId,
      tenantId: result.data.payout?.tenantId ?? undefined,
      actorId,
      metadata: { status: "REJECTED", note: parsed.data.note },
    });

    return ok(c, result.data);
  },

  async markPaid(c: AppContext) {
    const parsed = await parseBody(c, markPaidSchema);
    if (!parsed.ok) return parsed.response;

    const payoutId = c.req.param("payoutId")!;
    const actorId = c.get("authUser").id;
    const result = await payoutsService.markPaid(payoutId, parsed.data.reference, actorId);
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "UPDATE",
      entity: "TenantPayout",
      entityId: payoutId,
      tenantId: result.data.payout?.tenantId ?? undefined,
      actorId,
      metadata: { status: "PAID", reference: parsed.data.reference },
    });

    return ok(c, result.data);
  },
};
