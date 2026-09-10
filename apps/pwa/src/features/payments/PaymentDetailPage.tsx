import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useParams } from "react-router-dom";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import {
  useDeletePayment,
  usePayment,
  usePayments,
  useUpdatePayment,
  useUpdatePaymentStatus,
} from "@/api/queries/payments";
import { getApiError } from "@/api/client";
import { queryKeys } from "@/lib/query-keys";
import { getTenantDashboardPath } from "@/lib/subdomain";
import { useAdjacentRecord } from "@/lib/use-adjacent-record";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { usePaymentReminders } from "@/api/queries/reminders";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DetailPageSkeleton } from "@/components/ui/skeleton";
import { SwipePane } from "@/components/ui/swipe-pane";
import { usePhoneDisplay } from "@/lib/use-phone-display";
import { cn, formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  MoreVertical,
  Trash2,
  User,
  XCircle,
} from "lucide-react";
import type { Payment, PaymentStatus } from "@/types/api";
import AvatarCard from "@/components/ui/avatarCard";

/** What each reminder was about, in the words the desk uses. */
const REMINDER_REASON_LABELS: Record<string, string> = {
  RENEWAL_DUE: "Renewal due",
  EXPIRED: "Membership expired",
  PENDING_PAYMENT: "Pending payment",
  SUSPENDED: "Marked inactive",
};

const statusLabel: Record<PaymentStatus, string> = {
  PENDING: "Pending",
  COMPLETED: "Completed",
  FAILED: "Failed",
  REFUNDED: "Refunded",
};

/**
 * The statuses an admin can move a payment to when correcting the record.
 *
 * REFUNDED is in the list because it is a real status, but the page offers it
 * through its own confirmed button — moving money back deserves the extra
 * step that the others do not.
 */
const CORRECTABLE_STATUSES = [
  { value: "PENDING" as const, label: "Pending", icon: Clock },
  { value: "COMPLETED" as const, label: "Completed", icon: CheckCircle2 },
  { value: "FAILED" as const, label: "Failed", icon: XCircle },
  { value: "REFUNDED" as const, label: "Refunded", icon: RefreshCw },
];

/** What the settle buttons on a pending payment already cover. */
const quickActionStatuses = new Set<PaymentStatus>(["COMPLETED", "FAILED"]);

