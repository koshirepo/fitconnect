import * as React from "react";
import { useNavigate } from "react-router-dom";
import { auditApi } from "@/api/audit";
import { commerceApi } from "@/api/commerce";
import { tenantsApi } from "@/api/tenants";
import { paymentsApi } from "@/api/payments";
import { workoutsApi } from "@/api/workouts";
import { useAuthStore } from "@/stores/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoader } from "@/components/ui/spinner";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import {
  Building2,
  CreditCard,
  Dumbbell,
  PackageOpen,
  ScrollText,
  ShoppingBag,
  Users,
} from "lucide-react";
import type { AuditLog, Order, Payment, Tenant, TenantProfile, WorkoutPlan } from "@/types/api";

export default function DashboardPage() {
  const {
    currentTenantId,
    currentMembership,
    user,
    isPlatformStaff,
    isSuperAdmin,
  } = useAuthStore();
  const navigate = useNavigate();

  const [loading, setLoading] = React.useState(true);

  const [profile, setProfile] = React.useState<TenantProfile | null>(null);
  const [recentPayments, setRecentPayments] = React.useState<Payment[]>([]);
  const [workoutPlans, setWorkoutPlans] = React.useState<WorkoutPlan[]>([]);
  const [memberCount, setMemberCount] = React.useState(0);

  const [platformError, setPlatformError] = React.useState("");
  const [platformTenants, setPlatformTenants] = React.useState<Tenant[]>([]);
  const [platformOrders, setPlatformOrders] = React.useState<Order[]>([]);
  const [platformLogs, setPlatformLogs] = React.useState<AuditLog[]>([]);
  const [tenantTotal, setTenantTotal] = React.useState(0);
  const [productTotal, setProductTotal] = React.useState(0);
  const [orderTotal, setOrderTotal] = React.useState(0);
  const [auditTotal, setAuditTotal] = React.useState(0);

  const membership = currentMembership();
  const role = membership?.role;
  const showPlatformDashboard = isPlatformStaff() && !currentTenantId;
  const canManagePlatformOrders = isSuperAdmin();

  React.useEffect(() => {
    if (showPlatformDashboard) {
      const loadPlatform = async () => {
        setLoading(true);
        setPlatformError("");

        try {
          const [tenantsRes, productsRes, logsRes, ordersRes] = await Promise.all([
            tenantsApi.list(1, 5),
            commerceApi.listAdminProducts(1, 5, true),
            auditApi.platformLogs(1, 5),
            canManagePlatformOrders ? commerceApi.listAdminOrders(1, 5) : Promise.resolve(null),
          ]);

          setPlatformTenants(tenantsRes.data.data.tenants);
          setTenantTotal(tenantsRes.data.meta.total);

          setProductTotal(productsRes.data.meta.total);

          setPlatformLogs(logsRes.data.data.logs);
          setAuditTotal(logsRes.data.meta.total);

          if (ordersRes) {
            setPlatformOrders(ordersRes.data.data.orders);
            setOrderTotal(ordersRes.data.meta.total);
          } else {
            setPlatformOrders([]);
            setOrderTotal(0);
          }
        } catch {
          setPlatformError("Failed to load platform overview.");
        } finally {
          setLoading(false);
        }
      };

      void loadPlatform();
      return;
    }

    if (!currentTenantId) {
      setLoading(false);
      return;
    }

    const loadTenantDashboard = async () => {
      setLoading(true);
      try {
        const [profileRes, workoutsRes] = await Promise.all([
          tenantsApi.getMyProfile(currentTenantId),
          workoutsApi.list(currentTenantId, 1, 5),
        ]);
        setProfile(profileRes.data.data.profile);
        setWorkoutPlans(workoutsRes.data.data.plans);

        if (role === "ADMIN" || role === "COACH") {
          const [membersRes, paymentsRes] = await Promise.all([
            tenantsApi.listMembers(currentTenantId, 1, 1),
            role === "ADMIN"
              ? paymentsApi.list(currentTenantId, 1, 5)
              : paymentsApi.myPayments(currentTenantId),
          ]);
          setMemberCount(membersRes.data.meta.total);
          const paymentData = paymentsRes.data as {
            data: { payments: Payment[] };
            success: boolean;
          };
          setRecentPayments(paymentData.data.payments);
        } else {
          const myPayments = await paymentsApi.myPayments(currentTenantId);
          setRecentPayments(myPayments.data.data.payments);
        }
      } catch {
        // Silently fail for tenant dashboard to preserve existing behavior.
      } finally {
        setLoading(false);
      }
    };

    void loadTenantDashboard();
  }, [currentTenantId, role, showPlatformDashboard, canManagePlatformOrders]);

  if (loading) return <PageLoader />;

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
        {(role === "ADMIN" || role === "COACH") && (
          <Card className="cursor-pointer" onClick={() => navigate("/members")}>
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
              {role === "ADMIN" ? "Recent Payments" : "My Payments"}
            </CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentPayments.length}</div>
          </CardContent>
        </Card>

        {role === "ADMIN" && (
          <Card className="cursor-pointer" onClick={() => navigate("/finance")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Finance Analytics</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
          </Card>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Payments</CardTitle>
            <CardDescription>
              {role === "ADMIN" ? "Latest payments across the gym" : "Your recent payment history"}
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
            <CardTitle>{role === "MEMBER" ? "Your Workout Plans" : "Recent Workout Plans"}</CardTitle>
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
