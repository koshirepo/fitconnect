import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useSearchParams } from "react-router-dom";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import { paymentsApi } from "@/api/payments";
import { useAllPayments, useMyPayments, useUpdatePaymentStatus } from "@/api/queries/payments";
import { Button } from "@/components/ui/button";
import { MemberCard, PersonChip } from "@/components/ui/member-card";
import { PageLoader } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { downloadCsv } from "@/lib/csv";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  Plus,
  CreditCard,
  CheckCircle2,
  XCircle,
  Download,
  Search,
  X,
  Clock,
  Wallet,
  RotateCcw,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Payment, PaymentStatus } from "@/types/api";
import { usePendingMutations } from "@/lib/use-pending-mutations";

type PendingPaymentMutationBody = {
  amount?: number;
  validUntil?: string | null;
  note?: string | null;
  _subscriptionTitle?: string;
  _memberName?: string;
  _memberMemberId?: number;
  _memberAvatarUrl?: string | null;
};

type DisplayPayment = Payment & { _pending?: boolean };

/** Client-side status tabs, mirroring the member list. */
const STATUS_TABS = [
  { value: "", label: "All", icon: Wallet, iconClass: "text-blue-600" },
  { value: "COMPLETED", label: "Completed", icon: CheckCircle2, iconClass: "text-emerald-600" },
  { value: "PENDING", label: "Pending", icon: Clock, iconClass: "text-amber-600" },
  { value: "FAILED", label: "Failed", icon: XCircle, iconClass: "text-red-600" },
  { value: "REFUNDED", label: "Refunded", icon: RotateCcw, iconClass: "text-muted-foreground" },
];

