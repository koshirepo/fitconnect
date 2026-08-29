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
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DetailPageSkeleton } from "@/components/ui/skeleton";
import { SwipePane } from "@/components/ui/swipe-pane";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import {
  Calendar,
  CheckCircle2,
  CreditCard,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Trash2,
  User,
  XCircle,
} from "lucide-react";
import type { Payment, PaymentStatus } from "@/types/api";
import AvatarCard from "@/components/ui/avatarCard";

const statusLabel: Record<PaymentStatus, string> = {
  PENDING: "Pending",
  COMPLETED: "Completed",
  FAILED: "Failed",
  REFUNDED: "Refunded",
};

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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm text-right">{children}</span>
    </div>
  );
}

export default function PaymentDetailPage() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const navigate = useAppNavigate();
  const { currentTenantId, user } = useAuthStore();
  const { can } = usePermissions();
  const isAdmin = can(Permission.PAYMENTS_UPDATE);
  // Settling a pending payment is desk work a coach does; editing, refunding,
  // and deleting stay with the people who keep the books.
  const canSettle = isAdmin || can(Permission.PAYMENTS_SETTLE);
  const canRecordPayment = can(Permission.PAYMENTS_CREATE);

  const paymentQuery = usePayment(paymentId);

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

  const handleStatusUpdate = async (status: "COMPLETED" | "FAILED" | "REFUNDED") => {
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
      <div className="space-y-4">
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

  return (
    <SwipePane
      paneKey={paymentId ?? "payment"}
      paneIndex={siblings.index}
      onNext={() => goToSibling(siblings.nextId)}
      onPrevious={() => goToSibling(siblings.previousId)}
      className="space-y-5"
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      {/* Four buttons and a title do not share one row on a phone — the title
          loses and ends up as an ellipsis. They stack instead, and sit side by
          side again once there is width for both. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 sm:flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 truncate text-xl font-bold tracking-tight">{title}</h1>
            <Badge variant={statusBadgeVariant(payment.status)}>
              {statusLabel[payment.status]}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {formatDateTime(payment.createdAt)}
          </p>
        </div>
        {canSettle && (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {isAdmin && !editing && (
              <Button variant="outline" size="sm" onClick={startEditing}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            )}
            {isAdmin && editing && (
              <>
                <Button variant="outline" size="sm" onClick={cancelEditing} disabled={saving}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </>
            )}
            {!editing && payment.status === "PENDING" && (
              <>
                <Button
                  size="sm"
                  onClick={() => handleStatusUpdate("COMPLETED")}
                  disabled={updatingStatus}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Completed
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleStatusUpdate("FAILED")}
                  disabled={updatingStatus}
                >
                  <XCircle className="h-4 w-4" />
                  Failed
                </Button>
              </>
            )}
            {isAdmin && payment.status === "COMPLETED" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRefundConfirmOpen(true)}
                disabled={updatingStatus}
              >
                <RefreshCw className="h-4 w-4" />
                Refund
              </Button>
            )}
            {isAdmin && !editing && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={deleting}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── Action buttons ─────────────────────────────────────────── */}

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
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* ── Main info card ─────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4 divide-y divide-border">
          {/* Payment details */}
          <div className="pb-3">
            <Row label="Amount">
              {editing ? (
                <Input
                  type="number"
                  step="1"
                  min="1"
                  className="w-28 text-right h-8"
                  value={editForm.amount}
                  onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                />
              ) : (
                <span className="font-extrabold text-emerald-400">
                  {formatCurrency(payment.amount)}
                </span>
              )}
            </Row>
            <Row label={payment.subscription ? "Subscription" : "Description"}>
              {editing && !payment.subscription ? (
                <Input
                  className="w-44 text-right h-8"
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  maxLength={200}
                />
              ) : (
                <span>{title}</span>
              )}
            </Row>
            <Row label="Note">
              {editing ? (
                <Input
                  className="w-44 text-right h-8"
                  value={editForm.note}
                  onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
                  maxLength={500}
                  placeholder="Optional"
                />
              ) : (
                <span className="text-right max-w-[60%]">{payment.note || "-"}</span>
              )}
            </Row>
            <Row label="Paid At">{payment.paidAt ? formatDateTime(payment.paidAt) : "-"}</Row>
          </div>

          {/* Validity */}
          {(payment.validFrom || payment.validUntil || payment.subscription?.durationDays) && (
            <div className="pt-3 pb-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Validity
                </span>
              </div>
              <Row label="From">
                {editing ? (
                  <Input
                    type="date"
                    className="w-36 h-8"
                    value={editForm.validFrom}
                    onChange={(e) => setEditForm((f) => ({ ...f, validFrom: e.target.value }))}
                  />
                ) : (
                  <span>{payment.validFrom ? formatDate(payment.validFrom) : "-"}</span>
                )}
              </Row>
              <Row label="Until">
                {editing ? (
                  <Input
                    type="date"
                    className="w-36 h-8"
                    value={editForm.validUntil}
                    onChange={(e) => setEditForm((f) => ({ ...f, validUntil: e.target.value }))}
                  />
                ) : (
                  <span>{payment.validUntil ? formatDate(payment.validUntil) : "-"}</span>
                )}
              </Row>
              {payment.subscription?.durationDays && (
                <Row label="Duration">{payment.subscription.durationDays} days</Row>
              )}
            </div>
          )}

          {/* Member */}
          <div className="pt-3">
            {payment.member ? (
              <div
                className="flex items-center gap-3 cursor-pointer rounded-lg -mx-2 px-2 py-2 hover:bg-muted/50 transition-colors"
                onClick={() => navigate(`/members/${payment.member!.id}`)}
              >
                <AvatarCard
                  name={payment.member.name}
                  avatarUrl={payment.member.avatarUrl}
                  gender={payment.member.gender}
                  memberId={payment.member.memberId}
                  variant="md"
                  dueDate={payment.member.dueDate}
                  isActive={
                    payment.member.status
                      ? payment.member.status === "ACTIVE"
                      : undefined
                  }
                >
                  <p className="text-xs text-muted-foreground">
                    {[payment.member.email, payment.member.phone].filter(Boolean).join(" · ")}
                  </p>
                </AvatarCard>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <User className="h-4 w-4" />
                <span>Member unavailable</span>
              </div>
            )}
          </div>

          {/* Collected by */}
          {payment.collectedBy && (
            <div className="pt-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Collected by
              </span>
              <button
                type="button"
                className="mt-1 w-full rounded-lg text-left transition-colors hover:bg-muted/50"
                onClick={() => {
                  if (collectedByTarget) {
                    navigate(collectedByTarget);
                  }
                }}
              >
                <AvatarCard
                  name={payment.collectedBy.name}
                  avatarUrl={payment.collectedBy.avatarUrl}
                  gender={payment.collectedBy.gender}
                  variant="sm"
                >
                  <p className="text-xs text-muted-foreground">{payment.collectedBy.email}</p>
                </AvatarCard>
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Member's other payments ────────────────────────────────── */}
      {payment.member && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">
                  Other Payments by {payment.member.name.split(" ")[0]}
                </span>
              </div>
              {canRecordPayment && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/payments/record/${payment.member!.id}`)}
                >
                  <Plus className="h-4 w-4" />
                  Add Payment
                </Button>
              )}
            </div>

            {memberPaymentsLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
            ) : memberPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No other payments found
              </p>
            ) : (
              <div className="space-y-1">
                {memberPayments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/payments/${p.id}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {p.subscription?.title ?? p.description ?? "-"}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={statusBadgeVariant(p.status)} className="text-xs">
                        {statusLabel[p.status]}
                      </Badge>
                      <span className="text-sm font-semibold tabular-nums">
                        {formatCurrency(p.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </SwipePane>
  );
}
