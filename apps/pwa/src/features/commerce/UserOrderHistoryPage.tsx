import * as React from "react";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useMyOrdersInfinite } from "@/api/queries/platform";
import { flattenPages } from "@/api/queries/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { ListPageSkeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/utils";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
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
  const navigate = useAppNavigate();
  const ordersQuery = useMyOrdersInfinite();
  const orders = React.useMemo(
    () => flattenPages<Order>(ordersQuery.data?.pages),
    [ordersQuery.data],
  );
  const loading = ordersQuery.isLoading;
  const loadingMore = ordersQuery.isFetchingNextPage;
  const hasMore = Boolean(ordersQuery.hasNextPage);

  const loadMore = React.useCallback(() => {
    if (ordersQuery.hasNextPage && !ordersQuery.isFetchingNextPage) {
      void ordersQuery.fetchNextPage();
    }
  }, [ordersQuery]);

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
        <ListPageSkeleton search={false} filters={0} />
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
