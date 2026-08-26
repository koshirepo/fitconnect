import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { tenantsApi } from "@/api/tenants";
import { useUpdateTenantStatus } from "@/api/queries/platform";
import { getApiError } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { TenantPublicProfileCard } from "@/components/tenants/TenantPublicProfileCard";
import AvatarCard from "@/components/ui/avatarCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { DetailPageSkeleton } from "@/components/ui/skeleton";
import { resolveAssetUrl } from "@/lib/assets";
import { buildTenantPublicUrl } from "@/lib/subdomain";
import { cn, formatDate } from "@/lib/utils";
import { appendUniqueById, useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { formatCurrency } from "@fitconnect/shared";
import type { Tenant, TenantMember, PlatformPayment } from "@/types/api";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CreditCard,
  Globe,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Users,
} from "lucide-react";

type MemberSummary = {
  admins: number;
  coaches: number;
  members: number;
};

export default function TenantDetails() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const canManageStatus = useAuthStore((s) => s.user?.platformRole === "SUPER_ADMIN");
  const updateTenantStatus = useUpdateTenantStatus();

  // Read once for this mount rather than per render, so the expiry countdown is
  // stable and the render stays pure.
  const [renderedAt] = React.useState(() => Date.now());
  const [loading, setLoading] = React.useState(true);
  const [statusUpdating, setStatusUpdating] = React.useState(false);
  const [tenant, setTenant] = React.useState<Tenant | null>(null);
  const [adminMembers, setAdminMembers] = React.useState<TenantMember[]>([]);
  const [memberSummary, setMemberSummary] = React.useState<MemberSummary | null>(null);
  const [error, setError] = React.useState("");

  // Platform billing state
  const [platformPayments, setPlatformPayments] = React.useState<PlatformPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = React.useState(false);
  const [paymentsLoadingMore, setPaymentsLoadingMore] = React.useState(false);
  const [paymentsHasMore, setPaymentsHasMore] = React.useState(true);
  const [paymentsPage, setPaymentsPage] = React.useState(1);

  const loadTenant = React.useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const tenantRes = await tenantsApi.get(tenantId);
      const tenantData = tenantRes.data.data.tenant;
      setTenant(tenantData);

      try {
        const [adminsTotalRes, coachesTotalRes, membersTotalRes, adminsRes] = await Promise.all([
          tenantsApi.listMembers(tenantData.id, 1, 1, "ADMIN"),
          tenantsApi.listMembers(tenantData.id, 1, 1, "COACH"),
          tenantsApi.listMembers(tenantData.id, 1, 1, "MEMBER"),
          tenantsApi.listMembers(tenantData.id, 1, 5, "ADMIN"),
        ]);

        setMemberSummary({
          admins: adminsTotalRes.data.meta.total,
          coaches: coachesTotalRes.data.meta.total,
          members: membersTotalRes.data.meta.total,
        });
        setAdminMembers(adminsRes.data.data.members);
      } catch {
        setMemberSummary(null);
        setAdminMembers([]);
      }
    } catch (err) {
      setTenant(null);
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  React.useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  const handleToggleStatus = async () => {
    if (!tenant || !canManageStatus) return;

    const nextStatus = tenant.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setStatusUpdating(true);
    setError("");

    try {
      // Also invalidates the tenants list, so the platform table agrees with
      // the badge shown here.
      await updateTenantStatus.mutateAsync({ tenantId: tenant.id, status: nextStatus });
      setTenant((prev) => (prev ? { ...prev, status: nextStatus } : prev));
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setStatusUpdating(false);
    }
  };

  const loadPlatformPayments = React.useCallback(
    async (slug: string, nextPage: number, mode: "replace" | "append") => {
      if (!canManageStatus) return;
      if (mode === "replace") {
        setPaymentsLoading(true);
      } else {
        setPaymentsLoadingMore(true);
      }
      try {
        const res = await tenantsApi.listPlatformPayments(slug, nextPage, 10);
        const nextPayments = res.data.data.payments;
        setPlatformPayments((prev) =>
          mode === "replace" ? nextPayments : appendUniqueById(prev, nextPayments),
        );
        const totalPages = res.data.meta.totalPages;
        setPaymentsHasMore(nextPage < totalPages);
        setPaymentsPage(nextPage);
      } catch {
        // silent
      } finally {
        if (mode === "replace") {
          setPaymentsLoading(false);
        } else {
          setPaymentsLoadingMore(false);
        }
      }
    },
    [canManageStatus],
  );

  React.useEffect(() => {
    if (!tenantId || !canManageStatus) return;
    setPlatformPayments([]);
    setPaymentsHasMore(true);
    void loadPlatformPayments(tenantId, 1, "replace");
  }, [tenantId, canManageStatus, loadPlatformPayments]);

  const loadMorePayments = React.useCallback(() => {
    if (!tenantId || !canManageStatus || paymentsLoading || paymentsLoadingMore || !paymentsHasMore)
      return;
    void loadPlatformPayments(tenantId, paymentsPage + 1, "append");
  }, [
    tenantId,
    canManageStatus,
    paymentsLoading,
    paymentsLoadingMore,
    paymentsHasMore,
    paymentsPage,
    loadPlatformPayments,
  ]);

  const loadMorePaymentsRef = useInfiniteScroll({
    hasMore: canManageStatus && paymentsHasMore,
    loading: paymentsLoading || paymentsLoadingMore,
    onLoadMore: loadMorePayments,
  });

  if (loading) return <DetailPageSkeleton />;

  if (!tenant) {
    return (
      <Card>
        <CardContent className="space-y-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">{error || "Tenant not found."}</p>
          <Link to="/tenants" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Tenants
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Link to="/tenants" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{tenant.name}</h1>
            <div className="mt-1 flex flex-wrap gap-2">
              <Badge variant={tenant.status === "ACTIVE" ? "success" : "destructive"}>
                {tenant.status}
              </Badge>
              <Badge variant="secondary">{tenant.slug}</Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={buildTenantPublicUrl(tenant.slug)}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <Globe className="mr-2 h-4 w-4" />
            Public Page
          </a>
          {canManageStatus && (
            <Button
              variant={tenant.status === "ACTIVE" ? "destructive" : "default"}
              onClick={handleToggleStatus}
              disabled={statusUpdating}
            >
              {statusUpdating
                ? "Updating..."
                : tenant.status === "ACTIVE"
                  ? "Suspend Tenant"
                  : "Activate Tenant"}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tenant Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border bg-muted">
                {tenant.logoUrl ? (
                  <img
                    src={resolveAssetUrl(tenant.logoUrl) ?? tenant.logoUrl}
                    alt={`${tenant.name} logo`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Building2 className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-60 flex-1 space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  Created on {formatDate(tenant.createdAt)}
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{tenant.email || "No tenant email provided"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{tenant.phone || "No tenant phone provided"}</span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <span>{tenant.address || "No tenant address provided"}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Admins</p>
                <p className="text-xl font-semibold">{memberSummary?.admins ?? "--"}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Coaches</p>
                <p className="text-xl font-semibold">{memberSummary?.coaches ?? "--"}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Members</p>
                <p className="text-xl font-semibold">{memberSummary?.members ?? "--"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Admin Team
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {adminMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No admin users found for this tenant.</p>
            ) : (
              adminMembers.map((admin) => (
                <div key={admin.id} className="rounded-lg border p-3">
                  <AvatarCard
                    name={admin.name}
                    avatarUrl={admin.avatarUrl}
                    variant="sm"
                    role="ADMIN"
                    isActive={true}
                  >
                    <p className="text-xs text-muted-foreground">{admin.email}</p>
                    <p className="text-xs text-muted-foreground">{admin.phone || "No phone"}</p>
                  </AvatarCard>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <TenantPublicProfileCard
        tenant={tenant}
        onSaved={setTenant}
        description="Update the public-facing profile shown on this tenant's gym page."
      />

      <Card>
        <CardHeader>
          <CardTitle>Short Description</CardTitle>
        </CardHeader>
        <CardContent>
          {tenant.description?.trim() ? (
            <p className="text-sm">{tenant.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No short description added yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About / Description</CardTitle>
        </CardHeader>
        <CardContent>
          {tenant.markdown?.trim() ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                {tenant.markdown}
              </Markdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No description added yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Platform Billing — SUPER_ADMIN only */}
      {canManageStatus && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Platform Billing
              </CardTitle>
              <Button
                size="sm"
                onClick={() => navigate(`/tenants/${tenantId}/payments/record`)}
              >
                Record Payment
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current expiry */}
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Platform Access Until</p>
                {tenant.platformExpiresAt ? (
                  <p className="font-semibold">{formatDate(tenant.platformExpiresAt)}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Not set</p>
                )}
              </div>
              {tenant.platformExpiresAt &&
                (() => {
                  const daysLeft = Math.ceil(
                    (new Date(tenant.platformExpiresAt).getTime() - renderedAt) / 86400000,
                  );
                  if (daysLeft < 0) return <Badge variant="destructive">Expired</Badge>;
                  if (daysLeft <= 7) return <Badge variant="warning">Expires in {daysLeft}d</Badge>;
                  return <Badge variant="success">Active</Badge>;
                })()}
              {!tenant.platformExpiresAt && <Badge variant="secondary">No expiry</Badge>}
            </div>

            {/* Payment history */}
            {paymentsLoading ? (
              <p className="text-sm text-muted-foreground">Loading payments…</p>
            ) : platformPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No platform payments recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-2 text-left font-medium text-muted-foreground">Date</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Amount</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">
                        Extends Until
                      </th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Note</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">
                        Recorded By
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {platformPayments.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2">{formatDate(p.createdAt)}</td>
                        <td className="py-2 font-medium">{formatCurrency(p.amount)}</td>
                        <td className="py-2">{formatDate(p.extendsUntil)}</td>
                        <td className="py-2 text-muted-foreground">{p.note ?? "—"}</td>
                        <td className="py-2">{p.recordedByUser.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {platformPayments.length > 0 && (paymentsHasMore || paymentsLoadingMore) && (
                  <div
                    ref={loadMorePaymentsRef}
                    className="mt-3 flex items-center justify-center text-sm text-muted-foreground"
                  >
                    {paymentsLoadingMore ? (
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
          </CardContent>
        </Card>
      )}

    </div>
  );
}
