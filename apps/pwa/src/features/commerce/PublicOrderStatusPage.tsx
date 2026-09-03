/**
 * Documentation: The buyer's own page for one order.
 *
 * - Everything someone who bought something needs after paying: where the parcel is, what it cost, and the two things they can still do about it — call it off before dispatch, or send it back after delivery.
 * - Reached with nothing but the order id, by a guest as easily as by a signed-in buyer. That is deliberate, and it is why the page never shows anything about other orders.
 * - Whether cancelling and returning are offered is the API's answer, not this page's: a return window and a dispatch state are the server's business, and a browser that decided for itself would offer buttons the server then refuses.
 * - Primary exports: PublicOrderStatusPage.
 */
import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { commerceApi } from "@/api/commerce";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DetailPageSkeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";
import {
  ArrowLeft,
  PackageSearch,
  Package,
  Truck,
  CheckCircle2,
  XCircle,
  RotateCcw,
  MapPin,
  Copy,
  Check,
} from "lucide-react";
import type { OrderTracking, ReturnReason, Shipment } from "@/types/api";

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

/**
 * The path an order walks, in order.
 *
 * Only the happy path is a stepper. Cancelled and returned orders leave it, and
 * drawing them as a step would suggest they are on the way somewhere.
 */
const STEPS = [
  { key: "CONFIRMED", label: "Confirmed", icon: CheckCircle2 },
  { key: "SHIPPED", label: "Shipped", icon: Package },
  { key: "IN_TRANSIT", label: "In transit", icon: Truck },
  { key: "OUT_FOR_DELIVERY", label: "Out for delivery", icon: Truck },
  { key: "DELIVERED", label: "Delivered", icon: CheckCircle2 },
] as const;

const RETURN_REASONS: Array<{ value: ReturnReason; label: string }> = [
  { value: "DAMAGED", label: "Arrived damaged" },
  { value: "WRONG_ITEM", label: "Wrong item sent" },
  { value: "NOT_AS_DESCRIBED", label: "Not as described" },
  { value: "SIZE_OR_FIT", label: "Size or fit" },
  { value: "NO_LONGER_NEEDED", label: "No longer needed" },
  { value: "OTHER", label: "Something else" },
];

const RETURN_STATUS_COPY: Record<string, string> = {
  REQUESTED: "Waiting for approval",
  APPROVED: "Approved — pickup booked",
  REJECTED: "Not approved",
  PICKED_UP: "Picked up",
  RECEIVED: "Received at warehouse",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
};

const fmt = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);

/** The waybill, with a one-click copy — it is what the courier asks for. */
function WaybillRow({ shipment }: { shipment: Shipment }) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shipment.waybill);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard denied (insecure context, or the browser said no). The
      // number is on screen either way, which is the point of showing it.
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">
        {shipment.kind === "REVERSE" ? "Return waybill" : "Waybill"}
      </span>
      <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{shipment.waybill}</code>
      <button
        type="button"
        onClick={copy}
        className="text-muted-foreground transition-colors hover:text-foreground"
        title="Copy waybill"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <span className="text-xs text-muted-foreground">via {shipment.provider}</span>
    </div>
  );
}

