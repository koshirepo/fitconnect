import * as React from "react";
import { useNavigate } from "react-router-dom";
import { commerceApi } from "@/api/commerce";
import { getApiError } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { PackageOpen, Plus, Edit2 } from "lucide-react";
import type { Product, Order, OrderStatus } from "@/types/api";
import { appendUniqueById, useInfiniteScroll } from "@/lib/use-infinite-scroll";

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

export default function AdminCommercePage() {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuthStore();
  const canManageOrders = isSuperAdmin();

  const [products, setProducts] = React.useState<Product[]>([]);
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [ordersLoading, setOrdersLoading] = React.useState(false);
  const [ordersLoadingMore, setOrdersLoadingMore] = React.useState(false);
  const [orderError, setOrderError] = React.useState("");

  const [orderPage, setOrderPage] = React.useState(1);
  const [orderHasMore, setOrderHasMore] = React.useState(true);
  const [orderStatusFilter, setOrderStatusFilter] = React.useState("");

  const fetchProducts = React.useCallback(async () => {
    const res = await commerceApi.listAdminProducts(1, 100, true);
    setProducts(res.data.data.products);
  }, []);

  const fetchOrders = React.useCallback(
    async (nextPage: number, mode: "replace" | "append") => {
      if (!canManageOrders) return;
      if (mode === "replace") {
        setOrdersLoading(true);
      } else {
        setOrdersLoadingMore(true);
      }
      const status = orderStatusFilter ? (orderStatusFilter as OrderStatus) : undefined;
      try {
        const res = await commerceApi.listAdminOrders(nextPage, 20, status);
        const nextOrders = res.data.data.orders;
        setOrders((prev) => (mode === "replace" ? nextOrders : appendUniqueById(prev, nextOrders)));
        const totalPages = res.data.meta.totalPages;
        setOrderHasMore(nextPage < totalPages);
        setOrderPage(nextPage);
      } catch {
        if (mode === "replace") setOrders([]);
      } finally {
        if (mode === "replace") {
          setOrdersLoading(false);
        } else {
          setOrdersLoadingMore(false);
        }
      }
    },
    [canManageOrders, orderStatusFilter],
  );

  React.useEffect(() => {
    setLoading(true);
    fetchProducts()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fetchProducts]);

  React.useEffect(() => {
    if (!canManageOrders) return;
    setOrders([]);
    setOrderHasMore(true);
    void fetchOrders(1, "replace");
  }, [canManageOrders, orderStatusFilter, fetchOrders]);

  const loadMoreOrders = React.useCallback(() => {
    if (!canManageOrders || ordersLoading || ordersLoadingMore || !orderHasMore) return;
    void fetchOrders(orderPage + 1, "append");
  }, [canManageOrders, ordersLoading, ordersLoadingMore, orderHasMore, orderPage, fetchOrders]);

  const loadMoreOrdersRef = useInfiniteScroll({
    hasMore: canManageOrders && orderHasMore,
    loading: ordersLoading || ordersLoadingMore,
    onLoadMore: loadMoreOrders,
  });

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    setOrderError("");
    try {
      await commerceApi.updateOrderStatus(orderId, status);
      await fetchOrders(1, "replace");
    } catch (err: unknown) {
      setOrderError(getApiError(err));
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">E-commerce Admin</h1>
        <p className="text-muted-foreground">
          Manage global product catalog and track public bulk orders.
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => navigate("/platform-commerce/create")}>
          <Plus className="h-4 w-4" />
          Create Product
        </Button>
      </div>

      {loading ? (
        <PageLoader />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Products</CardTitle>
            </CardHeader>
            <CardContent>
              {products.length === 0 ? (
                <EmptyState
                  icon={PackageOpen}
                  title="No products yet"
                  description="Create your first catalog item to get started."
                />
              ) : (
                <div className="space-y-3">
                  {products.map((product) => (
                    <div key={product.id} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex gap-3 flex-1">
                          <div className="h-20 w-20 shrink-0 rounded bg-muted overflow-hidden">
                            {product.photos.length > 0 ? (
                              <img
                                src={product.photos[0]}
                                alt={product.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">
                                No image
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-sm text-muted-foreground">{product.category}</p>
                            <p className="text-sm">
                              {fmt(product.price)} | Stock {product.stock}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Min {product.minOrderQty} / Max {product.maxOrderQty}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={product.isActive ? "success" : "secondary"}>
                            {product.isActive ? "ACTIVE" : "INACTIVE"}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/platform-commerce/edit/${product.id}`)}
                          >
                            <Edit2 className="h-4 w-4" />
                            Edit
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Orders</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!canManageOrders && (
                <p className="text-sm text-muted-foreground">
                  Super admin access is required to view and manage all orders.
                </p>
              )}

              {canManageOrders && (
                <>
                  <div className="flex gap-2">
                    <Select
                      value={orderStatusFilter}
                      onChange={(e) => {
                        setOrderStatusFilter(e.target.value);
                      }}
                      className="w-44"
                    >
                      <option value="">All Status</option>
                      <option value="PENDING">Pending</option>
                      <option value="SHIPPED">Shipped</option>
                      <option value="DELIVERED">Delivered</option>
                    </Select>
                  </div>

                  {orderError && <p className="text-sm text-destructive">{orderError}</p>}

                  {ordersLoading && orders.length === 0 ? (
                    <div className="flex items-center justify-center py-6 text-muted-foreground">
                      <Spinner size="sm" />
                    </div>
                  ) : orders.length === 0 ? (
                    <EmptyState
                      icon={PackageOpen}
                      title="No orders found"
                      description="Orders will appear here once buyers place them."
                    />
                  ) : (
                    <div className="space-y-3">
                      {orders.map((order) => (
                        <div key={order.id} className="rounded-md border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{order.id}</p>
                              <p className="text-sm text-muted-foreground">
                                {order.buyerName} | {order.buyerEmail}
                              </p>
                              <p className="text-sm">
                                Subtotal {fmt(order.subtotalAmount)} + GST {fmt(order.gstAmount)} ={" "}
                                {fmt(order.totalAmount)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={STATUS_STYLE[order.status] ?? "secondary"}>
                                {order.status}
                              </Badge>
                              <Select
                                value={order.status}
                                onChange={(e) =>
                                  updateOrderStatus(order.id, e.target.value as OrderStatus)
                                }
                                className="w-32"
                              >
                                <option value="PENDING">PENDING</option>
                                <option value="SHIPPED">SHIPPED</option>
                                <option value="DELIVERED">DELIVERED</option>
                              </Select>
                            </div>
                          </div>
                        </div>
                      ))}

                      {orders.length > 0 && (orderHasMore || ordersLoadingMore) && (
                        <div
                          ref={loadMoreOrdersRef}
                          className="flex items-center justify-center py-4 text-sm text-muted-foreground"
                        >
                          {ordersLoadingMore ? (
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
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
