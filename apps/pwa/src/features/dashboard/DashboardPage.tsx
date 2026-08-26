import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useMembers, useMyProfile } from "@/api/queries/members";
import { useMyPayments, usePayments } from "@/api/queries/payments";
import { useWorkoutPlans } from "@/api/queries/catalog";
import {
  useAdminOrders,
  useAdminProducts,
  usePlatformAuditLogs,
  useTenants,
} from "@/api/queries/platform";
import { useAuthStore } from "@/stores/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatGridSkeleton, CardsGridSkeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { getTenantDashboardPath } from "@/lib/subdomain";
import {
  Building2,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CreditCard,
  Dumbbell,
  PackageOpen,
  ScrollText,
  ShoppingBag,
  Users,
} from "lucide-react";
import type { TenantProfile } from "@/types/api";

function toDateOnly(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function getSubscriptionStatus(profile: TenantProfile | null) {
  if (!profile?.dueDate) {
    return {
      state: "none" as const,
      label: "No active subscription",
      detail: "No subscription expiry date is available.",
      days: null as number | null,
      dueDate: null as string | null,
    };
  }

  const today = toDateOnly(new Date());
  const due = toDateOnly(new Date(profile.dueDate));
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);

  if (diffDays >= 0) {
    return {
      state: "current" as const,
      label: "Subscription active",
      detail: diffDays === 0 ? "Expires today" : `${diffDays} day${diffDays !== 1 ? "s" : ""} left`,
      days: diffDays,
      dueDate: profile.dueDate,
    };
  }

  const overdueDays = Math.abs(diffDays);
  return {
    state: "overdue" as const,
    label: "Subscription overdue",
    detail: `${overdueDays} overdue day${overdueDays !== 1 ? "s" : ""}`,
    days: overdueDays,
    dueDate: profile.dueDate,
  };
}