export default function PublicOrderStatusPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();

  const [tracking, setTracking] = React.useState<OrderTracking | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [working, setWorking] = React.useState(false);

  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [returnOpen, setReturnOpen] = React.useState(false);
  const [returnReason, setReturnReason] = React.useState<ReturnReason>("DAMAGED");
  const [returnComment, setReturnComment] = React.useState("");

  const load = React.useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await commerceApi.getOrderTracking(orderId);
      setTracking(res.data.data);
      setError("");
    } catch (err: unknown) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  React.useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const order = tracking?.order ?? null;
  const forwards = tracking?.shipments.filter((s) => s.kind === "FORWARD") ?? [];
  // The whole order arrives when its slowest parcel does.
  const latestEta = forwards
    .map((parcel) => parcel.estimatedDeliveryAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const reverse = tracking?.shipments.find((s) => s.kind === "REVERSE") ?? null;
  const openReturn = tracking?.returns[0] ?? null;

  const currentStep = React.useMemo(() => {
    if (!order) return -1;
    return STEPS.findIndex((step) => step.key === order.status);
  }, [order]);

  const cancelOrder = async () => {
    if (!orderId) return;
    setWorking(true);
    setError("");
    try {
      const res = await commerceApi.cancelOrder(orderId, "Cancelled by the buyer");
      setNotice(
        res.data.data.refunded
          ? "Order cancelled. Your refund is on its way — banks usually take 5–7 days."
          : "Order cancelled.",
      );
      await load();
    } catch (err: unknown) {
      setError(getApiError(err));
    } finally {
      setWorking(false);
    }
  };

  const requestReturn = async () => {
    if (!orderId) return;
    setWorking(true);
    setError("");
    try {
      await commerceApi.requestReturn(orderId, {
        reason: returnReason,
        ...(returnComment.trim() ? { comment: returnComment.trim() } : {}),
      });
      setNotice("Return requested. We will review it and book a pickup once approved.");
      setReturnOpen(false);
      setReturnComment("");
      await load();
    } catch (err: unknown) {
      setError(getApiError(err));
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <DetailPageSkeleton />;

  if (!order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <EmptyState
          icon={PackageSearch}
          title="Order not found"
          description={error || "Please check your order ID and try again."}
          action={
            <Button variant="outline" onClick={() => navigate("/shop/orders/lookup")}>
              <ArrowLeft className="h-4 w-4" />
              Lookup Another Order
            </Button>
          }
        />
      </div>
    );
  }

  const settled = order.status === "CANCELLED" || order.status === "RETURNED";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Your order</h1>
            <p className="text-muted-foreground">Order ID: {order.id}</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/shop")}>
            <ArrowLeft className="h-4 w-4" />
            Back to Catalog
          </Button>
        </div>

        {notice && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
            {notice}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* ── Progress ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>Status</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_STYLE[order.status] ?? "secondary"}>
                {order.status.replace(/_/g, " ")}
              </Badge>
              <Badge variant={order.paymentStatus === "COMPLETED" ? "default" : "secondary"}>
                {order.paymentStatus === "REFUNDED"
                  ? "REFUNDED"
                  : order.paymentStatus === "COMPLETED"
                    ? "PAID"
                    : "UNPAID"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {settled ? (
              <div className="flex items-start gap-3 rounded-lg border p-4">
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium">
                    {order.status === "CANCELLED" ? "Order cancelled" : "Order returned"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {order.cancelReason ??
                      "The parcel is back with us and this order is closed."}
                    {order.refundedAt
                      ? ` Refund of ${fmt(order.refundAmount ?? order.totalAmount)} issued on ${formatDateTime(order.refundedAt)}.`
                      : ""}
                  </p>
                </div>
              </div>
            ) : (
              // A row of five on a desktop, a readable column on a phone —
              // horizontal steppers squeeze their labels into nothing.
              <ol className="grid gap-3 sm:grid-cols-5">
                {STEPS.map((step, index) => {
                  const done = currentStep >= index && currentStep !== -1;
                  const active = currentStep === index;
                  const Icon = step.icon;
                  return (
                    <li key={step.key} className="flex items-center gap-2 sm:flex-col sm:text-center">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                          done
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span
                        className={`text-xs ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                      >
                        {step.label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}

            {latestEta && !settled && (
              <p className="text-sm text-muted-foreground">
                Expected delivery {formatDateTime(latestEta)}
                {forwards.length > 1 ? " — parcels may arrive on different days" : ""}
              </p>
            )}

            {(tracking?.canCancel || tracking?.canRequestReturn) && (
              <div className="flex flex-wrap gap-2 border-t pt-4">
                {tracking.canCancel && (
                  <Button
                    variant="outline"
                    disabled={working}
                    onClick={() => setCancelOpen(true)}
                  >
                    <XCircle className="h-4 w-4" />
                    Cancel order
                  </Button>
                )}
                {tracking.canRequestReturn && (
                  <Button variant="outline" disabled={working} onClick={() => setReturnOpen(true)}>
                    <RotateCcw className="h-4 w-4" />
                    Return this order
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Tracking ─────────────────────────────────────────────────── */}
        {/* One card per parcel. An order drawing on two warehouses genuinely
            arrives as two deliveries, and a page showing one waybill would have
            the buyer waiting for a parcel that already came. */}
        {forwards.map((parcel, parcelIndex) => (
          <Card key={parcel.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle>
                {forwards.length > 1
                  ? `Parcel ${parcelIndex + 1} of ${forwards.length}`
                  : "Tracking"}
              </CardTitle>
              {forwards.length > 1 && (
                <Badge variant={parcel.status === "DELIVERED" ? "success" : "secondary"}>
                  {parcel.status.replace(/_/g, " ")}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <WaybillRow shipment={parcel} />

              {parcel.currentLocation && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {parcel.statusDetail ?? parcel.status} — {parcel.currentLocation}
                </p>
              )}

              {parcel.scans.length > 0 ? (
                // Newest first: the last thing that happened is the thing the
                // buyer opened this page to read.
                <ol className="space-y-3 border-l pl-4">
                  {parcel.scans.map((scan, index) => (
                    <li key={`${scan.scannedAt}-${index}`} className="relative">
                      <span
                        className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${
                          index === 0 ? "bg-primary" : "bg-muted-foreground/40"
                        }`}
                      />
                      <p className="text-sm font-medium">{scan.detail || scan.status}</p>
                      <p className="text-xs text-muted-foreground">
                        {scan.location}
                        {scan.scannedAt ? ` · ${formatDateTime(scan.scannedAt)}` : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  The courier has the parcel booked. Scans appear here once it is picked up.
                </p>
              )}
            </CardContent>
          </Card>
        ))}

        {/* ── Returns ──────────────────────────────────────────────────── */}
        {openReturn && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle>Return</CardTitle>
              <Badge variant={openReturn.status === "REJECTED" ? "destructive" : "secondary"}>
                {RETURN_STATUS_COPY[openReturn.status] ?? openReturn.status}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Reason</span>
                <span>
                  {RETURN_REASONS.find((r) => r.value === openReturn.reason)?.label ??
                    openReturn.reason}
                </span>
              </div>
              {openReturn.comment && (
                <p className="text-muted-foreground">“{openReturn.comment}”</p>
              )}
              {openReturn.decisionNote && (
                <p className="rounded-md border bg-muted/40 p-3 text-muted-foreground">
                  {openReturn.decisionNote}
                </p>
              )}
              {reverse && <WaybillRow shipment={reverse} />}
              {openReturn.refundedAt && (
                <p className="text-muted-foreground">
                  Refund of {fmt(openReturn.refundAmount ?? order.totalAmount)} issued on{" "}
                  {formatDateTime(openReturn.refundedAt)}.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Money ────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{fmt(order.subtotalAmount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">GST ({order.gstRatePct}%)</span>
              <span>{fmt(order.gstAmount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span>{order.shippingAmount ? fmt(order.shippingAmount) : "Free"}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-2 font-semibold">
              <span>Total</span>
              <span>{fmt(order.totalAmount)}</span>
            </div>
            {order.paidAt && (
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Paid</span>
                <span>{formatDateTime(order.paidAt)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Placed</span>
              <span>{formatDateTime(order.createdAt)}</span>
            </div>
          </CardContent>
        </Card>

        {/* ── Address ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Delivery address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>{order.buyerName}</p>
            <p className="text-muted-foreground">{order.buyerAddress}</p>
            {(order.buyerCity || order.buyerPincode) && (
              <p className="text-muted-foreground">
                {[order.buyerCity, order.buyerState, order.buyerPincode]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
            <p className="text-muted-foreground">{order.buyerPhone}</p>
            <p className="text-muted-foreground">{order.buyerEmail}</p>
          </CardContent>
        </Card>

        {/* ── Items ────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{item.productName}</p>
                  <p className="font-semibold">{fmt(item.lineTotal)}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Qty {item.quantity} x {fmt(item.unitPrice)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this order?"
        description={
          order.paymentStatus === "COMPLETED"
            ? "We will call the parcel off and refund what you paid. Refunds usually reach the bank in 5–7 days."
            : "We will call the parcel off. Nothing has been charged."
        }
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        loading={working}
        onConfirm={cancelOrder}
      />

      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return this order</DialogTitle>
            <DialogDescription>
              Tell us what went wrong. Once approved we book a pickup from your delivery address,
              and the refund follows when the parcel reaches us.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="returnReason">Reason</Label>
              <Select
                value={returnReason}
                onValueChange={(value) => setReturnReason(value as ReturnReason)}
              >
                <SelectTrigger id="returnReason">
                  <SelectValue placeholder="Choose a reason" />
                </SelectTrigger>
                <SelectContent>
                  {RETURN_REASONS.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="returnComment">Anything else? (optional)</Label>
              <Textarea
                id="returnComment"
                rows={3}
                value={returnComment}
                onChange={(e) => setReturnComment(e.target.value)}
                placeholder="The seal was broken when it arrived…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnOpen(false)} disabled={working}>
              Not now
            </Button>
            <Button onClick={requestReturn} disabled={working}>
              {working ? "Sending…" : "Request return"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
