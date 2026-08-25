/**
 * Documentation: Settings repository.
 *
 * - Encapsulates Prisma queries for tenant settings and extra charge configuration, including relation loading and write patterns that are specific to the persistence layer.
 * - Keep raw database concerns here so the service layer can reason about domain behavior without duplicating query details.
 * - Primary exports: settingsRepository.
 */
import { prisma } from "../../lib/prisma";

type SettingsRecord = {
  overdueDays: number;
  whatsappTemplates?: unknown;
};

type LegacySettingsRow = {
  overdueDays: number;
};

type SqliteTableInfoRow = {
  name: string;
};

const WHATSAPP_TEMPLATES_COLUMN = "whatsappTemplates";

async function hasWhatsAppTemplatesColumn() {
  const rows = await prisma.$queryRawUnsafe<SqliteTableInfoRow[]>(
    'PRAGMA table_info("TenantSettings")',
  );
  return rows.some((row) => row.name === WHATSAPP_TEMPLATES_COLUMN);
}

async function getLegacySettings(tenantId: string): Promise<SettingsRecord | null> {
  const rows = await prisma.$queryRawUnsafe<LegacySettingsRow[]>(
    'SELECT "overdueDays" FROM "TenantSettings" WHERE "tenantId" = ? LIMIT 1',
    tenantId,
  );
  const row = rows[0];
  return row ? { overdueDays: Number(row.overdueDays) } : null;
}

async function upsertLegacySettings(
  tenantId: string,
  data: Record<string, unknown>,
): Promise<SettingsRecord> {
  const existing = await getLegacySettings(tenantId);
  const overdueDays =
    typeof data.overdueDays === "number"
      ? data.overdueDays
      : existing?.overdueDays ?? 30;

  await prisma.$executeRawUnsafe(
    `INSERT INTO "TenantSettings" ("id", "tenantId", "overdueDays", "createdAt", "updatedAt")
     VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT("tenantId") DO UPDATE SET
       "overdueDays" = excluded."overdueDays",
       "updatedAt" = CURRENT_TIMESTAMP`,
    crypto.randomUUID(),
    tenantId,
    overdueDays,
  );

  return { overdueDays };
}

export const settingsRepository = {
  // ─── Settings ───────────────────────────────────────────────────────────────

  /**
   * Run the `get settings` persistence operation for the settings module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async getSettings(tenantId: string): Promise<SettingsRecord | null> {
    if (!(await hasWhatsAppTemplatesColumn())) {
      return getLegacySettings(tenantId);
    }

    return prisma.tenantSettings.findUnique({ where: { tenantId } });
  },

  async supportsWhatsAppTemplates() {
    return hasWhatsAppTemplatesColumn();
  },

  /**
   * Run the `upsert settings` persistence operation for the settings module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async upsertSettings(
    tenantId: string,
    data: Record<string, unknown>,
  ): Promise<SettingsRecord> {
    if (!(await hasWhatsAppTemplatesColumn())) {
      return upsertLegacySettings(tenantId, data);
    }

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
