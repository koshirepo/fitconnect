/**
 * Documentation: Settings service.
 *
 * - Implements the business rules for tenant settings and extra charge configuration by coordinating repositories, shared helpers, and cross-cutting utilities like email or audit logging where needed.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: settingsService.
 */
import { settingsRepository } from "./settings.repository";
import type {
  UpdateSettingsInput,
  CreateChargeInput,
  UpdateChargeInput,
} from "./settings.schema";
import { getWhatsAppTemplates } from "@fitconnect/shared/whatsapp-templates";

const DEFAULT_SETTINGS = {
  overdueDays: 30,
  whatsappTemplates: getWhatsAppTemplates(),
};

export const settingsService = {
  // ─── Settings ───────────────────────────────────────────────────────────────

  /**
   * Execute the `get settings` workflow for the settings module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async getSettings(tenantId: string) {
    const settings = await settingsRepository.getSettings(tenantId);
    return {
      data: {
        settings: settings
          ? {
              overdueDays: settings.overdueDays,
              whatsappTemplates: getWhatsAppTemplates(settings.whatsappTemplates),
            }
          : DEFAULT_SETTINGS,
      },
    };
  },

  /**
   * Execute the `update settings` workflow for the settings module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async updateSettings(tenantId: string, input: UpdateSettingsInput) {
    if (
      input.whatsappTemplates !== undefined &&
      !(await settingsRepository.supportsWhatsAppTemplates())
    ) {
      return {
        error:
          "WhatsApp templates require the latest database migration. Apply the pending TenantSettings migration and try again.",
        status: 409 as const,
      };
    }

    const data: Record<string, unknown> = {};
    if (input.overdueDays !== undefined) data.overdueDays = input.overdueDays;
    if (input.whatsappTemplates !== undefined) {
      data.whatsappTemplates = input.whatsappTemplates;
    }

    const settings = await settingsRepository.upsertSettings(tenantId, data);
    return {
      data: {
        settings: {
          overdueDays: settings.overdueDays,
          whatsappTemplates: getWhatsAppTemplates(settings.whatsappTemplates),
        },
      },
    };
  },

  // ─── Charges ────────────────────────────────────────────────────────────────

  /**
   * Execute the `list charges` workflow for the settings module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async listCharges(tenantId: string) {
    const charges = await settingsRepository.listCharges(tenantId);
    return { data: { charges } };
  },

  /**
   * Execute the `create charge` workflow for the settings module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async createCharge(tenantId: string, input: CreateChargeInput) {
    const existing = await settingsRepository.findChargeByName(
      tenantId,
      input.name,
    );
    if (existing) {
      return {
        error: "A charge with this name already exists.",
        status: 409 as const,
      };
    }

    const charge = await settingsRepository.createCharge(tenantId, input);
    return { data: { charge } };
  },

  /**
   * Execute the `update charge` workflow for the settings module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async updateCharge(
    tenantId: string,
    chargeId: string,
    input: UpdateChargeInput,
  ) {
    const existing = await settingsRepository.findCharge(chargeId, tenantId);
    if (!existing) {
      return { error: "Charge not found.", status: 404 as const };
    }

    if (input.name && input.name !== existing.name) {
      const duplicate = await settingsRepository.findChargeByName(
        tenantId,
        input.name,
      );
      if (duplicate) {
        return {
          error: "A charge with this name already exists.",
          status: 409 as const,
        };
      }
    }

    const charge = await settingsRepository.updateCharge(chargeId, input);
    return { data: { charge } };
  },

  /**
   * Execute the `delete charge` workflow for the settings module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async deleteCharge(tenantId: string, chargeId: string) {
    const existing = await settingsRepository.findCharge(chargeId, tenantId);
    if (!existing) {
      return { error: "Charge not found.", status: 404 as const };
    }

    await settingsRepository.deleteCharge(chargeId);
    return { data: true };
  },
};
