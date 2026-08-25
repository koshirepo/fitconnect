import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useNavigate, useParams } from "react-router-dom";
import {
  useAdminOrder,
  useDeleteAdminOrder,
  useUpdateOrderStatus,
} from "@/api/queries/platform";
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
import { ArrowLeft, PackageSearch, Trash2 } from "lucide-react";
import type { OrderStatus } from "@/types/api";

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

export default function AdminOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canManageOrders = can(Permission.PLATFORM_ORDERS_UPDATE);

  const [updatingStatus, setUpdatingStatus] = React.useState(false);
  const [deletingOrder, setDeletingOrder] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [actionError, setActionError] = React.useState("");

  const orderQuery = useAdminOrder(canManageOrders ? orderId : undefined);
  const order = orderQuery.data ?? null;
  const loading = orderQuery.isLoading;
  const error = actionError || (orderQuery.isError ? getApiError(orderQuery.error) : "");

  // Both writes invalidate the orders key, so this detail view refreshes itself.
  const updateStatus = useUpdateOrderStatus();
  const deleteOrder = useDeleteAdminOrder();

  const handleStatusChange = async (status: OrderStatus) => {
    if (!order) return;

    setUpdatingStatus(true);
    setActionError("");

    try {
      await updateStatus.mutateAsync({ orderId: order.id, status });
    } catch (err: unknown) {
      setActionError(getApiError(err));
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!order) return;

    setDeletingOrder(true);
    setActionError("");

    try {
      await deleteOrder.mutateAsync(order.id);
      navigate("/platform-commerce/orders");
    } catch (err: unknown) {
      setActionError(getApiError(err));
    } finally {
      setDeletingOrder(false);
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  if (!canManageOrders) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/platform-commerce/orders")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Order Details</h1>
            <p className="text-muted-foreground">Super admin access is required for this page.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/platform-commerce/orders")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Order Details</h1>
            <p className="text-muted-foreground">The requested order could not be loaded.</p>
          </div>
        </div>

        <EmptyState
          icon={PackageSearch}
          title="Order not found"
          description={error || "Please check the order and try again."}
          action={
            <Button variant="outline" onClick={() => navigate("/platform-commerce/orders")}>
              Back to Orders
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
          <Button variant="ghost" size="icon" onClick={() => navigate("/platform-commerce/orders")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Order Details</h1>
            <p className="text-muted-foreground">Order ID: {order.id}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={STATUS_STYLE[order.status] ?? "secondary"}>{order.status}</Badge>
          <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Delete Order
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-medium">{item.productName}</p>
                    <p className="text-sm text-muted-foreground">
                      Qty {item.quantity} x {fmt(item.unitPrice)}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-0"
                      onClick={() => navigate(`/platform-commerce/products/${item.productId}`)}
                    >
                      View Product
                    </Button>
                  </div>
                  <p className="font-semibold">{fmt(item.lineTotal)}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Created At</span>
                <span>{formatDateTime(order.createdAt)}</span>
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
              <div className="space-y-2 pt-2">
                <span className="text-sm text-muted-foreground">Update Status</span>
                <Select
                  value={order.status}
                  onValueChange={(value) => void handleStatusChange((value ?? "") as OrderStatus)}
                  disabled={updatingStatus}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">PENDING</SelectItem>
                    <SelectItem value="SHIPPED">SHIPPED</SelectItem>
                    <SelectItem value="DELIVERED">DELIVERED</SelectItem>
                  </SelectContent>
                </Select>
                {updatingStatus && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner size="sm" />
                    Updating status...
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Buyer Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>{order.buyerName}</p>
              <p className="text-muted-foreground">{order.buyerEmail}</p>
              <p className="text-muted-foreground">{order.buyerPhone}</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{order.buyerAddress}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete order?"
        description="This will permanently remove the order and restore its product quantities back to inventory."
        confirmLabel="Delete Order"
        loading={deletingOrder}
        onConfirm={handleDeleteOrder}
      />
    </div>
  );
}
