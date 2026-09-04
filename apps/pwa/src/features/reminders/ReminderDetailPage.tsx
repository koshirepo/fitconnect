/**
 * Documentation: One notification, in full.
 *
 * - What was sent, to whom, when, through which channel, and whether the money it was chasing ever arrived. Reached from the reminder calendar, and from a member's own history.
 * - Swiping moves through the same set the calendar showed. The neighbours come from the cached month rather than a fresh request, so the gesture costs nothing and a deep link — with no month cached — simply has nothing to swipe to, which is the honest outcome.
 * - The month travels in the URL so a shared link lands on the same page with the same neighbours, the way the calendar's own `?month=` does.
 * - Primary exports: ReminderDetailPage.
 */
import * as React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import { useReminder } from "@/api/queries/reminders";
import { getApiError } from "@/api/client";
import { queryKeys } from "@/lib/query-keys";
import type { ReminderCalendar } from "@/api/reminders";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DetailPageSkeleton } from "@/components/ui/skeleton";
import { SwipePane } from "@/components/ui/swipe-pane";
import AvatarCard from "@/components/ui/avatarCard";
import { getTenantDashboardPath } from "@/lib/subdomain";
import { formatDate } from "@/lib/utils";
import {
  ArrowLeft,
  Bell,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  MessageCircle,
  User,
} from "lucide-react";

/** What each reminder was about, in the words the desk uses. */
const REASON_LABELS: Record<string, string> = {
  RENEWAL_DUE: "Renewal due",
  EXPIRED: "Membership expired",
  PENDING_PAYMENT: "Pending payment",
  SUSPENDED: "Marked inactive",
};

