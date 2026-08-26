import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { commerceApi } from "@/api/commerce";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DetailPageSkeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/utils";
import { ArrowLeft, PackageSearch } from "lucide-react";
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

export default function PublicOrderStatusPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = React.useState<Order | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    setError("");
    commerceApi
      .getOrderById(orderId)
      .then((res) => setOrder(res.data.data.order))
      .catch((err: unknown) => setError(getApiError(err)))
      .finally(() => setLoading(false));
  }, [orderId]);

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

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Order Confirmation</h1>
            <p className="text-muted-foreground">Order ID: {order.id}</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/shop")}>
            <ArrowLeft className="h-4 w-4" />
            Back to Catalog
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Order Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Current Status</span>
              <Badge variant={STATUS_STYLE[order.status] ?? "secondary"}>{order.status}</Badge>
            </div>
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
              <span className="text-muted-foreground">Total Amount</span>
              <span className="font-semibold">{fmt(order.totalAmount)}</span>
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
            <p className="text-muted-foreground">{order.buyerAddress}</p>
          </CardContent>
        </Card>

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
    </div>
  );
}
