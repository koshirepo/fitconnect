/**
 * Documentation: Salary service.
 *
 * - The rules for staff pay: what a month is worth, what has been paid against it, and who may see it.
 * - Recording a payment writes an `Expense` row and the `SalaryPayment` that points at it. Payroll is the largest thing most gyms spend money on, and a books page that omitted it would be wrong in the direction that matters. Deleting a payment removes both.
 * - Additions and deductions are tracked apart rather than netted, because a payslip has to show them apart.
 * - Primary exports: salaryService, computePayable.
 */
import { salaryRepository } from "./salary.repository";
import { financeRepository } from "./finance.repository";
import { sendSalaryNotice } from "./salary.notify";
import type {
  AddSalaryComponentInput,
  RecordSalaryPaymentInput,
  SetCompensationInput,
} from "./finance.schema";

type ComponentRow = { kind: string; amount: number };
type PaymentRow = { amount: number };

/**
 * What a month comes to, and what is left on it.
 *
 * Additions and deductions stay separate so a payslip can read the way people
 * expect — "15,000 plus a 2,000 incentive, less 500" — rather than as a single
 * adjusted figure nobody can check.
 */
export function computePayable(
  baseAmount: number,
  components: ComponentRow[],
  payments: PaymentRow[],
) {
  let additions = 0;
  let deductions = 0;

  for (const component of components) {
    if (component.kind === "DEDUCTION") deductions += component.amount;
    else additions += component.amount;
  }

  // A month cannot be worth less than nothing, however the deductions were
  // entered.
  const payable = Math.max(0, baseAmount + additions - deductions);
  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);

  return {
    baseAmount,
    additions,
    deductions,
    payable,
    paid,
    outstanding: Math.max(0, payable - paid),
    status: paid <= 0 ? "PENDING" : paid >= payable ? "PAID" : "PARTIAL",
  };
}

type CycleRow = Awaited<ReturnType<typeof salaryRepository.findCycleById>>;

function shapeCycle(cycle: NonNullable<CycleRow>) {
  return {
    id: cycle.id,
    month: cycle.month,
    note: cycle.note,
    ...computePayable(cycle.baseAmount, cycle.components, cycle.payments),
    components: cycle.components,
    payments: cycle.payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      method: payment.method,
      paidAt: payment.paidAt,
      note: payment.note,
      recordedByName: payment.recordedBy?.user.name ?? null,
    })),
    member: {
      membershipId: cycle.member.id,
      memberId: cycle.member.memberId,
      role: cycle.member.role,
      name: cycle.member.user.name,
      avatarUrl: cycle.member.user.avatarUrl,
    },
  };
}

/** Keeps the stored status in step with what the rows now add up to. */
async function resyncStatus(tenantId: string, cycleId: string) {
  const fresh = await salaryRepository.findCycleById(tenantId, cycleId);
  if (!fresh) return null;

  const totals = computePayable(fresh.baseAmount, fresh.components, fresh.payments);
  if (totals.status !== fresh.status) {
    await salaryRepository.setCycleStatus(cycleId, totals.status);
  }

  return shapeCycle(fresh);
}