export default function DashboardPage() {
  const {
    currentTenantId,
    currentMembership,
    user,
    isPlatformStaff,
  } = useAuthStore();
  const { can } = usePermissions();
  const navigate = useAppNavigate();

  const membership = currentMembership();
  const showPlatformDashboard = isPlatformStaff() && !currentTenantId;
  const canManagePlatformOrders = can(Permission.PLATFORM_ORDERS_UPDATE);
  // Staff-level gym views vs. the member view of their own records.
  const canViewGymMembers = can(Permission.MEMBERS_READ);
  const canViewAllPayments = can(Permission.PAYMENTS_READ);
  const canViewFinance = can(Permission.PAYMENTS_ANALYTICS_READ);
  // ─── Platform overview ──────────────────────────────────────────────────────
  // Each query is disabled unless this session actually renders that panel, so a
  // gym member never issues platform requests and vice versa.
  const tenantsQuery = useTenants(1, 5, { enabled: showPlatformDashboard });
  const productsQuery = useAdminProducts({ page: 1, limit: 5 }, { enabled: showPlatformDashboard });
  const platformLogsQuery = usePlatformAuditLogs(
    { page: 1, limit: 5 },
    { enabled: showPlatformDashboard },
  );
  const platformOrdersQuery = useAdminOrders(
    { page: 1, limit: 5 },
    { enabled: showPlatformDashboard && canManagePlatformOrders },
  );

  const platformTenants = tenantsQuery.data?.data.tenants ?? [];
  const tenantTotal = tenantsQuery.data?.meta.total ?? 0;
  const productTotal = productsQuery.data?.meta.total ?? 0;
  const platformLogs = platformLogsQuery.data?.data.logs ?? [];
  const auditTotal = platformLogsQuery.data?.meta.total ?? 0;
  const platformOrders = platformOrdersQuery.data?.data.orders ?? [];
  const orderTotal = platformOrdersQuery.data?.meta.total ?? 0;
  const platformError =
    showPlatformDashboard && (tenantsQuery.isError || platformLogsQuery.isError)
      ? "Failed to load platform overview."
      : "";

  // ─── Gym overview ───────────────────────────────────────────────────────────
  const isTenantDashboard = !showPlatformDashboard && Boolean(currentTenantId);
  const profileQuery = useMyProfile({ enabled: isTenantDashboard });
  const workoutsQuery = useWorkoutPlans(1, 5);
  // Staff read the gym-wide ledger; members read their own receipts.
  const recentPaymentsQuery = usePayments(
    { page: 1, limit: 5 },
    { enabled: isTenantDashboard && canViewAllPayments },
  );
  const myPaymentsQuery = useMyPayments({
    enabled: isTenantDashboard && !canViewAllPayments,
  });
  // A one-row page: only the total matters for the member-count tile.
  const memberCountQuery = useMembers(
    { page: 1, limit: 1 },
    { enabled: isTenantDashboard && canViewGymMembers },
  );

  const profile = profileQuery.data ?? null;
  const workoutPlans = workoutsQuery.data?.data.plans ?? [];
  const recentPayments = canViewAllPayments
    ? (recentPaymentsQuery.data?.data.payments ?? [])
    : (myPaymentsQuery.data ?? []);
  const memberCount = memberCountQuery.data?.meta.total ?? 0;

  const loading = showPlatformDashboard
    ? tenantsQuery.isLoading || platformLogsQuery.isLoading
    : isTenantDashboard && (profileQuery.isLoading || workoutsQuery.isLoading);

  const subscriptionStatus = getSubscriptionStatus(profile);
  const latestSubscriptionPayment = profile?.payments?.find((payment) => payment.validUntil);

  if (loading) return (<div className="space-y-6"><StatGridSkeleton /><CardsGridSkeleton /></div>);

  if (showPlatformDashboard) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Platform Dashboard</h1>
            <div className="text-muted-foreground">
              Welcome back, {user?.name}!{" "}
              <Badge variant="accent" className="ml-1">
                {user?.platformRole ?? "Platform Staff"}
              </Badge>
            </div>
          </div>
        </div>

        {platformError && (
          <Card className="border-destructive bg-destructive/5">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">{platformError}</p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="cursor-pointer" onClick={() => navigate("/tenants")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Tenants</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{tenantTotal}</div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer" onClick={() => navigate("/platform-commerce")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Catalog Products</CardTitle>
              <PackageOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{productTotal}</div>
            </CardContent>
          </Card>

          {canManagePlatformOrders && (
            <Card className="cursor-pointer" onClick={() => navigate("/platform-commerce/orders")}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Orders</CardTitle>
                <ShoppingBag className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{orderTotal}</div>
              </CardContent>
            </Card>
          )}

          <Card className="cursor-pointer" onClick={() => navigate("/platform-audit")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Audit Logs</CardTitle>
              <ScrollText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{auditTotal}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common platform admin tasks</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button onClick={() => navigate("/tenants/add")}>Create Tenant</Button>
              <Button variant="outline" onClick={() => navigate("/platform-commerce/create")}>
                Create Product
              </Button>
              {canManagePlatformOrders && (
                <Button variant="outline" onClick={() => navigate("/platform-commerce/orders")}>
                  View Orders
                </Button>
              )}
              <Button variant="outline" onClick={() => navigate("/platform-audit")}>
                Open Audit Logs
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Tenants</CardTitle>
              <CardDescription>Newest tenants added to the platform</CardDescription>
            </CardHeader>
            <CardContent>
              {platformTenants.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tenants available.</p>
              ) : (
                <div className="space-y-3">
                  {platformTenants.map((tenant) => (
                    <div
                      key={tenant.id}
                      onClick={() => navigate(`/tenants/${tenant.id}`)}
                      className="flex cursor-pointer items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{tenant.name}</p>
                        <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant={tenant.status === "ACTIVE" ? "success" : "secondary"}>
                          {tenant.status}
                        </Badge>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(tenant.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {canManagePlatformOrders && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Orders</CardTitle>
                <CardDescription>Latest commerce orders across the platform</CardDescription>
              </CardHeader>
              <CardContent>
                {platformOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No orders yet.</p>
                ) : (
                  <div className="space-y-3">
                    {platformOrders.map((order) => (
                      <div
                        key={order.id}
                        onClick={() => navigate(`/platform-commerce/orders/${order.id}`)}
                        className="flex cursor-pointer items-center justify-between gap-3"
                      >
                        <div>
                          <p className="text-sm font-medium">{order.id}</p>
                          <p className="text-xs text-muted-foreground">
                            {order.buyerName} | {order.buyerEmail}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">{formatCurrency(order.totalAmount)}</p>
                          <Badge variant={order.status === "DELIVERED" ? "success" : order.status === "PENDING" ? "warning" : "secondary"}>
                            {order.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Recent Audit Activity</CardTitle>
              <CardDescription>Latest platform-level actions</CardDescription>
            </CardHeader>
            <CardContent>
              {platformLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No audit logs yet.</p>
              ) : (
                <div className="space-y-3">
                  {platformLogs.map((log) => (
                    <div
                      key={log.id}
                      onClick={() => navigate("/platform-audit")}
                      className="flex cursor-pointer items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {log.action} {log.entity}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {log.actor?.name ?? "System"}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(log.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!currentTenantId) {
    return (
      <EmptyState
        icon={Building2}
        title="No Gym Selected"
        description="You haven't joined any gym yet. Contact your gym administrator."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <div className="text-muted-foreground">
            Welcome back, {user?.name}!{" "}
            {membership && (
              <Badge variant="secondary" className="ml-1">
                {membership.tenantName}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {!canViewGymMembers && (
          <Card className="cursor-pointer" onClick={() => navigate("/profile")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Subscription Status</CardTitle>
              {subscriptionStatus.state === "current" ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : subscriptionStatus.state === "overdue" ? (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              ) : (
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
              )}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {subscriptionStatus.state === "current"
                  ? subscriptionStatus.days === 0
                    ? "Today"
                    : `${subscriptionStatus.days}d`
                  : subscriptionStatus.state === "overdue"
                    ? `${subscriptionStatus.days}d`
                    : "-"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {subscriptionStatus.detail}
              </p>
            </CardContent>
          </Card>
        )}

        {canViewGymMembers && (
          <Card className="cursor-pointer" onClick={() => navigate(getTenantDashboardPath("/members"))}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Members</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{memberCount}</div>
            </CardContent>
          </Card>
        )}

        <Card className="cursor-pointer" onClick={() => navigate("/workouts")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Workout Plans</CardTitle>
            <Dumbbell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workoutPlans.length}</div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer" onClick={() => navigate("/payments")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {canViewAllPayments ? "Recent Payments" : "My Payments"}
            </CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentPayments.length}</div>
          </CardContent>
        </Card>

        {canViewFinance && (
          <Card className="cursor-pointer" onClick={() => navigate("/finance")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Finance Analytics</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
          </Card>
        )}
      </div>

      {!canViewGymMembers && profile && (
        <Card
          className={
            subscriptionStatus.state === "overdue"
              ? "border-destructive/40 bg-destructive/5"
              : subscriptionStatus.state === "current"
                ? "border-green-500/30 bg-green-500/5"
                : ""
          }
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {subscriptionStatus.state === "current" ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : subscriptionStatus.state === "overdue" ? (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              ) : (
                <CalendarClock className="h-5 w-5 text-muted-foreground" />
              )}
              My Subscription
            </CardTitle>
            <CardDescription>{subscriptionStatus.label}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Plan</p>
              <p className="text-sm font-medium">
                {latestSubscriptionPayment?.subscription?.title ?? "No plan recorded"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Valid Until</p>
              <p className="text-sm font-medium">
                {subscriptionStatus.dueDate ? formatDate(subscriptionStatus.dueDate) : "-"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {subscriptionStatus.state === "overdue" ? "Overdue" : "Remaining"}
              </p>
              <p className="flex items-center gap-2 text-sm font-medium">
                <Clock3 className="h-4 w-4 text-muted-foreground" />
                {subscriptionStatus.detail}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Payments</CardTitle>
            <CardDescription>
              {canViewAllPayments ? "Latest payments across the gym" : "Your recent payment history"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              <div className="space-y-3">
                {recentPayments.slice(0, 5).map((payment) => (
                  <div
                    key={payment.id}
                    onClick={() => navigate(`/payments/${payment.id}`)}
                    className="flex cursor-pointer items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {payment.subscription?.title ?? "Payment"}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(payment.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatCurrency(payment.amount)}</p>
                      <Badge
                        variant={
                          payment.status === "COMPLETED"
                            ? "success"
                            : payment.status === "PENDING"
                              ? "warning"
                              : "destructive"
                        }
                      >
                        {payment.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{canViewGymMembers ? "Recent Workout Plans" : "Your Workout Plans"}</CardTitle>
            <CardDescription>Active workout programs</CardDescription>
          </CardHeader>
          <CardContent>
            {workoutPlans.length === 0 ? (
              <p className="text-sm text-muted-foreground">No workout plans yet.</p>
            ) : (
              <div className="space-y-3">
                {workoutPlans.map((plan) => (
                  <div
                    onClick={() => navigate(`/workouts/${plan.id}`)}
                    key={plan.id}
                    className="flex cursor-pointer items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium">{plan.title}</p>
                      <p className="text-xs text-muted-foreground">
                        by {plan.creator?.name ?? "Unknown"}
                      </p>
                    </div>
                    {plan._count && (
                      <Badge variant="secondary">{plan._count.assignments} assigned</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {profile && (
        <Card>
          <CardHeader>
            <CardTitle>Your Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <span className="text-muted-foreground">Name:</span> {profile.name}
              </div>
              <div>
                <span className="text-muted-foreground">Email:</span> {profile.email}
              </div>
              <div>
                <span className="text-muted-foreground">Joined:</span> {formatDate(profile.joinedAt)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