function statusBadgeVariant(status: PaymentStatus) {
  switch (status) {
    case "COMPLETED":
      return "success" as const;
    case "PENDING":
      return "warning" as const;
    case "FAILED":
    case "REFUNDED":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

export default function PaymentDetailPage() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const navigate = useAppNavigate();
  const { currentTenantId, user } = useAuthStore();
  const { can } = usePermissions();
  const { format: formatPhone } = usePhoneDisplay();
  const isAdmin = can(Permission.PAYMENTS_UPDATE);
  // Settling a pending payment is desk work a coach does; editing, refunding,
  // and deleting stay with the people who keep the books.
  const canSettle = isAdmin || can(Permission.PAYMENTS_SETTLE);
  const canRecordPayment = can(Permission.PAYMENTS_CREATE);

  const paymentQuery = usePayment(paymentId);
  // What it took to collect this one: the pushes the cron sent and the
  // WhatsApp messages the desk sent, all claimed by this payment when it landed.
  const remindersQuery = usePaymentReminders(paymentId);
  const reminders = remindersQuery.data ?? [];

  /**
   * The payments either side of this one, read from the ledger cache so a
   * swipe costs no request. Ordered newest first, the way the list shows them.
   */
  const siblings = useAdjacentRecord<Payment>({
    queryKey: [...queryKeys.payments.list(currentTenantId ?? "none"), "all", 200],
    currentId: paymentId,
    sort: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  });

  const goToSibling = (id: string | null) => {
    // `replace` keeps the back button pointing at the ledger, not at the
    // trail of payments swiped through to get here.
    if (id) navigate(getTenantDashboardPath(`/payments/${id}`), { replace: true });
  };

  const payment = paymentQuery.data ?? null;
  const loading = paymentQuery.isLoading;

  // Every payment mutation invalidates the payments key, so this query and the
  // member's other-payments list below both refresh after a write.
  const updatePayment = useUpdatePayment();
  const updatePaymentStatus = useUpdatePaymentStatus();
  const deletePayment = useDeletePayment();
  const [error, setError] = React.useState("");
  const [updatingStatus, setUpdatingStatus] = React.useState(false);
  const [refundConfirmOpen, setRefundConfirmOpen] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  // Edit mode
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [editForm, setEditForm] = React.useState({
    amount: "",
    description: "",
    note: "",
    validFrom: "",
    validUntil: "",
  });

  const startEditing = () => {
    if (!payment) return;
    setEditForm({
      amount: String(payment.amount),
      description: payment.description ?? "",
      note: payment.note ?? "",
      validFrom: payment.validFrom ? payment.validFrom.slice(0, 10) : "",
      validUntil: payment.validUntil ? payment.validUntil.slice(0, 10) : "",
    });
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setError("");
  };

  const handleSave = async () => {
    if (!currentTenantId || !paymentId) return;
    const nextAmount = Number(editForm.amount);
    if (!Number.isInteger(nextAmount) || nextAmount <= 0) {
      setError("Amount must be a positive whole number.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updatePayment.mutateAsync({
        paymentId,
        data: {
          amount: nextAmount,
          description: editForm.description || undefined,
          note: editForm.note || null,
          validFrom: editForm.validFrom || null,
          validUntil: editForm.validUntil || null,
        },
      });
      setEditing(false);
    } catch (err: unknown) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  };

  // This member's other receipts. The query only runs once the payment has
  // loaded and told us which member it belongs to.
  const memberPaymentsQuery = usePayments(
    { membershipId: payment?.member?.id, limit: 20 },
    { enabled: Boolean(payment?.member?.id) },
  );

  const memberPayments = React.useMemo<Payment[]>(
    () =>
      (memberPaymentsQuery.data?.data.payments ?? []).filter(
        (candidate) => candidate.id !== payment?.id,
      ),
    [memberPaymentsQuery.data, payment?.id],
  );
  const memberPaymentsLoading = memberPaymentsQuery.isLoading;

  const handleStatusUpdate = async (status: PaymentStatus) => {
    if (!currentTenantId || !paymentId) return;

    setUpdatingStatus(true);
    setError("");
    try {
      await updatePaymentStatus.mutateAsync({ paymentId, status });
    } catch (err: unknown) {
      setError(getApiError(err));
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDelete = async () => {
    if (!currentTenantId || !paymentId) return;

    setDeleting(true);
    setError("");
    try {
      await deletePayment.mutateAsync(paymentId);
      navigate("/payments", { replace: true });
    } catch (err: unknown) {
      setError(getApiError(err));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <DetailPageSkeleton />;

  if (!payment) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <Button variant="outline" onClick={() => navigate("/payments")}>
          Back to Payments
        </Button>
        <EmptyState
          icon={CreditCard}
          title="Payment not found"
          description={error || "The payment record could not be loaded."}
        />
      </div>
    );
  }

  const title = payment.subscription?.title ?? payment.description ?? "Payment";
  const collectedByTarget =
    payment.collectedBy?.userId === user?.id
      ? "/profile"
      : payment.collectedBy
        ? `/members/${payment.collectedBy.id}`
        : null;

  /** The colour the amount is printed in: what happened to this money. */
  const amountColor =
    payment.status === "COMPLETED"
      ? "text-emerald-600 dark:text-emerald-400"
      : payment.status === "PENDING"
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground line-through";

  /**
   * The corrections an admin can make that nothing else on the page offers.
   *
   * A row marked failed against the wrong member, or completed by a mis-click,
   * has to be correctable — and before this there was no action at all on a
   * failed payment. Refund keeps its own confirmed button, and on a pending
   * payment the two settle buttons already cover completed and failed.
   */
  const corrections = CORRECTABLE_STATUSES.filter(
    (option) =>
      option.value !== payment.status &&
      option.value !== "REFUNDED" &&
      !(payment.status === "PENDING" && quickActionStatuses.has(option.value)),
  );

  /** The facts under the amount, each only shown when there is one. */
  const facts: { label: string; value: React.ReactNode }[] = [
    ...(payment.paidAt ? [{ label: "Paid at", value: formatDateTime(payment.paidAt) }] : []),
    { label: "Recorded", value: formatDateTime(payment.createdAt) },
    ...(payment.validFrom || payment.validUntil
      ? [
          {
            label: "Covers",
            value: `${payment.validFrom ? formatDate(payment.validFrom) : "—"} → ${
              payment.validUntil ? formatDate(payment.validUntil) : "—"
            }`,
          },
        ]
      : []),
    ...(payment.subscription?.durationDays
      ? [{ label: "Duration", value: `${payment.subscription.durationDays} days` }]
      : []),
    ...(payment.gateway
      ? [{ label: "Paid by", value: payment.gateway === "RAZORPAY" ? "Online" : payment.gateway }]
      : [{ label: "Paid by", value: "At the desk" }]),
    ...(payment.note ? [{ label: "Note", value: payment.note }] : []),
  ];

  return (
    <SwipePane
      paneKey={paymentId ?? "payment"}
      paneIndex={siblings.index}
      onNext={() => goToSibling(siblings.nextId)}
      onPrevious={() => goToSibling(siblings.previousId)}
      // Full-bleed on a phone, for the same reason as the member page: this
      // screen is nothing but cards, each already padded inside.
      className="-mx-3 space-y-3 sm:mx-0 sm:space-y-5"
    >
      <ConfirmDialog
        open={refundConfirmOpen}
        onOpenChange={setRefundConfirmOpen}
        title="Refund payment?"
        description={`This will mark the payment of ${formatCurrency(payment.amount)} as refunded. This action cannot be undone.`}
        confirmLabel="Refund"
        onConfirm={() => handleStatusUpdate("REFUNDED")}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete payment?"
        description={`This will permanently delete the payment of ${formatCurrency(payment.amount)}. This action cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
      />

      {error && (
        <p className="mx-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:mx-0">
          {error}
        </p>
      )}

      {/* ── The money ────────────────────────────────────────────────────────
          A receipt's first fact is the amount. It used to be the fourth row of
          a label/value list inside a card, in the same type as "Note", while
          the top of the page went to a title and a row of six small buttons. */}
      <Card className="overflow-hidden py-0">
        <div className="flex items-start justify-between gap-3 px-4 pt-5 pb-4 sm:px-6">
          <div className="min-w-0">
            <p className={cn("text-3xl font-bold tabular-nums sm:text-4xl", amountColor)}>
              {formatCurrency(payment.amount)}
            </p>
            <p className="mt-1 truncate text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">
              {payment.paidAt ? formatDateTime(payment.paidAt) : formatDateTime(payment.createdAt)}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Badge variant={statusBadgeVariant(payment.status)}>
              {statusLabel[payment.status]}
            </Badge>

            {/* Correcting, refunding and deleting a payment are rare and none
                of them is reversible. They live behind one control rather than
                as four look-alike buttons beside the ones used every day. */}
            {isAdmin && !editing && (
              <Menu>
                <MenuTrigger
                  className="flex size-9 items-center justify-center rounded-md border bg-background transition-colors hover:bg-accent"
                  aria-label="More actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </MenuTrigger>
                <MenuContent align="end">
                  <MenuItem onClick={startEditing}>
                    <Pencil className="h-4 w-4" />
                    Edit details
                  </MenuItem>
                  {corrections.map((option) => (
                    <MenuItem
                      key={option.value}
                      onClick={() => handleStatusUpdate(option.value)}
                      disabled={updatingStatus}
                    >
                      <option.icon className="h-4 w-4" />
                      Mark {option.label.toLowerCase()}
                    </MenuItem>
                  ))}
                  {payment.status === "COMPLETED" && (
                    <MenuItem onClick={() => setRefundConfirmOpen(true)} disabled={updatingStatus}>
                      <RefreshCw className="h-4 w-4" />
                      Refund
                    </MenuItem>
                  )}
                  <MenuSeparator />
                  <MenuItem
                    onClick={() => setDeleteConfirmOpen(true)}
                    disabled={deleting}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </MenuItem>
                </MenuContent>
              </Menu>
            )}
          </div>
        </div>

        {/* Who paid it. The member is the second question about a receipt and
            was previously below the fold, under the dates. */}
        {payment.member ? (
          <button
            type="button"
            onClick={() => navigate(`/members/${payment.member!.id}`)}
            className="flex w-full items-center gap-3 border-t px-4 py-3 text-left transition-colors hover:bg-muted/50 sm:px-6"
          >
            <AvatarCard
              name={payment.member.name}
              avatarUrl={payment.member.avatarUrl}
              gender={payment.member.gender}
              memberId={payment.member.memberId}
              variant="sm"
              dueDate={payment.member.dueDate}
              isActive={payment.member.status ? payment.member.status === "ACTIVE" : undefined}
            >
              <p className="truncate text-xs text-muted-foreground">
                {[payment.member.email, formatPhone(payment.member.phone, payment.member.userId)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </AvatarCard>
          </button>
        ) : (
          <div className="flex items-center gap-2 border-t px-4 py-3 text-sm text-muted-foreground sm:px-6">
            <User className="h-4 w-4" />
            Member unavailable
          </div>
        )}

        {/* Settling is the one thing this page exists to do while a payment is
            pending, so it is a full-width pair of buttons rather than two of
            the six small ones it used to share a row with. */}
        {canSettle && !editing && payment.status === "PENDING" && (
          <div className="grid grid-cols-2 gap-2 border-t p-3 sm:px-6">
            <Button onClick={() => handleStatusUpdate("COMPLETED")} disabled={updatingStatus}>
              <CheckCircle2 className="h-4 w-4" />
              Mark completed
            </Button>
            <Button
              variant="outline"
              onClick={() => handleStatusUpdate("FAILED")}
              disabled={updatingStatus}
            >
              <XCircle className="h-4 w-4" />
              Didn't arrive
            </Button>
          </div>
        )}
      </Card>

      {/* ── The record ─────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          {editing ? (
            /* Editing is a form, not a table with inputs squeezed into its
               right-hand column. Full-width fields, labels above them, and the
               two buttons at the end where a form's buttons belong. */
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="payment-amount">Amount (₹)</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  step="1"
                  min="1"
                  value={editForm.amount}
                  onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>

              {!payment.subscription && (
                <div className="space-y-1.5">
                  <Label htmlFor="payment-description">Description</Label>
                  <Input
                    id="payment-description"
                    value={editForm.description}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    maxLength={200}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="payment-valid-from">Valid from</Label>
                  <Input
                    id="payment-valid-from"
                    type="date"
                    value={editForm.validFrom}
                    onChange={(e) => setEditForm((f) => ({ ...f, validFrom: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="payment-valid-until">Valid until</Label>
                  <Input
                    id="payment-valid-until"
                    type="date"
                    value={editForm.validUntil}
                    onChange={(e) => setEditForm((f) => ({ ...f, validUntil: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="payment-note">Note</Label>
                <Input
                  id="payment-note"
                  value={editForm.note}
                  onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
                  maxLength={500}
                  placeholder="Optional"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={cancelEditing} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {facts.map((fact) => (
                <div key={fact.label} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                  <dd className="text-sm font-medium break-words">{fact.value}</dd>
                </div>
              ))}

              {payment.collectedBy && (
                <div className="min-w-0 sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Collected by</dt>
                  <dd>
                    <button
                      type="button"
                      className="-mx-2 mt-1 w-full rounded-lg px-2 text-left transition-colors hover:bg-muted/50"
                      onClick={() => collectedByTarget && navigate(collectedByTarget)}
                    >
                      <AvatarCard
                        name={payment.collectedBy.name}
                        avatarUrl={payment.collectedBy.avatarUrl}
                        gender={payment.collectedBy.gender}
                        variant="sm"
                      >
                        <p className="truncate text-xs text-muted-foreground">
                          {payment.collectedBy.email}
                        </p>
                      </AvatarCard>
                    </button>
                  </dd>
                </div>
              )}
            </dl>
          )}
        </CardContent>
      </Card>

      {/* The chase behind this payment, when there was one. */}
      {reminders.length > 0 && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <p className="text-sm font-medium">
              Collected after {reminders.length} {reminders.length === 1 ? "reminder" : "reminders"}
            </p>
            <div className="mt-3 space-y-2">
              {reminders.map((reminder) => (
                <div key={reminder.id} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p>
                      {REMINDER_REASON_LABELS[reminder.reason] ?? reminder.reason}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {reminder.channel === "WHATSAPP"
                          ? reminder.actor
                            ? `WhatsApp · ${reminder.actor.user.name}`
                            : "WhatsApp"
                          : "Push"}
                      </span>
                    </p>
                    {reminder.message && (
                      <p className="truncate text-xs text-muted-foreground">{reminder.message}</p>
                    )}
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {formatDateTime(reminder.sentAt)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── This member's other receipts ───────────────────────────────────── */}
      {payment.member && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-1.5">
                <Receipt className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-semibold">
                  Other payments by {payment.member.name.split(" ")[0]}
                </span>
              </div>
              {canRecordPayment && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/payments/record/${payment.member!.id}`)}
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              )}
            </div>

            {memberPaymentsLoading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
            ) : memberPayments.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No other payments found
              </p>
            ) : (
              <div className="divide-y">
                {memberPayments.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="-mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/50"
                    onClick={() => navigate(`/payments/${p.id}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {p.subscription?.title ?? p.description ?? "-"}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={statusBadgeVariant(p.status)} className="text-xs">
                        {statusLabel[p.status]}
                      </Badge>
                      <span className="text-sm font-semibold tabular-nums">
                        {formatCurrency(p.amount)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </SwipePane>
  );
}
