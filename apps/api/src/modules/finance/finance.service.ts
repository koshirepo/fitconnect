/**
 * Documentation: Finance service.
 *
 * - The gym's books for a month: what came in, what went out, and what is left. Plus CRUD over one-off expenses and the recurring templates they are posted from.
 * - Salary is not added on top of expenses in the summary. Every salary payment already wrote an expense row, so adding them again would double what the gym appears to spend. The payroll figure here is a breakdown of the expense total, not an addition to it.
 * - Recurring costs are templates. Nothing writes an expense on its own — a month becomes real when somebody posts it — so the summary can honestly show what is still unposted rather than pretending it was paid.
 * - Income is split by what paid for it — memberships, one-off charges, the store (members and walk-ins together), and anything else — and the store also reports its profit. Profit is read from the order lines, which froze the selling and purchase price at the moment of sale, so repricing a product later never moves a past month.
 * - Primary exports: financeService.
 */
import { financeRepository, monthRange } from "./finance.repository";
import { salaryRepository } from "./salary.repository";
import type {
  CreateExpenseInput,
  CreateRecurringExpenseInput,
  PostRecurringExpenseInput,
  UpdateExpenseInput,
  UpdateRecurringExpenseInput,
} from "./finance.schema";

/** The day a recurring cost falls due, clamped to months that are shorter. */
function dueDateFor(month: string, dayOfMonth: number) {
  const { from } = monthRange(month);
  const daysInMonth = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), Math.min(dayOfMonth, daysInMonth)),
  );
}

type StoreSale = Awaited<ReturnType<typeof financeRepository.storeSales>>[number];

/**
 * What the store made in a month, as opposed to what it took.
 *
 * Revenue is what buyers actually paid, so coupons and coins are already off
 * it; cost is what those same units cost the gym, as recorded on each line when
 * it sold. Repricing a product afterwards therefore moves none of this.
 *
 * A line sold before its purchase price was recorded has no cost to subtract.
 * It is counted in `uncostedSales` and left out of `profit` altogether rather
 * than treated as free, which would make every sale from before costs were
 * entered read as pure profit. Leaving it out can understate profit, never
 * overstate it.
 *
 * Per-product figures are line totals, before coupons and coins, which belong
 * to a basket rather than to any one thing in it.
 */
function summariseStore(orders: StoreSale[]) {
  let grossSales = 0;
  let discounts = 0;
  let netSales = 0;
  let cost = 0;
  let units = 0;
  let uncostedSales = 0;
  let uncostedUnits = 0;
  // What buyers actually paid for the lines that had a cost to set against it.
  // A basket's coupon and coins are shared across its lines by value, so one
  // that mixed costed and uncosted lines takes its discount off each in
  // proportion — never entirely off one, which could push profit below zero on
  // a month where nothing had a known cost at all.
  let costedSales = 0;

  const byVariant = new Map<
    string,
    {
      variantId: string;
      productName: string;
      variantName: string;
      units: number;
      sales: number;
      cost: number;
      uncostedUnits: number;
    }
  >();

  for (const order of orders) {
    grossSales += order.subtotalAmount;
    discounts += order.discountAmount + order.coinsRedeemed;
    netSales += order.totalAmount;

    // How much of each rupee of list price this basket actually collected.
    const paidShare = order.subtotalAmount > 0 ? order.totalAmount / order.subtotalAmount : 0;

    for (const item of order.items) {
      const row = byVariant.get(item.variantId) ?? {
        variantId: item.variantId,
        productName: item.productName,
        variantName: item.variantName,
        units: 0,
        sales: 0,
        cost: 0,
        uncostedUnits: 0,
      };
      byVariant.set(item.variantId, row);

      units += item.quantity;
      row.units += item.quantity;
      row.sales += item.lineTotal;

      if (item.lineCost === null) {
        uncostedSales += item.lineTotal;
        uncostedUnits += item.quantity;
        row.uncostedUnits += item.quantity;
      } else {
        cost += item.lineCost;
        row.cost += item.lineCost;
        costedSales += item.lineTotal * paidShare;
      }
    }
  }

  // Whole rupees, like every other amount here; the share above is fractional.
  const profit = Math.round(costedSales - cost);

  return {
    orders: orders.length,
    units,
    grossSales,
    discounts,
    netSales,
    cost,
    profit,
    marginPercent: costedSales > 0 ? Math.round((profit / costedSales) * 1000) / 10 : null,
    uncostedSales,
    uncostedUnits,
    products: [...byVariant.values()]
      .map((row) => ({
        ...row,
        // Half a margin is not a margin: a figure only when every unit had a cost.
        profit: row.uncostedUnits === 0 ? row.sales - row.cost : null,
      }))
      .sort((a, b) => b.sales - a.sales),
  };
}

