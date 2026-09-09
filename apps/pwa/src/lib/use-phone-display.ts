/**
 * Documentation: Who sees a member's phone number, and who sees it masked.
 *
 * - The gym's admin (and platform staff) read numbers in full; a trainer or any other staff role sees `71XXXX9658` instead.
 * - Masking is a display rule and nothing more. The API still sends the real number, so calling, WhatsApp, SMS and saving an edit all keep working for everyone who could do them before.
 * - A member always sees their own number in full, so a self-profile rendered through a shared card is not masked at them.
 * - Gate the display on `MEMBERS_PHONE_READ` rather than on the role string, so a gym that wants its trainers to see numbers can grant it from the roles screen.
 * - Primary exports: usePhoneDisplay.
 */
import * as React from "react";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useAuthStore } from "@/stores/auth";
import { maskPhone } from "@/lib/phone";

export interface PhoneDisplay {
  /** True when this session reads phone numbers in full. */
  canReadPhone: boolean;
  /**
   * The number as this session should see it: the real digits, or the masked
   * form. Pass `ownerUserId` where the record carries one — a person always
   * sees their own number.
   */
  format: (phone?: string | null, ownerUserId?: string | null) => string | null;
}

export function usePhoneDisplay(): PhoneDisplay {
  const user = useAuthStore((state) => state.user);

  return React.useMemo(() => {
    const canReadPhone = useAuthStore.getState().can(Permission.MEMBERS_PHONE_READ);
    const selfUserId = user?.id ?? null;

    return {
      canReadPhone,
      format: (phone, ownerUserId) => {
        if (!phone) return null;
        if (canReadPhone) return phone;
        if (ownerUserId && selfUserId && ownerUserId === selfUserId) return phone;

        return maskPhone(phone);
      },
    };
    // `user` carries the role, membership and permission list the answer depends
    // on; the body reads the resolved set from the store, so this is a cache key
    // as much as a value — the same shape `usePermissions` uses.
  }, [user]);
}
