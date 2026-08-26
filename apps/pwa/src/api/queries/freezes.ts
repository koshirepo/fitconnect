/**
 * Documentation: Membership freeze hooks.
 *
 * - One query for a membership's freeze status, and two mutations that change it. Both writes move the member's end date, so they invalidate members and payments as well as freezes.
 * - Primary exports: useFreezeStatus, useCreateFreeze, useEndFreeze.
 */
import { freezesApi } from "@/api/freezes";
import { unwrap, useCurrentTenantId, useTenantMutation, useTenantQuery } from "./shared";

/** Every key a freeze touches: its own, the member's record, and the ledger. */
function freezeScopes(tenantId: string | null) {
  const id = tenantId ?? "none";
  return [["freezes", id], ["members", id], ["payments", id]];
}

export function useFreezeStatus(
  membershipId: string | undefined,
  options: { enabled?: boolean } = {},
) {
  return useTenantQuery(
    (tenantId) => ["freezes", tenantId, membershipId ?? "none"],
    async (tenantId) => unwrap(await freezesApi.status(tenantId, membershipId!)),
    { enabled: Boolean(membershipId) && (options.enabled ?? true) },
  );
}

export function useCreateFreeze() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (
      id,
      vars: {
        membershipId: string;
        startsOn: string;
        days: number;
        reason?: string;
        allowBackdate?: boolean;
      },
    ) => {
      const { membershipId, ...payload } = vars;
      return unwrap(await freezesApi.create(id, membershipId, payload));
    },
    { invalidates: freezeScopes(tenantId) },
  );
}

export function useEndFreeze() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, vars: { freezeId: string; endedOn?: string }) =>
      unwrap(await freezesApi.end(id, vars.freezeId, vars.endedOn)),
    { invalidates: freezeScopes(tenantId) },
  );
}
