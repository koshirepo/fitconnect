import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useSearchParams } from "react-router-dom";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import { paymentsApi } from "@/api/payments";
import { getApiError } from "@/api/client";
import { useAllPayments, useMyPayments, useUpdatePaymentStatus } from "@/api/queries/payments";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { MemberCard, PersonChip } from "@/components/ui/member-card";
import { PaymentStatusChip } from "@/components/ui/payment-status-chip";
import { SkeletonRow } from "@/components/ui/skeleton";
import { SwipePane } from "@/components/ui/swipe-pane";
import { Spinner } from "@/components/ui/spinner";
import { ListPagination } from "@/components/ui/list-pagination";
import { usePaginatedList } from "@/lib/use-paginated-list";
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
import type { Payment } from "@/types/api";
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

export default function PaymentsPage() {
  const navigate = useAppNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentTenantId, user } = useAuthStore();
  const { can } = usePermissions();
  // Editing, deleting, and exporting payments are the admin-level grants.
  const isAdmin = can(Permission.PAYMENTS_UPDATE);
  // Approving or rejecting what is still owed is desk work, so a coach gets
  // those two buttons without the rest of the admin toolkit.
  const canSettle = isAdmin || can(Permission.PAYMENTS_SETTLE);
  const canViewAllPayments = can(Permission.PAYMENTS_READ);
  const canRecordPayment = can(Permission.PAYMENTS_CREATE);

  const [exporting, setExporting] = React.useState(false);
  const toast = useToast();

  const [confirmAction, setConfirmAction] = React.useState<{
    paymentId: string;
    status: "COMPLETED" | "FAILED";
    amount: number;
  } | null>(null);

  const statusFilter = searchParams.get("status") ?? "";
  const searchTerm = searchParams.get("search") ?? "";

  // Local box, URL 300ms behind it. Every keystroke used to re-filter the whole
  // ledger and push a history entry, so backspacing walked back through the
  // typing rather than clearing the field.
  const [searchInput, setSearchInput] = React.useState(searchTerm);
  const searchTimer = React.useRef<number | undefined>(undefined);

  React.useEffect(() => () => window.clearTimeout(searchTimer.current), []);

  // Swiping walks the same tab strip the taps use.
  const statusTabIndex = Math.max(
    STATUS_TABS.findIndex((tab) => tab.value === statusFilter),
    0,
  );

  const setStatusFilter = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set("status", value);
      else next.delete("status");
      next.delete("page");
      return next;
    });
  };

  const goToTab = (offset: number) => {
    const next = STATUS_TABS[statusTabIndex + offset];
    if (next) setStatusFilter(next.value);
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

  /** Type into the box now, filter 300ms after the typing stops. */
  const onSearchChange = (value: string) => {
    setSearchInput(value);
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => setSearchTerm(value), 300);
  };

  const clearSearch = () => {
    window.clearTimeout(searchTimer.current);
    setSearchInput("");
    setSearchTerm("");
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

  // `isPending`, not `isLoading`: both queries are gated on the tenant id, and a
  // disabled query reports `isLoading: false` with no data — so this screen
  // painted "No payments found" before the first fetch had even started, which
  // is what a phone resolving its subdomain slowly showed every time. Guarded
  // by the tenant id, because a query that never runs stays pending forever.
  const activeQuery = canViewAllPayments ? allPaymentsQuery : myPaymentsQuery;
  const loading =
    Boolean(currentTenantId) &&
    (activeQuery.isPending || (activeQuery.isFetching && payments.length === 0));

  // A warm cache paints instantly and then refetches in the background. Without
  // this the screen looks idle while it is anything but.
  const refreshing = !loading && activeQuery.isFetching;

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

  // The ledger stays whole in memory so the tabs, the search, and offline reads
  // stay instant; only a page of it reaches the DOM. Payments are the list that
  // grows without bound, so this is the one that needed it most.
  const {
    page,
    setPage,
    pageItems: visiblePayments,
    totalPages,
    total: totalPayments,
    rangeStart,
    rangeEnd,
  } = usePaginatedList(allPayments, {
    pageSize: 25,
    resetKey: `${statusFilter}|${searchTerm}`,
  });

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
      toast.success(
        status === "COMPLETED" ? "Payment approved." : "Payment marked failed.",
      );
    } catch (caught) {
      // This used to be swallowed, so an approval that failed looked exactly
      // like one that worked.
      toast.error({
        message: "Could not update the payment.",
        description: getApiError(caught),
      });
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
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-10 py-2 border border-input rounded-md bg-background text-sm"
            />
            {searchInput && (
              <button
                onClick={clearSearch}
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

      {refreshing && (
        <p
          role="status"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          {/* The live region is this line, not the icon: the spinner carries a
              "Loading" label of its own that would be announced twice. */}
          <Spinner aria-hidden className="size-3" />
          Refreshing payments…
        </p>
      )}

      <SwipePane
        paneKey={statusFilter}
        paneIndex={statusTabIndex}
        enabled={canViewAllPayments}
        onNext={() => goToTab(1)}
        onPrevious={() => goToTab(-1)}
      >
      {loading ? (
        <div className="space-y-3">
          {[0,1,2,3,4].map((i) => (
            <div key={i} className="rounded-lg ring-1 ring-foreground/10"><SkeletonRow className="p-3" /></div>
          ))}
        </div>
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
            {visiblePayments.map((p) => (
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
                    {canSettle && !p._pending && p.status === "PENDING" && (
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

          <ListPagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            total={totalPayments}
            label="payments"
          />
        </div>
      )}
      </SwipePane>

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
