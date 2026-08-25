import * as React from "react";
import { useNavigate } from "react-router-dom";
import { commerceApi } from "@/api/commerce";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/utils";
import { appendUniqueById, useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { PackageSearch } from "lucide-react";
import type { Order } from "@/types/api";

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

export default function UserOrderHistoryPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(true);

  const fetchOrders = React.useCallback(async (nextPage: number, mode: "replace" | "append") => {
    if (mode === "replace") {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await commerceApi.listMyOrders(nextPage, 20);
      const nextOrders = res.data.data.orders;
      setOrders((prev) => (mode === "replace" ? nextOrders : appendUniqueById(prev, nextOrders)));
      const totalPages = res.data.meta.totalPages;
      setHasMore(nextPage < totalPages);
      setPage(nextPage);
    } catch {
      if (mode === "replace") setOrders([]);
    } finally {
      if (mode === "replace") {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  }, []);

  React.useEffect(() => {
    setOrders([]);
    setHasMore(true);
    void fetchOrders(1, "replace");
  }, [fetchOrders]);

  const loadMore = React.useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    void fetchOrders(page + 1, "append");
  }, [loading, loadingMore, hasMore, page, fetchOrders]);

  const loadMoreRef = useInfiniteScroll({
    hasMore,
    loading: loading || loadingMore,
    onLoadMore: loadMore,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Orders</h1>
          <p className="text-muted-foreground">Track all orders linked to your account.</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/shop")}>
          Go to Shop
        </Button>
      </div>

      {loading ? (
        <PageLoader />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="No orders yet"
          description="Visit the public shop to place your first order."
          action={<Button onClick={() => navigate("/shop")}>Browse Catalog</Button>}
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Order {order.id}</CardTitle>
                  <Badge variant={STATUS_STYLE[order.status] ?? "secondary"}>{order.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Placed At</span>
                  <span>{formatDateTime(order.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Items</span>
                  <span>{order.items.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{fmt(order.subtotalAmount)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">GST ({order.gstRatePct}%)</span>
                  <span>{fmt(order.gstAmount)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold">{fmt(order.totalAmount)}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/shop/orders/${order.id}`)}
                >
                  View Details
                </Button>
              </CardContent>
            </Card>
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
    </div>
  );
}