export const financeService = {
  /**
   * One month of the books.
   *
   * `unpostedRecurring` is the honest half of the "template, not schedule"
   * choice: the rent is not in the expense total until somebody says it was
   * paid, so the summary names what is still outstanding instead of quietly
   * including or quietly omitting it.
   */
  async summary(tenantId: string, month: string) {
    const [income, byCategory, expenses, recurring, posted, salaryPaid, storeSales] =
      await Promise.all([
        financeRepository.incomeTotals(tenantId, month),
        financeRepository.expenseTotals(tenantId, month),
        financeRepository.listExpenses(tenantId, month),
        financeRepository.listRecurring(tenantId),
        financeRepository.postedRecurringIds(tenantId, month),
        salaryRepository.paidTotalForMonth(tenantId, month),
        financeRepository.storeSales(tenantId, month),
      ]);

    const incomeTotal = income.payments + income.guestStoreSales;
    const expenseTotal = byCategory.reduce((sum, row) => sum + row.amount, 0);

    const postedIds = new Set(posted.map((row) => row.recurringExpenseId));
    const unposted = recurring
      .filter((template) => template.isActive && !postedIds.has(template.id))
      .map((template) => ({
        id: template.id,
        label: template.label,
        amount: template.amount,
        category: template.category,
        dueOn: dueDateFor(month, template.dayOfMonth),
      }));

    return {
      month,
      income: {
        total: incomeTotal,
        memberPayments: income.payments,
        memberPaymentCount: income.paymentCount,
        guestStoreSales: income.guestStoreSales,
        guestStoreCount: income.guestStoreCount,
        bySource: income.bySource,
      },
      // What the store made, beside what it took. Not subtracted from `net`: a
      // gym that logs its supplier bills as expenses has already paid for this
      // stock there, and taking it off again would count it twice.
      store: summariseStore(storeSales),
      expenses: {
        total: expenseTotal,
        byCategory: byCategory.sort((a, b) => b.amount - a.amount),
        count: expenses.length,
        // A share of the total above, not an addition to it.
        salaryPaid,
      },
      net: incomeTotal - expenseTotal,
      unpostedRecurring: unposted,
      unpostedTotal: unposted.reduce((sum, row) => sum + row.amount, 0),
    };
  },

  async listExpenses(tenantId: string, month: string) {
    const rows = await financeRepository.listExpenses(tenantId, month);

    return {
      month,
      expenses: rows.map((row) => ({
        id: row.id,
        label: row.label,
        amount: row.amount,
        category: row.category,
        incurredOn: row.incurredOn,
        note: row.note,
        periodMonth: row.periodMonth,
        recurringExpenseId: row.recurringExpenseId,
        recurringLabel: row.recurringExpense?.label ?? null,
        // A salary row is not editable here: it belongs to a payslip, and the
        // two must not be able to disagree about what was paid.
        salaryPaymentId: row.salaryPayment?.id ?? null,
        recordedByName: row.recordedBy?.user.name ?? null,
      })),
      total: rows.reduce((sum, row) => sum + row.amount, 0),
    };
  },

  async createExpense(tenantId: string, input: CreateExpenseInput, recordedById: string | null) {
    const expense = await financeRepository.createExpense(
      tenantId,
      { ...input, incurredOn: input.incurredOn ? new Date(input.incurredOn) : new Date() },
      recordedById,
    );

    return { data: expense };
  },

  async updateExpense(tenantId: string, expenseId: string, input: UpdateExpenseInput) {
    const existing = await financeRepository.findExpense(tenantId, expenseId);
    if (!existing) return { error: "Expense not found.", status: 404 as const };

    if (existing.salaryPayment) {
      return {
        error: "This row came from a salary payment. Edit it on that person's pay month instead.",
        status: 400 as const,
      };
    }

    const expense = await financeRepository.updateExpense(expenseId, input);
    return { data: expense };
  },

  async deleteExpense(tenantId: string, expenseId: string) {
    const existing = await financeRepository.findExpense(tenantId, expenseId);
    if (!existing) return { error: "Expense not found.", status: 404 as const };

    if (existing.salaryPayment) {
      return {
        error: "This row came from a salary payment. Remove the payment instead.",
        status: 400 as const,
      };
    }

    await financeRepository.deleteExpense(expenseId);
    return { data: { id: expenseId } };
  },

  /** The templates, each told whether this month has been posted yet. */
  async listRecurring(tenantId: string, month: string) {
    const [templates, posted] = await Promise.all([
      financeRepository.listRecurring(tenantId),
      financeRepository.postedRecurringIds(tenantId, month),
    ]);

    const postedFor = new Map(posted.map((row) => [row.recurringExpenseId, row]));

    return {
      month,
      recurring: templates.map((template) => {
        const post = postedFor.get(template.id);
        return {
          id: template.id,
          label: template.label,
          amount: template.amount,
          category: template.category,
          dayOfMonth: template.dayOfMonth,
          isActive: template.isActive,
          note: template.note,
          dueOn: dueDateFor(month, template.dayOfMonth),
          postedExpenseId: post?.id ?? null,
          postedAmount: post?.amount ?? null,
        };
      }),
    };
  },

  async createRecurring(tenantId: string, input: CreateRecurringExpenseInput) {
    return { data: await financeRepository.createRecurring(tenantId, input) };
  },

  async updateRecurring(tenantId: string, id: string, input: UpdateRecurringExpenseInput) {
    const existing = await financeRepository.findRecurring(tenantId, id);
    if (!existing) return { error: "Recurring expense not found.", status: 404 as const };

    return { data: await financeRepository.updateRecurring(id, input) };
  },

  /**
   * Deleting a template leaves the months already posted from it alone.
   *
   * Those are costs the gym actually incurred; removing them because the
   * agreement ended would rewrite closed months. The foreign key is
   * `ON DELETE SET NULL` for the same reason.
   */
  async deleteRecurring(tenantId: string, id: string) {
    const existing = await financeRepository.findRecurring(tenantId, id);
    if (!existing) return { error: "Recurring expense not found.", status: 404 as const };

    await financeRepository.deleteRecurring(id);
    return { data: { id } };
  },

  /** Post one month of a template into the ledger. */
  async postRecurring(
    tenantId: string,
    id: string,
    input: PostRecurringExpenseInput,
    recordedById: string | null,
  ) {
    const template = await financeRepository.findRecurring(tenantId, id);
    if (!template) return { error: "Recurring expense not found.", status: 404 as const };

    const alreadyPosted = await financeRepository.postedRecurringIds(tenantId, input.month);
    if (alreadyPosted.some((row) => row.recurringExpenseId === id)) {
      return { error: `${template.label} is already posted for ${input.month}.`, status: 400 as const };
    }

    const expense = await financeRepository.postRecurring({
      tenantId,
      recurringExpenseId: id,
      month: input.month,
      label: template.label,
      amount: input.amount ?? template.amount,
      category: template.category,
      incurredOn: dueDateFor(input.month, template.dayOfMonth),
      note: input.note ?? template.note,
      recordedById,
    });

    return { data: expense };
  },
};
