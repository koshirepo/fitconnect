/**
 * Documentation: Finance and salary controller.
 *
 * - The HTTP boundary for the gym's books and for staff pay: parse, delegate, shape the envelope.
 * - The one rule that lives here rather than in the service is who a salary request is *about*. `SALARY_READ` sees anyone; a staff member holding only `SALARY_READ_SELF` is answered about themselves and refused for anybody else, and that has to be decided from the authenticated user rather than from a path parameter the caller controls.
 * - Primary exports: financeController, salaryController.
 */
import type { Context } from "hono";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { badRequest, forbidden, notFound, ok } from "../../lib/response";
import { hasPermission, Permission } from "@fitconnect/shared/types/permissions";
import type { AppBindings } from "../../types/app-context";
import {
  addSalaryComponentSchema,
  createExpenseSchema,
  createRecurringExpenseSchema,
  monthSchema,
  postRecurringExpenseSchema,
  recordSalaryPaymentSchema,
  setCompensationSchema,
  updateExpenseSchema,
  updateRecurringExpenseSchema,
} from "./finance.schema";
import { financeService } from "./finance.service";
import { salaryService } from "./salary.service";
import { salaryRepository } from "./salary.repository";

type AppContext = Context<AppBindings>;

/** The month being asked about, defaulting to the one we are in. */
function monthFrom(c: AppContext): { month?: string; error?: string } {
  const raw = c.req.query("month");
  if (!raw) {
    const now = new Date();
    return {
      month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
    };
  }

  const parsed = monthSchema.safeParse(raw);
  if (!parsed.success) return { error: "Month must look like 2026-09." };
  return { month: parsed.data };
}

/** The acting staff member's membership row, for "who recorded this". */
async function actorMembershipId(c: AppContext, tenantId: string) {
  const userId = c.get("authUser")?.id;
  if (!userId) return null;

  const membership = await salaryRepository.findMembershipByUser(tenantId, userId);
  return membership?.id ?? null;
}

type Failure = { error: string; status: 400 | 403 | 404 };

/**
 * A type predicate rather than `"error" in result`.
 *
 * The service results are unions whose success branch carries an optional
 * `error?: undefined`, so `in` does not narrow them — this does, and it narrows
 * the success branch on the other side of the check too.
 */
function isFailure(result: unknown): result is Failure {
  return (
    typeof result === "object" &&
    result !== null &&
    typeof (result as { error?: unknown }).error === "string"
  );
}

function fail(c: AppContext, result: Failure) {
  if (result.status === 404) return notFound(c, result.error);
  if (result.status === 403) return forbidden(c, result.error);
  return badRequest(c, result.error);
}

export const financeController = {
  async summary(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const { month, error } = monthFrom(c);
    if (error || !month) return badRequest(c, error ?? "Missing month.");

    return ok(c, await financeService.summary(tenantId, month));
  },

  async listExpenses(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const { month, error } = monthFrom(c);
    if (error || !month) return badRequest(c, error ?? "Missing month.");

    return ok(c, await financeService.listExpenses(tenantId, month));
  },

  async createExpense(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, createExpenseSchema);
    if (!parsed.ok) return parsed.response;

    const result = await financeService.createExpense(
      tenantId,
      parsed.data,
      await actorMembershipId(c, tenantId),
    );

    await auditLog({
      action: "CREATE",
      entity: "Expense",
      entityId: result.data.id,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { label: parsed.data.label, amount: parsed.data.amount },
    });

    return ok(c, result.data, 201);
  },

  async updateExpense(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const expenseId = c.req.param("expenseId")!;
    const parsed = await parseBody(c, updateExpenseSchema);
    if (!parsed.ok) return parsed.response;

    const result = await financeService.updateExpense(tenantId, expenseId, parsed.data);
    if (isFailure(result)) return fail(c, result);

    await auditLog({
      action: "UPDATE",
      entity: "Expense",
      entityId: expenseId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { ...parsed.data },
    });

    return ok(c, result.data);
  },

  async deleteExpense(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const expenseId = c.req.param("expenseId")!;

    const result = await financeService.deleteExpense(tenantId, expenseId);
    if (isFailure(result)) return fail(c, result);

    await auditLog({
      action: "DELETE",
      entity: "Expense",
      entityId: expenseId,
      actorId: c.get("authUser").id,
      tenantId,
    });

    return ok(c, result.data);
  },

  async listRecurring(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const { month, error } = monthFrom(c);
    if (error || !month) return badRequest(c, error ?? "Missing month.");

    return ok(c, await financeService.listRecurring(tenantId, month));
  },

  async createRecurring(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, createRecurringExpenseSchema);
    if (!parsed.ok) return parsed.response;

    const result = await financeService.createRecurring(tenantId, parsed.data);

    await auditLog({
      action: "CREATE",
      entity: "RecurringExpense",
      entityId: result.data.id,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { label: parsed.data.label, amount: parsed.data.amount },
    });

    return ok(c, result.data, 201);
  },

  async updateRecurring(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const recurringId = c.req.param("recurringId")!;
    const parsed = await parseBody(c, updateRecurringExpenseSchema);
    if (!parsed.ok) return parsed.response;

    const result = await financeService.updateRecurring(tenantId, recurringId, parsed.data);
    if (isFailure(result)) return fail(c, result);

    await auditLog({
      action: "UPDATE",
      entity: "RecurringExpense",
      entityId: recurringId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { ...parsed.data },
    });

    return ok(c, result.data);
  },

  async deleteRecurring(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const recurringId = c.req.param("recurringId")!;

    const result = await financeService.deleteRecurring(tenantId, recurringId);
    if (isFailure(result)) return fail(c, result);

    await auditLog({
      action: "DELETE",
      entity: "RecurringExpense",
      entityId: recurringId,
      actorId: c.get("authUser").id,
      tenantId,
    });

    return ok(c, result.data);
  },

  async postRecurring(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const recurringId = c.req.param("recurringId")!;
    const parsed = await parseBody(c, postRecurringExpenseSchema);
    if (!parsed.ok) return parsed.response;

    const result = await financeService.postRecurring(
      tenantId,
      recurringId,
      parsed.data,
      await actorMembershipId(c, tenantId),
    );
    if (isFailure(result)) return fail(c, result);

    await auditLog({
      action: "CREATE",
      entity: "Expense",
      entityId: result.data.id,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { postedFrom: recurringId, month: parsed.data.month },
    });

    return ok(c, result.data, 201);
  },
};