export const salaryService = {
  /** The admin list: everyone on payroll, with this month's position. */
  async listForMonth(tenantId: string, month: string) {
    const [staff, cycles] = await Promise.all([
      salaryRepository.listStaff(tenantId),
      salaryRepository.listCycles(tenantId, month),
    ]);

    const cycleFor = new Map(cycles.map((cycle) => [cycle.membershipId, cycle]));

    const rows = staff.map((person) => {
      const cycle = cycleFor.get(person.id);
      const monthlyAmount = person.compensation?.monthlyAmount ?? 0;

      return {
        membershipId: person.id,
        memberId: person.memberId,
        name: person.user.name,
        avatarUrl: person.user.avatarUrl,
        role: person.role,
        monthlyAmount,
        hasCompensation: Boolean(person.compensation?.isActive),
        cycleId: cycle?.id ?? null,
        // No cycle yet means nothing has been added or paid, so the month is
        // simply worth the agreed figure and none of it has gone out.
        ...(cycle
          ? computePayable(cycle.baseAmount, cycle.components, cycle.payments)
          : computePayable(monthlyAmount, [], [])),
      };
    });

    const totals = rows.reduce(
      (acc, row) => ({
        payable: acc.payable + row.payable,
        paid: acc.paid + row.paid,
        outstanding: acc.outstanding + row.outstanding,
      }),
      { payable: 0, paid: 0, outstanding: 0 },
    );

    return { month, staff: rows, totals };
  },

  /**
   * One person's month, creating the cycle if this is the first look at it.
   *
   * `openCycle` is false when a staff member reads their own payslip: looking at
   * a month should not write rows, and only an admin acting on it should.
   */
  async getCycle(tenantId: string, membershipId: string, month: string, openCycle: boolean) {
    const member = await salaryRepository.findMembership(tenantId, membershipId);
    if (!member) return { error: "Staff member not found.", status: 404 as const };

    let cycle = await salaryRepository.findCycle(tenantId, membershipId, month);

    /**
     * No agreed figure yet is a normal state, not a failure.
     *
     * This screen is where the figure gets set, so refusing to load it until one
     * exists left the only way in behind the error it was reporting. The month
     * simply stays unopened until there is something to open it with.
     */
    const baseAmount = member.compensation?.monthlyAmount ?? 0;
    if (!cycle && openCycle && baseAmount > 0) {
      cycle = await salaryRepository.createCycle(tenantId, membershipId, month, baseAmount);
    }

    return {
      data: {
        member: {
          membershipId: member.id,
          memberId: member.memberId,
          name: member.user.name,
          avatarUrl: member.user.avatarUrl,
          role: member.role,
        },
        compensation: member.compensation,
        month,
        cycle: cycle ? shapeCycle(cycle) : null,
      },
    };
  },

  /** A staff member's own history — every month they have been paid for. */
  async history(tenantId: string, membershipId: string) {
    const member = await salaryRepository.findMembership(tenantId, membershipId);
    if (!member) return { error: "Staff member not found.", status: 404 as const };

    const cycles = await salaryRepository.listCyclesForMember(tenantId, membershipId);

    return {
      data: {
        member: {
          membershipId: member.id,
          memberId: member.memberId,
          name: member.user.name,
          avatarUrl: member.user.avatarUrl,
          role: member.role,
        },
        compensation: member.compensation,
        cycles: cycles.map(shapeCycle),
      },
    };
  },

  async setCompensation(tenantId: string, membershipId: string, input: SetCompensationInput) {
    const member = await salaryRepository.findMembership(tenantId, membershipId);
    if (!member) return { error: "Staff member not found.", status: 404 as const };

    const compensation = await salaryRepository.upsertCompensation(tenantId, membershipId, input);

    const now = new Date();
    const notice = await sendSalaryNotice(
      tenantId,
      {
        userId: member.user.id,
        name: member.user.name,
        email: member.user.email,
        phone: member.user.phone,
      },
      {
        kind: "COMPENSATION",
        monthlyAmount: input.monthlyAmount,
        month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
      },
    );

    return { data: { ...compensation, whatsappText: notice.whatsappText, phone: notice.phone } };
  },

  async addComponent(tenantId: string, cycleId: string, input: AddSalaryComponentInput) {
    const cycle = await salaryRepository.findCycleById(tenantId, cycleId);
    if (!cycle) return { error: "Pay month not found.", status: 404 as const };

    await salaryRepository.addComponent(cycleId, input);

    // A bonus added to a settled month reopens it: there is more owed now than
    // has been handed over.
    const updated = await resyncStatus(tenantId, cycleId);

    const notice = await sendSalaryNotice(
      tenantId,
      {
        userId: cycle.member.user.id,
        name: cycle.member.user.name,
        email: cycle.member.user.email,
        phone: cycle.member.user.phone,
      },
      {
        kind: "COMPONENT",
        componentKind: input.kind,
        label: input.label,
        amount: input.amount,
        month: cycle.month,
        payable: updated?.payable ?? 0,
        outstanding: updated?.outstanding ?? 0,
      },
    );

    return { data: { ...updated, whatsappText: notice.whatsappText, phone: notice.phone } };
  },

  async removeComponent(tenantId: string, componentId: string) {
    const component = await salaryRepository.findComponent(componentId);
    if (!component || component.cycle.tenantId !== tenantId) {
      return { error: "Entry not found.", status: 404 as const };
    }

    await salaryRepository.deleteComponent(componentId);
    return { data: await resyncStatus(tenantId, component.cycle.id) };
  },

  /**
   * Hand over money against a month, in whole or in part.
   *
   * The expense row is written before the salary payment. If the second write
   * fails the books carry a cost with no payslip behind it, which is visible and
   * correctable; the other order would leave a payment nothing accounts for, and
   * silently understate what the gym spent.
   */
  async recordPayment(
    tenantId: string,
    cycleId: string,
    input: RecordSalaryPaymentInput,
    recordedById: string | null,
  ) {
    const cycle = await salaryRepository.findCycleById(tenantId, cycleId);
    if (!cycle) return { error: "Pay month not found.", status: 404 as const };

    const totals = computePayable(cycle.baseAmount, cycle.components, cycle.payments);
    if (input.amount > totals.outstanding) {
      return {
        error: `That is more than is outstanding — ${totals.outstanding} remains on this month.`,
        status: 400 as const,
      };
    }

    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();

    const expense = await financeRepository.createExpense(
      tenantId,
      {
        label: `Salary - ${cycle.member.user.name} - ${cycle.month}`,
        amount: input.amount,
        category: "SALARY",
        incurredOn: paidAt,
        note: input.note,
      },
      recordedById,
    );

    await salaryRepository.createPayment({
      tenantId,
      cycleId,
      amount: input.amount,
      method: input.method,
      paidAt,
      note: input.note ?? null,
      recordedById,
      expenseId: expense.id,
    });

    const updated = await resyncStatus(tenantId, cycleId);

    /**
     * Told after the money is recorded, never before.
     *
     * The notice cannot fail the payment — it swallows its own errors — but the
     * ordering still matters: a staff member must not be told about money that
     * a later failure would have rolled back.
     */
    const notice = await sendSalaryNotice(
      tenantId,
      {
        userId: cycle.member.user.id,
        name: cycle.member.user.name,
        email: cycle.member.user.email,
        phone: cycle.member.user.phone,
      },
      {
        kind: "PAYMENT",
        amount: input.amount,
        method: input.method,
        month: cycle.month,
        paid: updated?.paid ?? input.amount,
        payable: updated?.payable ?? totals.payable,
        outstanding: updated?.outstanding ?? 0,
        note: input.note,
      },
    );

    return { data: { ...updated, whatsappText: notice.whatsappText, phone: notice.phone } };
  },

  /** Undo a payment, taking its ledger row with it. */
  async deletePayment(tenantId: string, paymentId: string) {
    const payment = await salaryRepository.findPayment(tenantId, paymentId);
    if (!payment) return { error: "Payment not found.", status: 404 as const };

    await salaryRepository.deletePayment(paymentId);
    if (payment.expenseId) {
      await financeRepository.deleteExpense(payment.expenseId);
    }

    return { data: await resyncStatus(tenantId, payment.cycle.id) };
  },
};