/** Why the app sent it, spelled out for someone reading one message. */
const REASON_BLURBS: Record<string, string> = {
  RENEWAL_DUE: "Sent while the membership was still live, counting down to its end date.",
  EXPIRED: "Sent after the membership had lapsed, during the grace period before deactivation.",
  PENDING_PAYMENT: "Sent because a payment recorded against this member was still unpaid.",
  SUSPENDED: "The last message sent as the membership was deactivated for non-payment.",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatInr(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * The reminders either side of this one, taken from the cached month.
 *
 * Ordered newest first, matching how the calendar's day list reads, so swiping
 * left moves the way the eye already travels down that list.
 */
function useAdjacentReminders(month: string | null, currentId: string | undefined) {
  const queryClient = useQueryClient();
  const tenantId = useAuthStore((state) => state.currentTenantId);

  return React.useMemo(() => {
    const empty = { previousId: null as string | null, nextId: null as string | null, index: 0, total: 0 };
    if (!month || !currentId || !tenantId) return empty;

    const cached = queryClient.getQueryData<ReminderCalendar>(
      queryKeys.reminders.calendar(tenantId, month),
    );
    if (!cached) return empty;

    const ordered = Object.values(cached.days)
      .flatMap((day) => day.reminders)
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());

    const index = ordered.findIndex((reminder) => reminder.id === currentId);
    if (index === -1) return empty;

    return {
      previousId: index > 0 ? ordered[index - 1].id : null,
      nextId: index < ordered.length - 1 ? ordered[index + 1].id : null,
      index,
      total: ordered.length,
    };
  }, [currentId, month, queryClient, tenantId]);
}

export default function ReminderDetailPage() {
  const { reminderId } = useParams<{ reminderId: string }>();
  const navigate = useAppNavigate();
  const [searchParams] = useSearchParams();
  const month = searchParams.get("month");

  const reminderQuery = useReminder(reminderId);
  const reminder = reminderQuery.data ?? null;
  const loading = reminderQuery.isPending;
  const error = reminderQuery.isError ? getApiError(reminderQuery.error) : "";

  const siblings = useAdjacentReminders(month, reminderId);

  const goToSibling = (id: string | null) => {
    // `replace` so swiping through twenty messages does not bury the calendar
    // twenty entries deep in the back stack.
    if (!id) return;
    const suffix = month ? `?month=${month}` : "";
    navigate(getTenantDashboardPath(`/reminders/${id}${suffix}`), { replace: true });
  };

  const backToCalendar = () =>
    navigate(getTenantDashboardPath(`/reminders${month ? `?month=${month}` : ""}`));

  if (loading) return <DetailPageSkeleton />;

  if (error || !reminder) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={backToCalendar}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error || "This reminder no longer exists."}
        </p>
      </div>
    );
  }

  const isWhatsApp = reminder.channel === "WHATSAPP";

  return (
    <SwipePane
      paneKey={reminderId ?? "reminder"}
      paneIndex={siblings.index}
      onNext={() => goToSibling(siblings.nextId)}
      onPrevious={() => goToSibling(siblings.previousId)}
      className="space-y-6"
    >
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={backToCalendar}>
          <ArrowLeft className="h-4 w-4" />
          Calendar
        </Button>

        {siblings.total > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={!siblings.previousId}
              onClick={() => goToSibling(siblings.previousId)}
              title="Newer reminder"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              {siblings.index + 1} of {siblings.total}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={!siblings.nextId}
              onClick={() => goToSibling(siblings.nextId)}
              title="Older reminder"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* What went out */}
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span
              className={
                isWhatsApp
                  ? "rounded-full bg-emerald-500/10 p-2 text-emerald-600"
                  : "rounded-full bg-blue-500/10 p-2 text-blue-600"
              }
            >
              {isWhatsApp ? (
                <MessageCircle className="h-5 w-5" />
              ) : (
                <Bell className="h-5 w-5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold">
                {REASON_LABELS[reminder.reason] ?? reminder.reason}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isWhatsApp ? "WhatsApp" : "Push notification"} ·{" "}
                {formatDateTime(reminder.sentAt)}
              </p>
            </div>
          </div>

          {reminder.message ? (
            <p className="whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-sm">
              {reminder.message}
            </p>
          ) : (
            <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
              No message body was recorded for this one.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            {REASON_BLURBS[reminder.reason] ?? ""}
            {isWhatsApp
              ? " Recorded when the message was opened — WhatsApp does not report back whether it was delivered or read."
              : ""}
          </p>

          {reminder.actor && (
            <p className="text-xs text-muted-foreground">
              Sent by {reminder.actor.user.name}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Who it went to */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium">
            <User className="h-4 w-4" />
            Sent to
          </p>
          <button
            type="button"
            className="flex w-full rounded-lg px-1 py-1 text-left transition-colors hover:bg-muted/60"
            onClick={() =>
              navigate(getTenantDashboardPath(`/members/${reminder.membershipId}`))
            }
          >
            <AvatarCard
              name={reminder.member?.user.name ?? "Removed member"}
              avatarUrl={reminder.member?.user.avatarUrl}
              memberId={reminder.member?.memberId ?? undefined}
              variant="md"
              wrapName
              className="min-w-0 flex-1"
            >
              {reminder.member?.dueDate && (
                <p className="text-xs text-muted-foreground">
                  Membership until {formatDate(reminder.member.dueDate)}
                </p>
              )}
              {reminder.member?.status && reminder.member.status !== "ACTIVE" && (
                <p className="text-xs text-amber-600">Inactive</p>
              )}
            </AvatarCard>
          </button>
        </CardContent>
      </Card>

      {/* What became of it */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium">
            <CreditCard className="h-4 w-4" />
            Outcome
          </p>
          {reminder.payment ? (
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60"
              onClick={() =>
                navigate(getTenantDashboardPath(`/payments/${reminder.payment!.id}`))
              }
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {reminder.payment.description ?? "Payment"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {reminder.payment.paidAt
                    ? `Paid ${formatDate(reminder.payment.paidAt)}`
                    : reminder.payment.status}
                </p>
              </div>
              <p className="shrink-0 font-semibold">{formatInr(reminder.payment.amount)}</p>
            </button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Still unanswered — no payment has been recorded since this went out.
            </p>
          )}
        </CardContent>
      </Card>
    </SwipePane>
  );
}
