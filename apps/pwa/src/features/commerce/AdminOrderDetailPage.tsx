import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useNavigate, useParams } from "react-router-dom";
import {
  useAdminCancelOrder,
  useAdminOrder,
  useDecideReturn,
  useDeleteAdminOrder,
  useOrderTracking,
  useReceiveReturn,
  useRefundOrder,
  useShipOrder,
  useUpdateOrderStatus,
} from "@/api/queries/platform";
import { getApiError } from "@/api/client";
import { commerceApi } from "@/api/commerce";
import { useToast } from "@/components/ui/toast";
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
import { Spinner } from "@/components/ui/spinner";
import { DetailPageSkeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/utils";
import {
  PackageSearch,
  Trash2,
  Truck,
  XCircle,
  IndianRupee,
  RotateCcw,
  Printer,
} from "lucide-react";
import type { OrderStatus } from "@/types/api";

const STATUS_STYLE: Record<string, "warning" | "success" | "secondary" | "destructive"> = {
  PENDING: "warning",
  CONFIRMED: "secondary",
  PACKED: "secondary",
  SHIPPED: "secondary",
  IN_TRANSIT: "secondary",
  OUT_FOR_DELIVERY: "secondary",
  DELIVERED: "success",
  CANCELLED: "destructive",
  RETURNED: "destructive",
};

/** Every state the status picker offers, in the order an order walks them. */
const STATUS_OPTIONS: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PACKED",
  "SHIPPED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "RETURNED",
];

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