export const salaryController = {
  /** Everyone on payroll for a month. Gated on SALARY_READ; self-only cannot reach it. */
  async list(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const { month, error } = monthFrom(c);
    if (error || !month) return badRequest(c, error ?? "Missing month.");

    return ok(c, await salaryService.listForMonth(tenantId, month));
  },

  /**
   * One person's month.
   *
   * Anybody with `SALARY_READ` may ask about anybody. Somebody with only
   * `SALARY_READ_SELF` gets exactly one answer — their own — and the comparison
   * is against the membership resolved from their token, never against the id
   * in the URL, which the caller chooses.
   */
  async getCycle(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;
    const { month, error } = monthFrom(c);
    if (error || !month) return badRequest(c, error ?? "Missing month.");

    const canReadAll = hasPermission(c.get("permissions"), Permission.SALARY_READ);

    if (!canReadAll) {
      const own = await actorMembershipId(c, tenantId);
      if (!own || own !== membershipId) {
        return forbidden(c, "You can only view your own salary.");
      }
    }

    // Reading a payslip must not write rows; only an admin opening the month
    // does that.
    const result = await salaryService.getCycle(tenantId, membershipId, month, canReadAll);
    if (isFailure(result)) return fail(c, result);

    return ok(c, result.data);
  },

  /** The signed-in staff member's own pay history. */
  async mine(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const own = await actorMembershipId(c, tenantId);
    if (!own) return forbidden(c, "No membership on this gym.");

    const result = await salaryService.history(tenantId, own);
    if (isFailure(result)) return fail(c, result);

    return ok(c, result.data);
  },

  async history(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;

    if (!hasPermission(c.get("permissions"), Permission.SALARY_READ)) {
      const own = await actorMembershipId(c, tenantId);
      if (!own || own !== membershipId) {
        return forbidden(c, "You can only view your own salary.");
      }
    }

    const result = await salaryService.history(tenantId, membershipId);
    if (isFailure(result)) return fail(c, result);

    return ok(c, result.data);
  },

  async setCompensation(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;
    const parsed = await parseBody(c, setCompensationSchema);
    if (!parsed.ok) return parsed.response;

    const result = await salaryService.setCompensation(tenantId, membershipId, parsed.data);
    if (isFailure(result)) return fail(c, result);

    await auditLog({
      action: "UPDATE",
      entity: "StaffCompensation",
      entityId: membershipId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { monthlyAmount: parsed.data.monthlyAmount },
    });

    return ok(c, result.data);
  },

  async addComponent(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const cycleId = c.req.param("cycleId")!;
    const parsed = await parseBody(c, addSalaryComponentSchema);
    if (!parsed.ok) return parsed.response;

    const result = await salaryService.addComponent(tenantId, cycleId, parsed.data);
    if (isFailure(result)) return fail(c, result);

    await auditLog({
      action: "CREATE",
      entity: "SalaryComponent",
      entityId: cycleId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { kind: parsed.data.kind, label: parsed.data.label, amount: parsed.data.amount },
    });

    return ok(c, result.data, 201);
  },

  async removeComponent(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const componentId = c.req.param("componentId")!;

    const result = await salaryService.removeComponent(tenantId, componentId);
    if (isFailure(result)) return fail(c, result);

    await auditLog({
      action: "DELETE",
      entity: "SalaryComponent",
      entityId: componentId,
      actorId: c.get("authUser").id,
      tenantId,
    });

    return ok(c, result.data);
  },

  async recordPayment(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const cycleId = c.req.param("cycleId")!;
    const parsed = await parseBody(c, recordSalaryPaymentSchema);
    if (!parsed.ok) return parsed.response;

    const result = await salaryService.recordPayment(
      tenantId,
      cycleId,
      parsed.data,
      await actorMembershipId(c, tenantId),
    );
    if (isFailure(result)) return fail(c, result);

    await auditLog({
      action: "CREATE",
      entity: "SalaryPayment",
      entityId: cycleId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { amount: parsed.data.amount, method: parsed.data.method },
    });

    return ok(c, result.data, 201);
  },

  async deletePayment(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const paymentId = c.req.param("paymentId")!;

    const result = await salaryService.deletePayment(tenantId, paymentId);
    if (isFailure(result)) return fail(c, result);

    await auditLog({
      action: "DELETE",
      entity: "SalaryPayment",
      entityId: paymentId,
      actorId: c.get("authUser").id,
      tenantId,
    });

    return ok(c, result.data);
  },
};
