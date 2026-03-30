import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { paymentsApi } from "@/api/payments";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { downloadCsv } from "@/lib/csv";
import { formatCurrency, formatDate } from "@/lib/utils";
import { appendUniqueById, useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { Plus, CreditCard, CheckCircle2, XCircle, Download, Search, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Payment, PaymentStatus } from "@/types/api";
import AvatarCard from "@/components/ui/avatarCard";
import { usePendingMutations } from "@/lib/use-pending-mutations";
import { Clock } from "lucide-react";

export default function PaymentsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentTenantId, tenantRole, user } = useAuthStore();
  const role = tenantRole();
  const isAdmin = role === "ADMIN";
  const canViewAllPayments = role === "ADMIN" || role === "COACH";

  const [payments, setPayments] = React.useState<Payment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
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

  const fetchPayments = React.useCallback(
    async (nextPage: number, mode: "replace" | "append") => {
      if (!currentTenantId) return;
      if (mode === "replace") {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      try {
        if (canViewAllPayments) {
          const res = await paymentsApi.list(
            currentTenantId,
            nextPage,
            20,
            statusFilter || undefined,
            searchTerm || undefined,
          );
          const nextPayments = res.data.data.payments;
          setPayments((prev) =>
            mode === "replace" ? nextPayments : appendUniqueById(prev, nextPayments),
          );
          const totalPages = res.data.meta.totalPages;
          setHasMore(nextPage < totalPages);
          setPage(nextPage);
        } else {
          const res = await paymentsApi.myPayments(currentTenantId);
          setPayments(res.data.data.payments);
          setHasMore(false);
          setPage(1);
        }
      } catch {
        //
      } finally {
        if (mode === "replace") {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [currentTenantId, canViewAllPayments, statusFilter, searchTerm],
  );

  React.useEffect(() => {
    if (!currentTenantId) return;
    setPayments([]);
    setHasMore(true);
    void fetchPayments(1, "replace");
  }, [currentTenantId, canViewAllPayments, statusFilter, searchTerm, fetchPayments]);

  const loadMore = React.useCallback(() => {
    if (!canViewAllPayments || loading || loadingMore || !hasMore) return;
    void fetchPayments(page + 1, "append");
  }, [canViewAllPayments, loading, loadingMore, hasMore, page, fetchPayments]);

  const loadMoreRef = useInfiniteScroll({
    hasMore: canViewAllPayments && hasMore,
    loading: loading || loadingMore,
    onLoadMore: loadMore,
  });

  // Pending offline payments
  const pendingPayments = usePendingMutations("/payments");
  const pendingPaymentItems: (Payment & { _pending: true })[] = pendingPayments.map((p) => ({
    id: `pending-${p.id}`,
    amount: (p.body?.amount as number) ?? 0,
    status: "PENDING" as const,
    paidAt: null,
    validFrom: null,
    validUntil: (p.body?.validUntil as string) ?? null,
    description: (p.body?._subscriptionTitle as string) ?? (p.body?.note as string) ?? null,
    note: (p.body?.note as string) ?? null,
    createdAt: new Date(p.createdAt).toISOString(),
    member: p.body?._memberName
      ? {
          id: "pending",
          memberId: (p.body._memberMemberId as number) ?? 0,
          userId: "",
          name: p.body._memberName as string,
          email: "",
          avatarUrl: (p.body._memberAvatarUrl as string) ?? null,
        }
      : undefined,
    subscription: p.body?._subscriptionTitle
      ? { id: "pending", title: p.body._subscriptionTitle as string }
      : undefined,
    _pending: true as const,
  }));

  // Merge and sort latest first
  const allPayments = [...pendingPaymentItems, ...payments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const handleStatusUpdate = async (
    paymentId: string,
    status: "COMPLETED" | "FAILED" | "REFUNDED",
  ) => {
    if (!currentTenantId) return;
    try {
      await paymentsApi.updateStatus(currentTenantId, paymentId, status);
      fetchPayments(1, "replace");
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

  const statusBadgeVariant = (status: PaymentStatus) => {
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
          {(isAdmin || role === "COACH") && (
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
              placeholder="Search by name, phone, email, or admission no..."
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
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
            }}
            className="w-full sm:w-40"
          >
            <option value="">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
            <option value="REFUNDED">Refunded</option>
          </Select>
        </div>
      )}

      {loading ? (
        <PageLoader />
      ) : allPayments.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No payments found"
          description={canViewAllPayments ? "Record the first payment." : "No payment history yet."}
        />
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
            {allPayments.map((p) => (
              <Card
                onClick={() => !(p as any)._pending && navigate(`/payments/${p.id}`)}
                key={p.id}
                className={`hover:shadow-md transition-shadow${(p as any)._pending ? " opacity-70 border-dashed" : ""}`}
              >
                <div className="flex sm:justify-start justify-between sm:items-start p-2 sm:p-4 sm:flex-row flex-col">
                  {/* Payment Info */}
                  <div className="flex gap-4 flex-1 min-w-0">
                    {canViewAllPayments && p.member && (
                      <AvatarCard
                        name={p.member.name}
                        avatarUrl={p.member.avatarUrl}
                        memberId={p.member.memberId}
                        variant="md"
                      >
                        <p className="text-sm text-muted-foreground flex flex-wrap gap-x-1">
                          <span>{p.subscription?.title ?? p.description ?? "—"}</span>
                          {p.collectedBy && (
                            <span className="text-xs font-medium text-foreground/70">
                              · {p.collectedBy.userId === user?.id ? "You" : p.collectedBy.name}
                            </span>
                          )}
                        </p>
                      </AvatarCard>
                    )}
                    {!canViewAllPayments && (
                      <div className="flex-1">
                        <p className="font-semibold">
                          {p.subscription?.title ?? p.description ?? "—"}
                        </p>
                        <p className="text-sm text-muted-foreground">{formatCurrency(p.amount)}</p>
                      </div>
                    )}
                  </div>

                  {/* Amount and Status */}
                  <div className="flex gap-3 items-start sm:items-center mt-3 sm:mt-0">
                    <div className="text-right">
                      <p className="text-lg font-semibold">{formatCurrency(p.amount)}</p>
                      {p.validUntil ? (
                        <p className="text-xs font-medium text-foreground/70">
                          {formatDate(p.validUntil)}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</p>
                      )}
                    </div>
                    <Badge variant={statusBadgeVariant(p.status)}>{p.status}</Badge>
                  </div>

                  {/* Pending sync indicator */}
                  {(p as any)._pending && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2 sm:mt-0 sm:mr-2">
                      <Clock className="h-3 w-3" />
                      Pending sync
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 shrink-0 justify-end mt-3 sm:mt-0 w-full sm:w-auto">
                    {isAdmin && !(p as any)._pending && (
                      <>
                        {p.status === "PENDING" && (
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
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {canViewAllPayments && allPayments.length > 0 && (hasMore || loadingMore) && (
            <div
              ref={loadMoreRef}
              className="flex items-center justify-center py-4 text-sm text-muted-foreground"
            >
              {loadingMore ? (
                <div className="flex items-center gap-2">
                  <Spinner size="sm" />
                  Loading more...
                </div>
              ) : (
                "Scroll to load more"
              )}
            </div>
          )}
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
