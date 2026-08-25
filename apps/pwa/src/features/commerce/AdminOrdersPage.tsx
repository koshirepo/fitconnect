import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useNavigate } from "react-router-dom";
import { useAdminOrdersInfinite, useDeleteAdminOrder } from "@/api/queries/platform";
import { flattenPages } from "@/api/queries/shared";
import { getApiError } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/utils";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { ArrowLeft, PackageSearch, Trash2 } from "lucide-react";
import type { Order, OrderStatus } from "@/types/api";

const STATUS_STYLE: Record<string, "warning" | "success" | "secondary"> = {
  PENDING: "warning",
  SHIPPED: "secondary",
  DELIVERED: "success",
};

const fmt = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);

export default function AdminOrdersPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canManageOrders = can(Permission.PLATFORM_ORDERS_UPDATE);

  const [statusFilter, setStatusFilter] = React.useState("");
  const [actionError, setActionError] = React.useState("");
  const [orderToDelete, setOrderToDelete] = React.useState<Order | null>(null);
  const [deletingOrder, setDeletingOrder] = React.useState(false);

  const ordersQuery = useAdminOrdersInfinite(
    { status: statusFilter ? (statusFilter as OrderStatus) : undefined },
    { enabled: canManageOrders },
  );

  const orders = React.useMemo(
    () => flattenPages<Order>(ordersQuery.data?.pages),
    [ordersQuery.data],
  );
  const loading = ordersQuery.isLoading;
  const loadingMore = ordersQuery.isFetchingNextPage;
  const hasMore = Boolean(ordersQuery.hasNextPage);
  const error = actionError || (ordersQuery.isError ? getApiError(ordersQuery.error) : "");

  const deleteOrder = useDeleteAdminOrder();

  const loadMoreRef = useInfiniteScroll({
    hasMore: canManageOrders && hasMore,
    loading: loading || loadingMore,
    onLoadMore: () => {
      if (ordersQuery.hasNextPage && !ordersQuery.isFetchingNextPage) {
        void ordersQuery.fetchNextPage();
      }
    },
  });

  const handleDeleteOrder = async () => {
    if (!orderToDelete) return;

    setDeletingOrder(true);
    setActionError("");

    try {
      // Invalidating the orders key resets the paged list to page one for us.
      await deleteOrder.mutateAsync(orderToDelete.id);
      setOrderToDelete(null);
    } catch (err: unknown) {
      setActionError(getApiError(err));
    } finally {
      setDeletingOrder(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">Review all commerce orders in one place.</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/platform-commerce")}>
          <ArrowLeft className="h-4 w-4" />
          Back to Products
        </Button>
      </div>

      {!canManageOrders ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Super admin access is required to view and manage all orders.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>All Orders</CardTitle>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value ?? "")}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Status</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="SHIPPED">Shipped</SelectItem>
                  <SelectItem value="DELIVERED">Delivered</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}

            {loading ? (
              <PageLoader />
            ) : orders.length === 0 ? (
              <EmptyState
                icon={PackageSearch}
                title="No orders found"
                description="Orders will appear here once buyers place them."
              />
            ) : (
              <div className="space-y-3">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/platform-commerce/orders/${order.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigate(`/platform-commerce/orders/${order.id}`);
                      }
                    }}
                    className="cursor-pointer rounded-md border p-4 transition hover:border-primary/40 hover:bg-muted/20"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-medium">{order.id}</p>
                        <p className="text-sm text-muted-foreground">
                          {order.buyerName} | {order.buyerEmail}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Placed {formatDateTime(order.createdAt)}
                        </p>
                        <p className="text-sm">
                          {order.items.length} item
                          {order.items.length !== 1 ? "s" : ""} | Total {fmt(order.totalAmount)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={STATUS_STYLE[order.status] ?? "secondary"}>
                          {order.status}
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOrderToDelete(order);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                {orders.length > 0 && (hasMore || loadingMore) && (
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

      <ConfirmDialog
        open={Boolean(orderToDelete)}
        onOpenChange={(open) => {
          if (!open) setOrderToDelete(null);
        }}
        title="Delete order?"
        description="This will permanently remove the order and restore its product quantities back to inventory."
        confirmLabel="Delete Order"
        loading={deletingOrder}
        onConfirm={handleDeleteOrder}
      />
    </div>
  );
}
