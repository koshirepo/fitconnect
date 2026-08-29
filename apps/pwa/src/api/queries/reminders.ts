/**
 * Documentation: Reminder-log queries and the manual-send recorder.
 *
 * - `useMemberReminders` and `usePaymentReminders` are ordinary tenant-scoped reads. `useLogReminder` is the odd one: it records a WhatsApp message on its way out, and is deliberately unable to reject.
 * - A WhatsApp link opens in a new tab the moment it is clicked. If logging it threw, the message would still have gone — so the recorder swallows failures and simply refreshes the history when it succeeds.
 * - Primary exports: useMemberReminders, usePaymentReminders, useLogReminder.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { remindersApi, type LogReminderPayload } from "@/api/reminders";
import { queryKeys } from "@/lib/query-keys";
import { unwrap, useCurrentTenantId, useTenantQuery } from "./shared";

export function useMemberReminders(
  membershipId: string | undefined,
  options: { enabled?: boolean } = {},
) {
  return useTenantQuery(
    (tenantId) => queryKeys.reminders.member(tenantId, membershipId ?? "none"),
    async (tenantId) => unwrap(await remindersApi.listForMember(tenantId, membershipId!)),
    { enabled: Boolean(membershipId) && (options.enabled ?? true) },
  );
}

export function usePaymentReminders(
  paymentId: string | undefined,
  options: { enabled?: boolean } = {},
) {
  return useTenantQuery(
    (tenantId) => queryKeys.reminders.payment(tenantId, paymentId ?? "none"),
    async (tenantId) => unwrap(await remindersApi.listForPayment(tenantId, paymentId!)).reminders,
    { enabled: Boolean(paymentId) && (options.enabled ?? true) },
  );
}

/**
 * Record a WhatsApp message staff just sent.
 *
 * Never throws: the message has already left by the time this runs, and an
 * error here would report a failure that did not happen.
 */
export function useLogReminder() {
  const tenantId = useCurrentTenantId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { membershipId: string; payload: LogReminderPayload }) => {
      if (!tenantId) return null;
      try {
        return unwrap(await remindersApi.log(tenantId, input.membershipId, input.payload));
      } catch (error) {
        console.warn("[reminder] could not record the WhatsApp send", error);
        return null;
      }
    },
    onSuccess: (_result, input) => {
      if (!tenantId) return;
      void queryClient.invalidateQueries({
        queryKey: queryKeys.reminders.member(tenantId, input.membershipId),
      });
    },
  });
}
