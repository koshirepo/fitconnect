import { prisma } from "../../lib/prisma";

export const settingsRepository = {
  // ─── Settings ───────────────────────────────────────────────────────────────

  getSettings(tenantId: string) {
    return prisma.tenantSettings.findUnique({ where: { tenantId } });
  },

  upsertSettings(tenantId: string, data: Record<string, unknown>) {
    return prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  },

  // ─── Charges ────────────────────────────────────────────────────────────────

  listCharges(tenantId: string, activeOnly = false) {
    return prisma.tenantCharge.findMany({
      where: { tenantId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: { createdAt: "asc" },
    });
  },

  findCharge(chargeId: string, tenantId: string) {
    return prisma.tenantCharge.findFirst({
      where: { id: chargeId, tenantId },
      select: { id: true, name: true },
    });
  },

  findChargeByName(tenantId: string, name: string) {
    return prisma.tenantCharge.findUnique({
      where: { tenantId_name: { tenantId, name } },
      select: { id: true },
    });
  },

  createCharge(tenantId: string, data: { name: string; amount: number; isMandatory: boolean }) {
    return prisma.tenantCharge.create({
      data: { tenantId, ...data },
    });
  },

  updateCharge(chargeId: string, data: Record<string, unknown>) {
    return prisma.tenantCharge.update({
      where: { id: chargeId },
      data,
    });
  },

  deleteCharge(chargeId: string) {
    return prisma.tenantCharge.delete({ where: { id: chargeId } });
  },

  getMandatoryCharges(tenantId: string) {
    return prisma.tenantCharge.findMany({
      where: { tenantId, isMandatory: true, isActive: true },
      orderBy: { createdAt: "asc" },
    });
  },
};
