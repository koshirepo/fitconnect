/**
 * Documentation: Salary repository.
 *
 * - Prisma queries for staff pay: the standing agreement, a month of it, the things added to or taken off that month, and the payments made against it.
 * - A cycle is created on demand rather than in advance. Nothing writes twelve empty months for every staff member; the row appears the first time somebody looks at that month or pays into it, and carries a snapshot of the agreed figure so a later raise does not rewrite it.
 * - Primary exports: salaryRepository.
 */
import { prisma } from "../../lib/prisma";
import type { AddSalaryComponentInput, SetCompensationInput } from "./finance.schema";

const staffSelect = {
  id: true,
  memberId: true,
  role: true,
  status: true,
  // Contact details ride along because every write here notifies the person it
  // is about, and a second round trip for their email and phone would run on
  // every payment.
  user: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true } },
} as const;

const cycleInclude = {
  components: { orderBy: { createdAt: "asc" } },
  payments: {
    orderBy: { paidAt: "desc" },
    include: { recordedBy: { select: staffSelect } },
  },
  member: { select: staffSelect },
} as const;

export const salaryRepository = {
  /**
   * Everyone who is paid: staff, plus anybody with an agreement on file.
   *
   * Role is the starting point rather than the whole answer — a gym may put
   * somebody on payroll whose role is still MEMBER, and dropping them from this
   * list would lose their pay history.
   */
  listStaff(tenantId: string) {
    return prisma.tenantMembership.findMany({
      where: {
        tenantId,
        OR: [{ role: { in: ["ADMIN", "COACH", "TRAINER"] } }, { compensation: { isNot: null } }],
      },
      select: { ...staffSelect, compensation: true },
      orderBy: { memberId: "asc" },
    });
  },

  findMembership(tenantId: string, membershipId: string) {
    return prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      select: { ...staffSelect, compensation: true },
    });
  },

  findMembershipByUser(tenantId: string, userId: string) {
    return prisma.tenantMembership.findFirst({
      where: { tenantId, userId },
      select: { ...staffSelect, compensation: true },
    });
  },

  upsertCompensation(tenantId: string, membershipId: string, input: SetCompensationInput) {
    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();

    return prisma.staffCompensation.upsert({
      where: { membershipId },
      create: {
        tenantId,
        membershipId,
        monthlyAmount: input.monthlyAmount,
        effectiveFrom,
        isActive: input.isActive ?? true,
        note: input.note ?? null,
      },
      update: {
        monthlyAmount: input.monthlyAmount,
        ...(input.effectiveFrom !== undefined ? { effectiveFrom } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
    });
  },

  findCycle(tenantId: string, membershipId: string, month: string) {
    return prisma.salaryCycle.findFirst({
      where: { tenantId, membershipId, month },
      include: cycleInclude,
    });
  },

  findCycleById(tenantId: string, cycleId: string) {
    return prisma.salaryCycle.findFirst({
      where: { id: cycleId, tenantId },
      include: cycleInclude,
    });
  },

  createCycle(tenantId: string, membershipId: string, month: string, baseAmount: number) {
    return prisma.salaryCycle.create({
      data: { tenantId, membershipId, month, baseAmount },
      include: cycleInclude,
    });
  },

  /** Every cycle for a month, for the admin list. */
  listCycles(tenantId: string, month: string) {
    return prisma.salaryCycle.findMany({
      where: { tenantId, month },
      include: cycleInclude,
    });
  },

  /** A staff member's own history, newest month first. */
  listCyclesForMember(tenantId: string, membershipId: string, limit = 24) {
    return prisma.salaryCycle.findMany({
      where: { tenantId, membershipId },
      include: cycleInclude,
      orderBy: { month: "desc" },
      take: limit,
    });
  },

  setCycleStatus(cycleId: string, status: string) {
    return prisma.salaryCycle.update({ where: { id: cycleId }, data: { status } });
  },

  addComponent(cycleId: string, input: AddSalaryComponentInput) {
    return prisma.salaryComponent.create({
      data: { cycleId, kind: input.kind, label: input.label, amount: input.amount },
    });
  },

  findComponent(componentId: string) {
    return prisma.salaryComponent.findUnique({
      where: { id: componentId },
      include: { cycle: { select: { id: true, tenantId: true } } },
    });
  },

  deleteComponent(componentId: string) {
    return prisma.salaryComponent.delete({ where: { id: componentId } });
  },

  createPayment(args: {
    tenantId: string;
    cycleId: string;
    amount: number;
    method: string;
    paidAt: Date;
    note: string | null;
    recordedById: string | null;
    expenseId: string;
  }) {
    return prisma.salaryPayment.create({ data: args });
  },

  findPayment(tenantId: string, paymentId: string) {
    return prisma.salaryPayment.findFirst({
      where: { id: paymentId, tenantId },
      include: { cycle: { select: { id: true, tenantId: true } } },
    });
  },

  deletePayment(paymentId: string) {
    return prisma.salaryPayment.delete({ where: { id: paymentId } });
  },

  /** Total paid out in salary for a month, for the finance summary. */
  async paidTotalForMonth(tenantId: string, month: string) {
    const result = await prisma.salaryPayment.aggregate({
      where: { tenantId, cycle: { month } },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  },
};
