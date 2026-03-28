import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { paymentsApi } from "@/api/payments";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/utils";
import { Plus, Package } from "lucide-react";
import type { Subscription } from "@/types/api";

export default function SubscriptionsPage() {
  const navigate = useNavigate();
  const { currentTenantId, tenantRole } = useAuthStore();
  const role = tenantRole();
  const isAdmin = role === "ADMIN";

  const [subscriptions, setSubscriptions] = React.useState<Subscription[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchSubscriptions = React.useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      const res = await paymentsApi.listSubscriptions(currentTenantId);
      setSubscriptions(res.data.data.subscriptions);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, [currentTenantId]);

  React.useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
          <p className="text-muted-foreground">
            {isAdmin ? "Manage subscription plans" : "Available plans"}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => navigate("/subscriptions/create")}>
            <Plus className="h-4 w-4" />
            New Plan
          </Button>
        )}
      </div>

      {loading ? (
        <PageLoader />
      ) : subscriptions.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No subscription plans"
          description={
            isAdmin ? "Create subscription plans for your gym members." : "No plans available yet."
          }
          action={
            isAdmin ? (
              <Button onClick={() => navigate("/subscriptions/create")}>
                <Plus className="h-4 w-4" />
                Create Plan
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subscriptions.map((sub) => (
            <Card key={sub.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{sub.title}</CardTitle>
                  <Badge variant={sub.isActive ? "success" : "secondary"}>
                    {sub.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                {sub.description && <CardDescription>{sub.description}</CardDescription>}
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{formatCurrency(sub.amount)}</span>
                  <span className="text-muted-foreground">/ {sub.durationDays} days</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
