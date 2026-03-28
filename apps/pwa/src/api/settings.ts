import { api } from "./client";
import type {
  TenantSettings,
  UpdateTenantSettingsPayload,
  TenantCharge,
  CreateTenantChargePayload,
  UpdateTenantChargePayload,
  ApiResponse,
} from "@/types/api";

export const settingsApi = {
  // ─── Settings ───────────────────────────────────────────────────────────────

  getSettings: (tenantId: string) =>
    api.get<ApiResponse<{ settings: TenantSettings }>>(`/tenants/${tenantId}/settings`),

  updateSettings: (tenantId: string, data: UpdateTenantSettingsPayload) =>
    api.put<ApiResponse<{ settings: TenantSettings }>>(`/tenants/${tenantId}/settings`, data),

  // ─── Charges ────────────────────────────────────────────────────────────────

  listCharges: (tenantId: string) =>
    api.get<ApiResponse<{ charges: TenantCharge[] }>>(`/tenants/${tenantId}/charges`),

  createCharge: (tenantId: string, data: CreateTenantChargePayload) =>
    api.post<ApiResponse<{ charge: TenantCharge }>>(`/tenants/${tenantId}/charges`, data),

  updateCharge: (tenantId: string, chargeId: string, data: UpdateTenantChargePayload) =>
    api.patch<ApiResponse<{ charge: TenantCharge }>>(
      `/tenants/${tenantId}/charges/${chargeId}`,
      data,
    ),

  deleteCharge: (tenantId: string, chargeId: string) =>
    api.delete(`/tenants/${tenantId}/charges/${chargeId}`),
};
