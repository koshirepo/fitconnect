import { api } from "./client";
import type { ApiResponse, FreezeStatus } from "@/types/api";

export const freezesApi = {
  /** Budget, current freeze, and history for one membership. */
  status: (tenantId: string, membershipId: string) =>
    api.get<ApiResponse<FreezeStatus>>(
      `/tenants/${tenantId}/members/${membershipId}/freeze`,
    ),

  create: (
    tenantId: string,
    membershipId: string,
    payload: { startsOn: string; days: number; reason?: string; allowBackdate?: boolean },
  ) =>
    api.post<ApiResponse<{ freeze: { id: string }; newTermEndsOn: string }>>(
      `/tenants/${tenantId}/members/${membershipId}/freeze`,
      payload,
    ),

  end: (tenantId: string, freezeId: string, endedOn?: string) =>
    api.post<ApiResponse<{ daysUsed: number; daysReturned: number }>>(
      `/tenants/${tenantId}/freezes/${freezeId}/end`,
      endedOn ? { endedOn } : {},
    ),
};
