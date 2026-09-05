/**
 * Documentation: Payout routes.
 *
 * - Two route sets on one ledger. The gym-scoped ones are mounted under `/tenants` and gated by that gym's own permissions; the platform queue is mounted at the root and gated by platform staff permissions.
 * - Reading a balance needs `PAYOUTS_READ`; changing the bank account or asking for money needs `PAYOUTS_MANAGE`. A coach can be trusted with the till and still have no business naming the account a gym's money is sent to.
 * - Settling is deliberately narrower than seeing: support staff may read the queue, only `PLATFORM_PAYOUTS_MANAGE` may approve, refuse, or say money was sent.
 * - Relative endpoints: GET /:tenantId/payouts/balance, GET /:tenantId/payouts, GET|PUT /:tenantId/payouts/bank-account, POST /:tenantId/payouts, GET /admin/payouts, GET /admin/payouts/:payoutId/bank-account, POST /admin/payouts/:payoutId/{approve,reject,paid}.
 * - Primary exports: tenantPayoutRoutes, platformPayoutRoutes.
 */
import { Hono } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { authenticate } from "../../middleware/authenticate";
import { idempotency } from "../../middleware/idempotency";
import { requirePermissions } from "../../middleware/authorize";
import { requireTenantPermissions } from "../../middleware/authorize";
import { payoutsController } from "./payouts.controller";
import type { AppBindings } from "../../types/app-context";

/** Mounted under `/tenants`. */
export const tenantPayoutRoutes = new Hono<AppBindings>();

tenantPayoutRoutes.get(
  "/:tenantId/payouts/balance",
  authenticate,
  requireTenantPermissions(Permission.PAYOUTS_READ),
  payoutsController.getBalance,
);

tenantPayoutRoutes.get(
  "/:tenantId/payouts",
  authenticate,
  requireTenantPermissions(Permission.PAYOUTS_READ),
  payoutsController.listMine,
);

tenantPayoutRoutes.get(
  "/:tenantId/payouts/bank-account",
  authenticate,
  requireTenantPermissions(Permission.PAYOUTS_READ),
  payoutsController.getBankAccount,
);

tenantPayoutRoutes.put(
  "/:tenantId/payouts/bank-account",
  authenticate,
  requireTenantPermissions(Permission.PAYOUTS_MANAGE),
  payoutsController.saveBankAccount,
);

// Idempotent because a double-tap on a slow connection would otherwise ask for
// the same balance twice, and two requests for one sum is how a gym gets paid
// twice.
tenantPayoutRoutes.post(
  "/:tenantId/payouts",
  authenticate,
  idempotency,
  requireTenantPermissions(Permission.PAYOUTS_MANAGE),
  payoutsController.requestPayout,
);

/** Mounted at the root: the platform's own desk. */
export const platformPayoutRoutes = new Hono<AppBindings>();

platformPayoutRoutes.get(
  "/admin/payouts",
  authenticate,
  requirePermissions(Permission.PLATFORM_PAYOUTS_READ),
  payoutsController.listPending,
);

platformPayoutRoutes.get(
  "/admin/payouts/:payoutId/bank-account",
  authenticate,
  requirePermissions(Permission.PLATFORM_PAYOUTS_MANAGE),
  payoutsController.revealAccount,
);

platformPayoutRoutes.post(
  "/admin/payouts/:payoutId/approve",
  authenticate,
  requirePermissions(Permission.PLATFORM_PAYOUTS_MANAGE),
  payoutsController.approve,
);

platformPayoutRoutes.post(
  "/admin/payouts/:payoutId/reject",
  authenticate,
  requirePermissions(Permission.PLATFORM_PAYOUTS_MANAGE),
  payoutsController.reject,
);

platformPayoutRoutes.post(
  "/admin/payouts/:payoutId/paid",
  authenticate,
  idempotency,
  requirePermissions(Permission.PLATFORM_PAYOUTS_MANAGE),
  payoutsController.markPaid,
);
