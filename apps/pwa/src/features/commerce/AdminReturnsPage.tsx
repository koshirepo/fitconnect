/**
 * Documentation: The returns queue.
 *
 * - Lists return requests across every order, so a decision can be made without
 *   first knowing which order raised it. The per-order view on the order detail
 *   page stays as it is — this is the same actions reached from the other side.
 * - Approving books the reverse pickup and receiving pays the buyer back, which
 *   is why the two remain separate buttons here as they are there.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Permission } from "@fitconnect/shared/types/permissions";
import { usePermissions } from "@/features/auth/permission-gate";
import { useDecideReturn, useReceiveReturn, useReturnsInfinite } from "@/api/queries/platform";
import { flattenPages } from "@/api/queries/shared";
import { getApiError } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ListPageSkeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/utils";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { ArrowLeft, RotateCcw } from "lucide-react";
import type { ReturnRequest } from "@/types/api";

const RETURN_STATUS_COPY: Record<string, string> = {
  REQUESTED: "Awaiting decision",
  APPROVED: "Approved — pickup booked",
  REJECTED: "Rejected",
  PICKED_UP: "Picked up",
  RECEIVED: "Received",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
};

const fmt = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);

export default function AdminReturnsPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canRead = can(Permission.PLATFORM_ORDERS_READ);
  const canDecide = can(Permission.PLATFORM_ORDERS_UPDATE);

  // The queue opens on what still needs a person, which is the only reason to
  // come here; everything else is available from the filter.
  const [statusFilter, setStatusFilter] = React.useState("REQUESTED");
  const [actionError, setActionError] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const returnsQuery = useReturnsInfinite(
    { status: statusFilter || undefined },
    { enabled: canRead },
  );

  const returns = React.useMemo(
    () => flattenPages<ReturnRequest>(returnsQuery.data?.pages),
    [returnsQuery.data],
  );
  const loading = returnsQuery.isPending;
  const loadingMore = returnsQuery.isFetchingNextPage;
  const hasMore = Boolean(returnsQuery.hasNextPage);
  const error = actionError || (returnsQuery.isError ? getApiError(returnsQuery.error) : "");

  const decideReturn = useDecideReturn();
  const receiveReturn = useReceiveReturn();

  const loadMoreRef = useInfiniteScroll({
    hasMore: canRead && hasMore,
    loading: loading || loadingMore,
    onLoadMore: () => {
      if (returnsQuery.hasNextPage && !returnsQuery.isFetchingNextPage) {
        void returnsQuery.fetchNextPage();
      }
    },
  });

  const run = async (entryId: string, action: () => Promise<unknown>) => {
    setBusyId(entryId);
    setActionError("");
    try {
      await action();
    } catch (err: unknown) {
      setActionError(getApiError(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Returns</h1>
          <p className="text-muted-foreground">
            Every return request buyers have raised, newest first.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/platform-commerce/orders")}>
          <ArrowLeft className="h-4 w-4" />
          Back to Orders
        </Button>
      </div>

      {!canRead ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Super admin access is required to view returns.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Return Requests</CardTitle>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value ?? "")}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Status</SelectItem>
                  {Object.entries(RETURN_STATUS_COPY).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}

            {loading ? (
              <ListPageSkeleton search={false} filters={1} />
            ) : returns.length === 0 ? (
              <EmptyState
                icon={RotateCcw}
                title="No returns here"
                description={
                  statusFilter
                    ? "Nothing sits at this status right now."
                    : "Returns will appear here once buyers raise them."
                }
              />
            ) : (
              <div className="space-y-3">
                {returns.map((entry) => {
                  const working = busyId === entry.id;
                  return (
                    <div key={entry.id} className="rounded-md border p-4 text-sm space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium">{entry.reason.replace(/_/g, " ")}</p>
                          {entry.order && (
                            <p className="text-muted-foreground">
                              {entry.order.buyerName} | {entry.order.buyerEmail} | Order total{" "}
                              {fmt(entry.order.totalAmount)}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Raised {formatDateTime(entry.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={entry.status === "REJECTED" ? "destructive" : "secondary"}>
                            {RETURN_STATUS_COPY[entry.status] ?? entry.status}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              navigate(`/platform-commerce/orders/${entry.orderId}`)
                            }
                          >
                            View order
                          </Button>
                        </div>
                      </div>

                      {entry.comment && <p className="text-muted-foreground">“{entry.comment}”</p>}

                      {canDecide && entry.status === "REQUESTED" && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            size="sm"
                            disabled={working}
                            onClick={() =>
                              run(entry.id, () =>
                                decideReturn.mutateAsync({
                                  returnId: entry.id,
                                  decision: "APPROVE",
                                }),
                              )
                            }
                          >
                            <RotateCcw className="h-4 w-4" />
                            Approve &amp; book pickup
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={working}
                            onClick={() =>
                              run(entry.id, () =>
                                decideReturn.mutateAsync({
                                  returnId: entry.id,
                                  decision: "REJECT",
                                }),
                              )
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      )}

                      {canDecide && ["APPROVED", "PICKED_UP"].includes(entry.status) && (
                        <Button
                          size="sm"
                          disabled={working}
                          onClick={() => run(entry.id, () => receiveReturn.mutateAsync(entry.id))}
                        >
                          Mark received &amp; refund
                        </Button>
                      )}

                      {entry.refundedAt && (
                        <p className="text-muted-foreground">
                          Refunded {entry.refundAmount != null ? fmt(entry.refundAmount) : ""} on{" "}
                          {formatDateTime(entry.refundedAt)}.
                        </p>
                      )}
                    </div>
                  );
                })}

                {(hasMore || loadingMore) && (
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
