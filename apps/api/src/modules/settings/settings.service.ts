import { settingsRepository } from "./settings.repository";
import type {
  UpdateSettingsInput,
  CreateChargeInput,
  UpdateChargeInput,
} from "./settings.schema";

const DEFAULT_SETTINGS = {
  overdueDays: 30,
};

export const settingsService = {
  // ─── Settings ───────────────────────────────────────────────────────────────

  async getSettings(tenantId: string) {
    const settings = await settingsRepository.getSettings(tenantId);
    return {
      data: {
        settings: settings
          ? {
              overdueDays: settings.overdueDays,
            }
          : DEFAULT_SETTINGS,
      },
    };
  },

  async updateSettings(tenantId: string, input: UpdateSettingsInput) {
    const data: Record<string, unknown> = {};
    if (input.overdueDays !== undefined) data.overdueDays = input.overdueDays;

    const settings = await settingsRepository.upsertSettings(tenantId, data);
    return {
      data: {
        settings: {
          overdueDays: settings.overdueDays,
        },
      },
    };
  },

  // ─── Charges ────────────────────────────────────────────────────────────────

  async listCharges(tenantId: string) {
    const charges = await settingsRepository.listCharges(tenantId);
    return { data: { charges } };
  },

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

  async deleteCharge(tenantId: string, chargeId: string) {
    const existing = await settingsRepository.findCharge(chargeId, tenantId);
    if (!existing) {
      return { error: "Charge not found.", status: 404 as const };
    }

    await settingsRepository.deleteCharge(chargeId);
    return { data: true };
  },
};