/** Icon and colour for each payment status, keyed the same way the tabs are. */
const STATUS_CHIP: Record<PaymentStatus, { icon: React.ElementType; className: string }> = {
  COMPLETED: {
    icon: CheckCircle2,
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  PENDING: { icon: Clock, className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  FAILED: { icon: XCircle, className: "bg-red-500/10 text-red-600 dark:text-red-400" },
  REFUNDED: { icon: RotateCcw, className: "" },
};

function PaymentStatusChip({ status }: { status: PaymentStatus }) {
  const chip = STATUS_CHIP[status] ?? STATUS_CHIP.PENDING;
  return (
    <PersonChip icon={chip.icon} className={chip.className}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </PersonChip>
  );
}

export default function PaymentsPage() {
  const navigate = useAppNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentTenantId, user } = useAuthStore();
  const { can } = usePermissions();
  // Editing, deleting, and exporting payments are the admin-level grants.
  const isAdmin = can(Permission.PAYMENTS_UPDATE);
  const canViewAllPayments = can(Permission.PAYMENTS_READ);
  const canRecordPayment = can(Permission.PAYMENTS_CREATE);

  const [exporting, setExporting] = React.useState(false);
  const [confirmAction, setConfirmAction] = React.useState<{
    paymentId: string;
    status: "COMPLETED" | "FAILED";
    amount: number;
  } | null>(null);

  const statusFilter = searchParams.get("status") ?? "";
  const searchTerm = searchParams.get("search") ?? "";

  const setStatusFilter = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set("status", value);
      else next.delete("status");
      next.delete("page");
      return next;
    });
  };

  const setSearchTerm = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set("search", value);
      else next.delete("search");
      next.delete("page");
      return next;
    });
  };

  // The whole ledger is fetched once and filtered in the browser, the way the
  // member list works: one cached result serves every tab, so switching tabs
  // and typing in the search box cost nothing.
  const allPaymentsQuery = useAllPayments({ enabled: canViewAllPayments });
  const myPaymentsQuery = useMyPayments({ enabled: !canViewAllPayments });

  const payments = React.useMemo<Payment[]>(
    () => (canViewAllPayments ? (allPaymentsQuery.data ?? []) : (myPaymentsQuery.data ?? [])),
    [canViewAllPayments, allPaymentsQuery.data, myPaymentsQuery.data],
  );

  const loading = (canViewAllPayments ? allPaymentsQuery : myPaymentsQuery).isLoading;

  const updatePaymentStatus = useUpdatePaymentStatus();

  // Pending offline payments
  const pendingPayments = usePendingMutations<PendingPaymentMutationBody>("/payments");
  const pendingPaymentItems: DisplayPayment[] = React.useMemo(
    () =>
      pendingPayments.map((p) => ({
        id: `pending-${p.id}`,
        amount: p.body?.amount ?? 0,
        status: "PENDING" as const,
        paidAt: null,
        validFrom: null,
        validUntil: p.body?.validUntil ?? null,
        description: p.body?._subscriptionTitle ?? p.body?.note ?? null,
        note: p.body?.note ?? null,
        createdAt: new Date(p.createdAt).toISOString(),
        member: p.body?._memberName
          ? {
              id: "pending",
              memberId: p.body._memberMemberId ?? 0,
              userId: "",
              name: p.body._memberName,
              email: "",
              avatarUrl: p.body._memberAvatarUrl ?? null,
            }
          : undefined,
        subscription: p.body?._subscriptionTitle
          ? { id: "pending", title: p.body._subscriptionTitle }
          : undefined,
        _pending: true as const,
      })),
    [pendingPayments],
  );

  // Merge offline-queued rows in, apply the search, and sort latest first — all
  // in the browser, over the full ledger. The status tabs filter this list
  // rather than the raw one, so the tab counts always match what a click shows.
  const searchedPayments: DisplayPayment[] = React.useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return [...pendingPaymentItems, ...payments]
      .filter((p) => {
        if (!term) return true;

        const haystack = [
          p.member?.name,
          p.member?.email,
          p.member?.memberId,
          p.subscription?.title,
          p.description,
          p.note,
          p.amount,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(term);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [pendingPaymentItems, payments, searchTerm]);

  const allPayments: DisplayPayment[] = React.useMemo(
    () =>
      statusFilter ? searchedPayments.filter((p) => p.status === statusFilter) : searchedPayments,
    [searchedPayments, statusFilter],
  );

  /** Row count behind each tab, so a tab shows what clicking it will reveal. */
  const statusCounts = React.useMemo(() => {
    const counts: Record<string, number> = { "": searchedPayments.length };
    for (const p of searchedPayments) {
      counts[p.status] = (counts[p.status] ?? 0) + 1;
    }
    return counts;
  }, [searchedPayments]);

  const handleStatusUpdate = async (
    paymentId: string,
    status: "COMPLETED" | "FAILED" | "REFUNDED",
  ) => {
    try {
      await updatePaymentStatus.mutateAsync({ paymentId, status });
    } catch {
      //
    }
  };

  const handleExportPayments = async () => {
    if (!currentTenantId || !isAdmin) return;

    setExporting(true);
    try {
      let exportPage = 1;
      let totalExportPages = 1;
      const allPayments: Payment[] = [];

      do {
        const res = await paymentsApi.list(currentTenantId, exportPage, 100);
        allPayments.push(...res.data.data.payments);
        totalExportPages = res.data.meta.totalPages;
        exportPage += 1;
      } while (exportPage <= totalExportPages);

      const rows = allPayments.map((payment) => ({
        PaymentId: payment.id,
        MemberName: payment.member?.name ?? "",
        MemberEmail: payment.member?.email ?? "",
        Subscription: payment.subscription?.title ?? payment.description ?? "",
        Amount: payment.amount,
        Status: payment.status,
        CreatedAt: payment.createdAt,
        PaidAt: payment.paidAt ?? "",
        ValidFrom: payment.validFrom ?? "",
        ValidUntil: payment.validUntil ?? "",
      }));

      downloadCsv(
        `payments-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          "PaymentId",
          "MemberName",
          "MemberEmail",
          "Subscription",
          "Amount",
          "Status",
          "CreatedAt",
          "PaidAt",
          "ValidFrom",
          "ValidUntil",
        ],
        rows,
      );
    } catch {
      // silent
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground">
            {canViewAllPayments ? "Track all tenant payments" : "Your payment history"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={handleExportPayments} disabled={exporting}>
              <Download className="h-4 w-4" />
            </Button>
          )}
          {canRecordPayment && (
            <Button onClick={() => navigate("/payments/record")}>
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Filters - admin and coaches */}
      {canViewAllPayments && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, email, admission no, plan, or amount..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
              }}
              className="w-full pl-10 pr-10 py-2 border border-input rounded-md bg-background text-sm"
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm("");
                }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Status Filter Tabs */}
      {canViewAllPayments && (
        <div className="overflow-x-auto overflow-y-hidden border-b border-border [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max gap-6 sm:gap-8">
            {STATUS_TABS.map((tab) => {
              const active = statusFilter === tab.value;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.value}
                  onClick={() => {
                    setStatusFilter(tab.value);
                  }}
                  className={cn(
                    "flex items-center gap-2 border-b-2 pt-1 pb-3 text-sm transition-colors",
                    active
                      ? "border-foreground font-semibold text-foreground"
                      : "border-transparent font-medium text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn("h-4 w-4", active ? tab.iconClass : "text-muted-foreground")}
                  />
                  {tab.label}
                  <span className="text-xs text-muted-foreground">
                    ({statusCounts[tab.value] ?? 0})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <PageLoader />
      ) : allPayments.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No payments found"
          description={
            statusFilter || searchTerm
              ? "No payments match this filter."
              : canViewAllPayments
                ? "Record the first payment."
                : "No payment history yet."
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
            {allPayments.map((p) => (
              <MemberCard
                key={p.id}
                size="md"
                // A member viewing their own history has no other person to
                // name, so the plan title stands in as the identity line.
                person={
                  canViewAllPayments && p.member
                    ? p.member
                    : { name: p.subscription?.title ?? p.description ?? "Payment" }
                }
                onClick={p._pending ? undefined : () => navigate(`/payments/${p.id}`)}
                // This page is about the payment, not the membership, so the
                // payment's status takes the chip slot the member list gives to
                // Active/Until. The tile's coloured edge still reads membership.
                showStatusChips={false}
                chips={
                  <>
                    <PaymentStatusChip status={p.status} />
                    {p._pending && (
                      <PersonChip
                        icon={Clock}
                        className="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      >
                        Pending sync
                      </PersonChip>
                    )}
                  </>
                }
                subtitle={
                  <>
                    {/* The plan already names a self-view row, so it only
                        repeats itself here; staff rows lead with it. */}
                    {canViewAllPayments && p.member && (
                      <>
                        {p.subscription?.title ?? p.description ?? "—"}
                        {p.collectedBy && (
                          <span className="font-medium text-foreground/70">
                            {" · "}
                            {p.collectedBy.userId === user?.id ? "You" : p.collectedBy.name}
                          </span>
                        )}
                        {" · "}
                      </>
                    )}
                    <span className="text-muted-foreground">
                      {formatDate(p.validUntil ?? p.createdAt)}
                    </span>
                  </>
                }
                actions={
                  <>
                    <p className="text-base font-semibold sm:text-lg">{formatCurrency(p.amount)}</p>
                    {isAdmin && !p._pending && p.status === "PENDING" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmAction({
                              paymentId: p.id,
                              status: "COMPLETED",
                              amount: p.amount,
                            });
                          }}
                          title="Approve payment"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmAction({
                              paymentId: p.id,
                              status: "FAILED",
                              amount: p.amount,
                            });
                          }}
                          title="Reject payment"
                        >
                          <XCircle className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </>
                }
                className={cn(p._pending && "border-dashed opacity-70")}
              />
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={confirmAction?.status === "COMPLETED" ? "Approve payment?" : "Reject payment?"}
        description={
          confirmAction?.status === "COMPLETED"
            ? `Mark payment of ${formatCurrency(confirmAction.amount)} as completed?`
            : `Mark payment of ${formatCurrency(confirmAction?.amount ?? 0)} as failed? This cannot be undone.`
        }
        confirmLabel={confirmAction?.status === "COMPLETED" ? "Approve" : "Reject"}
        onConfirm={() => {
          if (confirmAction) {
            handleStatusUpdate(confirmAction.paymentId, confirmAction.status);
          }
        }}
      />
    </div>
  );
}
