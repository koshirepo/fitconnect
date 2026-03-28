/**
 * Documentation: Settings repository.
 *
 * - Encapsulates Prisma queries for tenant settings and extra charge configuration, including relation loading and write patterns that are specific to the persistence layer.
 * - Keep raw database concerns here so the service layer can reason about domain behavior without duplicating query details.
 * - Primary exports: settingsRepository.
 */
import { prisma } from "../../lib/prisma";

export const settingsRepository = {
  // ─── Settings ───────────────────────────────────────────────────────────────

  /**
   * Run the `get settings` persistence operation for the settings module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  getSettings(tenantId: string) {
    return prisma.tenantSettings.findUnique({ where: { tenantId } });
  },

  /**
   * Run the `upsert settings` persistence operation for the settings module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  upsertSettings(tenantId: string, data: Record<string, unknown>) {
    return prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  },

  // ─── Charges ────────────────────────────────────────────────────────────────

  /**
   * Run the `list charges` persistence operation for the settings module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  listCharges(tenantId: string, activeOnly = false) {
    return prisma.tenantCharge.findMany({
      where: { tenantId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: { createdAt: "asc" },
    });
  },

  /**
   * Run the `find charge` persistence operation for the settings module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findCharge(chargeId: string, tenantId: string) {
    return prisma.tenantCharge.findFirst({
      where: { id: chargeId, tenantId },
      select: { id: true, name: true },
    });
  },

  /**
   * Run the `find charge by name` persistence operation for the settings module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findChargeByName(tenantId: string, name: string) {
    return prisma.tenantCharge.findUnique({
      where: { tenantId_name: { tenantId, name } },
      select: { id: true },
    });
  },

  /**
   * Run the `create charge` persistence operation for the settings module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  createCharge(tenantId: string, data: { name: string; amount: number; isMandatory: boolean }) {
    return prisma.tenantCharge.create({
      data: { tenantId, ...data },
    });
  },

  /**
   * Run the `update charge` persistence operation for the settings module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  updateCharge(chargeId: string, data: Record<string, unknown>) {
    return prisma.tenantCharge.update({
      where: { id: chargeId },
      data,
    });
  },

  /**
   * Run the `delete charge` persistence operation for the settings module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  deleteCharge(chargeId: string) {
    return prisma.tenantCharge.delete({ where: { id: chargeId } });
  },

  /**
   * Run the `get mandatory charges` persistence operation for the settings module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  getMandatoryCharges(tenantId: string) {
    return prisma.tenantCharge.findMany({
      where: { tenantId, isMandatory: true, isActive: true },
      orderBy: { createdAt: "asc" },
    });
  },
};
