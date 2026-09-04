/**
 * Documentation: Finance and salary routes.
 *
 * - Declares the Hono routes for the gym's books and for staff pay. Mounted from `/tenants` in the application entrypoint.
 * - `GET /:tenantId/salary/me` is deliberately the only salary route open to `SALARY_READ_SELF` alone. It takes no membership id, so there is nothing for a caller to substitute; the person it answers about comes from the token. The `/staff/:membershipId` routes accept either permission and the controller decides, because they *can* be pointed at somebody else.
 * - Relative endpoints: GET /:tenantId/finance/summary, GET|POST /:tenantId/finance/expenses, PATCH|DELETE /:tenantId/finance/expenses/:expenseId, GET|POST /:tenantId/finance/recurring, PATCH|DELETE /:tenantId/finance/recurring/:recurringId, POST /:tenantId/finance/recurring/:recurringId/post, GET /:tenantId/salary, GET /:tenantId/salary/me, GET /:tenantId/salary/staff/:membershipId, GET /:tenantId/salary/staff/:membershipId/history, PUT /:tenantId/salary/staff/:membershipId/compensation, POST /:tenantId/salary/cycles/:cycleId/components, DELETE /:tenantId/salary/components/:componentId, POST /:tenantId/salary/cycles/:cycleId/payments, DELETE /:tenantId/salary/payments/:paymentId.
 * - Primary exports: financeRoutes.
 */
import { Hono } from "hono";
import { authenticate } from "../../middleware/authenticate";
import {
  requireAnyTenantPermission,
  requireTenantPermissions,
} from "../../middleware/authorize";
import { Permission } from "@fitconnect/shared/types/permissions";
import type { AppBindings } from "../../types/app-context";
import { financeController, salaryController } from "./finance.controller";

export const financeRoutes = new Hono<AppBindings>();

// ─── The gym's books ─────────────────────────────────────────────────────────

financeRoutes.get(
  "/:tenantId/finance/summary",
  authenticate,
  requireTenantPermissions(Permission.FINANCE_READ),
  financeController.summary,
);

financeRoutes.get(
  "/:tenantId/finance/expenses",
  authenticate,
  requireTenantPermissions(Permission.FINANCE_READ),
  financeController.listExpenses,
);

financeRoutes.post(
  "/:tenantId/finance/expenses",
  authenticate,
  requireTenantPermissions(Permission.FINANCE_MANAGE),
  financeController.createExpense,
);

financeRoutes.patch(
  "/:tenantId/finance/expenses/:expenseId",
  authenticate,
  requireTenantPermissions(Permission.FINANCE_MANAGE),
  financeController.updateExpense,
);

financeRoutes.delete(
  "/:tenantId/finance/expenses/:expenseId",
  authenticate,
  requireTenantPermissions(Permission.FINANCE_MANAGE),
  financeController.deleteExpense,
);

financeRoutes.get(
  "/:tenantId/finance/recurring",
  authenticate,
  requireTenantPermissions(Permission.FINANCE_READ),
  financeController.listRecurring,
);

financeRoutes.post(
  "/:tenantId/finance/recurring",
  authenticate,
  requireTenantPermissions(Permission.FINANCE_MANAGE),
  financeController.createRecurring,
);

financeRoutes.patch(
  "/:tenantId/finance/recurring/:recurringId",
  authenticate,
  requireTenantPermissions(Permission.FINANCE_MANAGE),
  financeController.updateRecurring,
);

financeRoutes.delete(
  "/:tenantId/finance/recurring/:recurringId",
  authenticate,
  requireTenantPermissions(Permission.FINANCE_MANAGE),
  financeController.deleteRecurring,
);

financeRoutes.post(
  "/:tenantId/finance/recurring/:recurringId/post",
  authenticate,
  requireTenantPermissions(Permission.FINANCE_MANAGE),
  financeController.postRecurring,
);

// ─── Staff pay ───────────────────────────────────────────────────────────────

/**
 * A staff member's own payslips.
 *
 * No membership id in the path on purpose: this route cannot be aimed at
 * somebody else, so `SALARY_READ_SELF` is safe to open it with.
 */
financeRoutes.get(
  "/:tenantId/salary/me",
  authenticate,
  requireAnyTenantPermission(Permission.SALARY_READ_SELF, Permission.SALARY_READ),
  salaryController.mine,
);

financeRoutes.get(
  "/:tenantId/salary",
  authenticate,
  requireTenantPermissions(Permission.SALARY_READ),
  salaryController.list,
);

financeRoutes.get(
  "/:tenantId/salary/staff/:membershipId",
  authenticate,
  requireAnyTenantPermission(Permission.SALARY_READ, Permission.SALARY_READ_SELF),
  salaryController.getCycle,
);

financeRoutes.get(
  "/:tenantId/salary/staff/:membershipId/history",
  authenticate,
  requireAnyTenantPermission(Permission.SALARY_READ, Permission.SALARY_READ_SELF),
  salaryController.history,
);

financeRoutes.put(
  "/:tenantId/salary/staff/:membershipId/compensation",
  authenticate,
  requireTenantPermissions(Permission.SALARY_MANAGE),
  salaryController.setCompensation,
);

financeRoutes.post(
  "/:tenantId/salary/cycles/:cycleId/components",
  authenticate,
  requireTenantPermissions(Permission.SALARY_MANAGE),
  salaryController.addComponent,
);

financeRoutes.delete(
  "/:tenantId/salary/components/:componentId",
  authenticate,
  requireTenantPermissions(Permission.SALARY_MANAGE),
  salaryController.removeComponent,
);

financeRoutes.post(
  "/:tenantId/salary/cycles/:cycleId/payments",
  authenticate,
  requireTenantPermissions(Permission.SALARY_MANAGE),
  salaryController.recordPayment,
);

financeRoutes.delete(
  "/:tenantId/salary/payments/:paymentId",
  authenticate,
  requireTenantPermissions(Permission.SALARY_MANAGE),
  salaryController.deletePayment,
);