export default function AdminOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const canManageOrders = can(Permission.PLATFORM_ORDERS_UPDATE);

  const [updatingStatus, setUpdatingStatus] = React.useState(false);
  const [deletingOrder, setDeletingOrder] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  const [actionError, setActionError] = React.useState("");

  const orderQuery = useAdminOrder(canManageOrders ? orderId : undefined);
  const order = orderQuery.data ?? null;
  const loading = orderQuery.isLoading;
  const error = actionError || (orderQuery.isError ? getApiError(orderQuery.error) : "");

  // Both writes invalidate the orders key, so this detail view refreshes itself.
  const updateStatus = useUpdateOrderStatus();
  const deleteOrder = useDeleteAdminOrder();

  const trackingQuery = useOrderTracking(canManageOrders ? orderId : undefined);
  const shipments = trackingQuery.data?.shipments ?? [];
  const returns = trackingQuery.data?.returns ?? [];
  const forwards = shipments.filter((shipment) => shipment.kind === "FORWARD");

  /**
   * Open the courier label in a new tab.
   *
   * The link is asked for at the moment it is clicked because Delhivery's PDF
   * links expire; a stored one fails at the printer.
   */
  const openLabel = async (shipmentId: string) => {
    setWorking(true);
    setActionError("");
    try {
      const res = await commerceApi.getShipmentLabel(shipmentId);
      window.open(res.data.data.pdfUrl, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      setActionError(getApiError(err));
    } finally {
      setWorking(false);
    }
  };

  const shipOrder = useShipOrder();
  const cancelOrder = useAdminCancelOrder();
  const refundOrder = useRefundOrder();
  const decideReturn = useDecideReturn();
  const receiveReturn = useReceiveReturn();

  /**
   * One wrapper for every fulfilment action.
   *
   * They all share the same shape — disable the buttons, clear the last error,
   * report what happened, refresh tracking — and five copies of it is how one
   * of them ends up leaving the page spinning after a failure.
   */
  const run = async (label: string, action: () => Promise<unknown>) => {
    setWorking(true);
    setActionError("");
    try {
      await action();
      toast.success(label);
      await trackingQuery.refetch();
    } catch (err: unknown) {
      setActionError(getApiError(err));
    } finally {
      setWorking(false);
    }
  };

  const handleStatusChange = async (status: OrderStatus) => {
    if (!order) return;

    setUpdatingStatus(true);
    setActionError("");

    try {
      await updateStatus.mutateAsync({ orderId: order.id, status });
      toast.success(`Order marked ${status.toLowerCase()}.`);
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
    return <DetailPageSkeleton />;
  }

  if (!canManageOrders) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
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
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Order Details</h1>
            <p className="text-muted-foreground">Order ID: {order.id}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_STYLE[order.status] ?? "secondary"}>
            {order.status.replace(/_/g, " ")}
          </Badge>
          <Badge variant={order.paymentStatus === "COMPLETED" ? "default" : "secondary"}>
            {order.paymentStatus ?? "PENDING"}
          </Badge>
          <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Delete Order
          </Button>
        </div>
      </div>

      {/* ── Fulfilment ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Fulfilment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={working || forwards.length > 0 || order.status === "CANCELLED"}
              onClick={() =>
                run("Courier booked.", () => shipOrder.mutateAsync(order.id))
              }
            >
              <Truck className="h-4 w-4" />
              {forwards.length > 0 ? "Courier booked" : "Book courier"}
            </Button>
            <Button
              variant="outline"
              disabled={working || order.status === "CANCELLED"}
              onClick={() => setCancelDialogOpen(true)}
            >
              <XCircle className="h-4 w-4" />
              Cancel &amp; refund
            </Button>
            <Button
              variant="outline"
              disabled={
                working ||
                order.paymentStatus !== "COMPLETED"
              }
              onClick={() => setRefundDialogOpen(true)}
            >
              <IndianRupee className="h-4 w-4" />
              Refund
            </Button>
          </div>

          {forwards.length > 0 ? (
            // One card per parcel. An order drawing on two warehouses ships as
            // two consignments, and an operator packing them needs both.
            <div className="space-y-3">
              {forwards.map((shipment, index) => (
                <div key={shipment.id} className="rounded-md border p-3 text-sm space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {forwards.length > 1 && `Parcel ${index + 1} of ${forwards.length} · `}
                      {shipment.provider} · {shipment.waybill}
                    </span>
                    <Badge variant="secondary">{shipment.status.replace(/_/g, " ")}</Badge>
                  </div>
                  {shipment.pickupLocation && (
                    <p className="text-muted-foreground">From {shipment.pickupLocation}</p>
                  )}
                  <p className="text-muted-foreground">
                    {shipment.statusDetail ?? "Manifested with the courier."}
                    {shipment.currentLocation ? ` — ${shipment.currentLocation}` : ""}
                  </p>
                  {shipment.estimatedDeliveryAt && (
                    <p className="text-muted-foreground">
                      Expected {formatDateTime(shipment.estimatedDeliveryAt)}
                    </p>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-0"
                    disabled={working}
                    onClick={() => openLabel(shipment.id)}
                  >
                    <Printer className="h-4 w-4" />
                    Print label
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No consignment yet. Paid orders book one automatically; use the button above when
              that failed or when the order was settled off-app.
            </p>
          )}

          {order.refundedAt && (
            <p className="text-sm text-muted-foreground">
              Refunded {fmt(order.refundAmount ?? order.totalAmount)} on{" "}
              {formatDateTime(order.refundedAt)}.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Returns ────────────────────────────────────────────────────── */}
      {returns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Returns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {returns.map((entry) => (
              <div key={entry.id} className="rounded-md border p-3 text-sm space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{entry.reason.replace(/_/g, " ")}</span>
                  <Badge variant={entry.status === "REJECTED" ? "destructive" : "secondary"}>
                    {RETURN_STATUS_COPY[entry.status] ?? entry.status}
                  </Badge>
                </div>
                {entry.comment && <p className="text-muted-foreground">“{entry.comment}”</p>}
                <p className="text-xs text-muted-foreground">
                  Raised {formatDateTime(entry.createdAt)}
                </p>

                {/* Approving books the reverse pickup; receiving is what pays
                    the buyer back, so the two are deliberately separate. */}
                {entry.status === "REQUESTED" && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      disabled={working}
                      onClick={() =>
                        run("Return approved and pickup booked.", () =>
                          decideReturn.mutateAsync({ returnId: entry.id, decision: "APPROVE" }),
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
                        run("Return rejected.", () =>
                          decideReturn.mutateAsync({ returnId: entry.id, decision: "REJECT" }),
                        )
                      }
                    >
                      Reject
                    </Button>
                  </div>
                )}

                {["APPROVED", "PICKED_UP"].includes(entry.status) && (
                  <Button
                    size="sm"
                    disabled={working}
                    onClick={() =>
                      run("Return received — refund issued.", () =>
                        receiveReturn.mutateAsync(entry.id),
                      )
                    }
                  >
                    Mark received &amp; refund
                  </Button>
                )}

                {entry.refundedAt && (
                  <p className="text-muted-foreground">
                    Refunded {fmt(entry.refundAmount ?? order.totalAmount)} on{" "}
                    {formatDateTime(entry.refundedAt)}.
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
                <span className="text-muted-foreground">Shipping</span>
                <span
                  className={order.shippingQuoteIssue ? "text-amber-600 dark:text-amber-400" : undefined}
                >
                  {order.shippingAmount ? fmt(order.shippingAmount) : "Free"}
                </span>
              </div>

              {/* A free order is not necessarily a wrong one — a shop with no
                  courier configured really does charge nothing. But when the
                  quote fell short for a reason the desk can fix, saying so here
                  is the difference between re-pricing before dispatch and
                  finding it on a courier invoice weeks later. */}
              {order.shippingQuoteIssue && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                  {order.shippingQuoteIssue} Re-price this before dispatch if the
                  buyer should have been charged.
                </p>
              )}
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
                    {STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
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
              {(order.buyerCity || order.buyerPincode) && (
                <p className="text-muted-foreground">
                  {[order.buyerCity, order.buyerState, order.buyerPincode]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
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

      <ConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        title="Cancel this order?"
        description="The consignment is called off, stock goes back, and any payment is refunded to the buyer. A parcel already picked up cannot be recalled — it has to come back as an RTO."
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        loading={working}
        onConfirm={() =>
          run("Order cancelled.", () =>
            cancelOrder.mutateAsync({ orderId: order.id, reason: "Cancelled by the shop" }),
          )
        }
      />

      <ConfirmDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
        title={`Refund ${fmt(order.totalAmount)}?`}
        description="Sends the full order amount back through Razorpay. It usually reaches the buyer's bank in 5–7 days."
        confirmLabel="Refund in full"
        variant="default"
        loading={working}
        onConfirm={() =>
          run("Refund issued.", () => refundOrder.mutateAsync({ orderId: order.id }))
        }
      />
    </div>
  );
}
