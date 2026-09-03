import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search } from "lucide-react";
import { useSeo } from "@/lib/seo";

export default function PublicOrderLookupPage() {
  useSeo({
    title: "Find Your Order",
    description: "Look up an order with its number and the phone number it was placed with.",
    canonicalPath: "/shop/orders/lookup",
  });

  const navigate = useNavigate();
  const [orderId, setOrderId] = React.useState("");

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId.trim()) return;
    navigate(`/shop/orders/${orderId.trim()}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-xl px-4 py-10 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Lookup Order Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLookup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orderId">Order ID</Label>
                <Input
                  id="orderId"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="Enter your order ID"
                />
              </div>
              <Button type="submit" className="w-full" disabled={!orderId.trim()}>
                Check Status
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
