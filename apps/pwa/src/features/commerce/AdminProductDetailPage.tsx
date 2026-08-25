import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useNavigate, useParams } from "react-router-dom";
import {
  useAdminOrdersInfinite,
  useAdminProduct,
  useDeleteProduct,
} from "@/api/queries/platform";
import { flattenPages } from "@/api/queries/shared";
import { getApiError } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/utils";
import { ArrowLeft, Edit2, PackageOpen, ShoppingBag, Trash2 } from "lucide-react";
import type { Order, OrderItem } from "@/types/api";

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

function getProductLine(order: Order, productId: string): OrderItem | undefined {
  return order.items.find((item) => item.productId === productId);
}

export default function AdminProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canManageOrders = can(Permission.PLATFORM_ORDERS_UPDATE);

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deletingProduct, setDeletingProduct] = React.useState(false);
  const [actionError, setActionError] = React.useState("");

  const productQuery = useAdminProduct(productId);
  const product = productQuery.data ?? null;
  const loading = productQuery.isLoading;
  const error = actionError || (productQuery.isError ? getApiError(productQuery.error) : "");

  // Orders that include this product, only for callers who may read them.
  const ordersQuery = useAdminOrdersInfinite(
    { productId },
    { enabled: canManageOrders && Boolean(productId), limit: 10 },
  );
  const orders = React.useMemo(
    () => flattenPages<Order>(ordersQuery.data?.pages),
    [ordersQuery.data],
  );
  const ordersLoading = ordersQuery.isLoading;
  const ordersLoadingMore = ordersQuery.isFetchingNextPage;
  const ordersHasMore = Boolean(ordersQuery.hasNextPage);
  const ordersError = ordersQuery.isError ? getApiError(ordersQuery.error) : "";

  const deleteProduct = useDeleteProduct();

  const handleDeleteProduct = async () => {
    if (!product) return;

    setDeletingProduct(true);
    setActionError("");

    try {
      await deleteProduct.mutateAsync(product.id);
      navigate("/platform-commerce");
    } catch (err: unknown) {
      setActionError(getApiError(err));
    } finally {
      setDeletingProduct(false);
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  if (!product) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/platform-commerce")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Product Details</h1>
            <p className="text-muted-foreground">The requested product could not be loaded.</p>
          </div>
        </div>

        <EmptyState
          icon={PackageOpen}
          title="Product not found"
          description={error || "This product may have been removed."}
          action={
            <Button variant="outline" onClick={() => navigate("/platform-commerce")}>
              Back to Products
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/platform-commerce")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Product Details</h1>
            <p className="text-muted-foreground">{product.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/platform-commerce/orders")}>
            <ShoppingBag className="h-4 w-4" />
            View All Orders
          </Button>
          <Button variant="outline" onClick={() => navigate(`/platform-commerce/edit/${product.id}`)}>
            <Edit2 className="h-4 w-4" />
            Edit
          </Button>
          <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Delete Product
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="overflow-hidden rounded-md border bg-muted">
              {product.photos.length > 0 ? (
                <img
                  src={product.photos[0]}
                  alt={product.name}
                  className="aspect-video w-full object-cover"
                />
              ) : (
                <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
                  No product image
                </div>
              )}
            </div>

            {product.photos.length > 1 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {product.photos.slice(1).map((photo, index) => (
                  <div key={`${photo}-${index}`} className="overflow-hidden rounded-md border bg-muted">
                    <img
                      src={photo}
                      alt={`${product.name} ${index + 2}`}
                      className="aspect-square w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium">Description</p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {product.description || "No description added yet."}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inventory</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Category</p>
              <p className="mt-1 font-medium">{product.category}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Price</p>
              <p className="mt-1 font-medium">{fmt(product.price)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Stock</p>
              <p className="mt-1 font-medium">{product.stock}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Order Limits</p>
              <p className="mt-1 font-medium">
                {product.minOrderQty} to {product.maxOrderQty}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
              <div className="mt-1">
                <Badge variant={product.isActive ? "success" : "secondary"}>
                  {product.isActive ? "ACTIVE" : "INACTIVE"}
                </Badge>
              </div>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Updated</p>
              <p className="mt-1 font-medium">{formatDateTime(product.updatedAt ?? product.createdAt)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Orders for this product</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManageOrders ? (
            <p className="text-sm text-muted-foreground">
              Super admin access is required to view related orders.
            </p>
          ) : ordersLoading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Spinner size="sm" />
            </div>
          ) : orders.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="No related orders"
              description="Orders containing this product will appear here."
            />
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const line = getProductLine(order, product.id);
                if (!line) return null;

                return (
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
                    className="cursor-pointer rounded-md border p-3 transition hover:border-primary/40 hover:bg-muted/20"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-medium">{order.id}</p>
                        <p className="text-sm text-muted-foreground">
                          {order.buyerName} | {order.buyerEmail}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Ordered {formatDateTime(order.createdAt)}
                        </p>
                        <p className="text-sm">
                          Qty {line.quantity} | Line total {fmt(line.lineTotal)}
                        </p>
                      </div>
                      <Badge variant={STATUS_STYLE[order.status] ?? "secondary"}>{order.status}</Badge>
                    </div>
                  </div>
                );
              })}

              {(ordersHasMore || ordersLoadingMore) && (
                <Button
                  variant="outline"
                  onClick={() => void ordersQuery.fetchNextPage()}
                  disabled={ordersLoadingMore}
                  className="w-full"
                >
                  {ordersLoadingMore ? "Loading..." : "Load More Orders"}
                </Button>
              )}
            </div>
          )}

          {ordersError && <p className="text-sm text-destructive">{ordersError}</p>}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete product?"
        description="This will permanently delete the product if it has no order history."
        confirmLabel="Delete Product"
        loading={deletingProduct}
        onConfirm={handleDeleteProduct}
      />
    </div>
  );
}
