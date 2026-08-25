import * as React from "react";
import { useNavigate } from "react-router-dom";
import { tenantsApi } from "@/api/tenants";
import { getApiError } from "@/api/client";
import { TenantPublicProfileCard } from "@/components/tenants/TenantPublicProfileCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { useAuthStore } from "@/stores/auth";
import type { Tenant } from "@/types/api";
import { ArrowLeft } from "lucide-react";

export default function PublicPageSettingsPage() {
  const navigate = useNavigate();
  const currentTenantId = useAuthStore((s) => s.currentTenantId);
  const [tenant, setTenant] = React.useState<Tenant | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!currentTenantId) {
      setError("Missing tenant context.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    tenantsApi
      .get(currentTenantId)
      .then((res) => {
        setTenant(res.data.data.tenant);
      })
      .catch((err) => {
        setTenant(null);
        setError(getApiError(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [currentTenantId]);

  if (loading) return <PageLoader />;

  if (!tenant) {
    return (
      <Card>
        <CardContent className="space-y-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">{error || "Tenant not found."}</p>
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => navigate("/settings")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Public Page</h1>
          <p className="text-muted-foreground">
            Manage the details shown on your gym&apos;s public page.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/settings")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>
      </div>

      <TenantPublicProfileCard
        tenant={tenant}
        onSaved={setTenant}
        description="Update the public-facing profile for your gym."
      />
    </div>
  );
}
