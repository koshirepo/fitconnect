import * as React from "react";
import { useAuthStore } from "@/stores/auth";
import { tenantsApi } from "@/api/tenants";
import { paymentsApi } from "@/api/payments";
import { workoutsApi } from "@/api/workouts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Users, CreditCard, Dumbbell, Building2, FileBarChart } from "lucide-react";
import type { TenantProfile, Payment, WorkoutPlan } from "@/types/api";
import { useNavigate } from "react-router-dom";

export default function DashboardPage() {
  const { currentTenantId, currentMembership, user, isPlatformStaff } = useAuthStore();
  const navigate = useNavigate();

  const [loading, setLoading] = React.useState(true);
  const [profile, setProfile] = React.useState<TenantProfile | null>(null);
  const [recentPayments, setRecentPayments] = React.useState<Payment[]>([]);
  const [workoutPlans, setWorkoutPlans] = React.useState<WorkoutPlan[]>([]);
  const [memberCount, setMemberCount] = React.useState(0);

  const membership = currentMembership();
  const role = membership?.role;

  React.useEffect(() => {
    if (!currentTenantId) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const [profileRes, workoutsRes] = await Promise.all([
          tenantsApi.getMyProfile(currentTenantId),
          workoutsApi.list(currentTenantId, 1, 5),
        ]);
        setProfile(profileRes.data.data.profile);
        setWorkoutPlans(workoutsRes.data.data.plans);

        // Admin-only data
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
        // Silently fail for dashboard
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [currentTenantId, role]);

  if (loading) return <PageLoader />;

  if (!currentTenantId) {
    return (
      <EmptyState
        icon={Building2}
        title={isPlatformStaff() ? "Platform Dashboard" : "No Gym Selected"}
        description={
          isPlatformStaff()
            ? "Use the sidebar to manage tenants and platform settings."
            : "You haven't joined any gym yet. Contact your gym administrator."
        }
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
        {role === "ADMIN" && (
          <Button onClick={() => navigate("/finance")} variant="outline" size="sm">
            <FileBarChart className="h-4 w-4 mr-2" />
            Finance & Reports
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(role === "ADMIN" || role === "COACH") && (
          <Card onClick={() => navigate("/members")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Members</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{memberCount}</div>
            </CardContent>
          </Card>
        )}

        <Card onClick={() => navigate("/workouts")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Workout Plans</CardTitle>
            <Dumbbell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workoutPlans.length}</div>
          </CardContent>
        </Card>

        <Card onClick={() => navigate("/payments")}>
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
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Payments */}
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
                {recentPayments.slice(0, 5).map((p) => (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/payments/${p.id}`)}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium">{p.subscription?.title ?? "Payment"}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatCurrency(p.amount)}</p>
                      <Badge
                        variant={
                          p.status === "COMPLETED"
                            ? "success"
                            : p.status === "PENDING"
                              ? "warning"
                              : "destructive"
                        }
                      >
                        {p.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Workout Plans */}
        <Card>
          <CardHeader>
            <CardTitle>
              {role === "MEMBER" ? "Your Workout Plans" : "Recent Workout Plans"}
            </CardTitle>
            <CardDescription>Active workout programs</CardDescription>
          </CardHeader>
          <CardContent>
            {workoutPlans.length === 0 ? (
              <p className="text-sm text-muted-foreground">No workout plans yet.</p>
            ) : (
              <div className="space-y-3">
                {workoutPlans.map((wp) => (
                  <div
                    onClick={() => navigate(`/workouts/${wp.id}`)}
                    key={wp.id}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium">{wp.title}</p>
                      <p className="text-xs text-muted-foreground">
                        by {wp.creator?.name ?? "Unknown"}
                      </p>
                    </div>
                    {wp._count && (
                      <Badge variant="secondary">{wp._count.assignments} assigned</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Profile summary */}
      {profile && (
        <Card>
          <CardHeader>
            <CardTitle>Your Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-3 text-sm">
              <div>
                <span className="text-muted-foreground">Name:</span> {profile.name}
              </div>
              <div>
                <span className="text-muted-foreground">Email:</span> {profile.email}
              </div>
              <div>
                <span className="text-muted-foreground">Joined:</span>{" "}
                {formatDate(profile.joinedAt)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
