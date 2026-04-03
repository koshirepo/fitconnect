import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

function isPlatformExpired(platformExpiresAt?: string | null) {
  return Boolean(platformExpiresAt) && new Date(platformExpiresAt!).getTime() < Date.now();
}

/** Redirects to /login if not authenticated */
export function RequireAuth() {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <Outlet />;
}

/** Redirects to /login if not platform staff (SUPER_ADMIN | SUPPORT) */
export function RequirePlatformStaff() {
  const { isPlatformStaff } = useAuthStore();

  if (!isPlatformStaff()) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}

/** Blocks tenant users when their gym's platform access has expired */
export function RequireTenantPlatformAccess() {
  const { currentMembership, isPlatformStaff, logout } = useAuthStore();
  const navigate = useNavigate();
  const membership = currentMembership();

  if (isPlatformStaff()) {
    return <Outlet />;
  }

  if (membership && isPlatformExpired(membership.platformExpiresAt)) {
    const isRenewalRole = membership.role === "ADMIN" || membership.role === "COACH";

    return (
      <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center px-4">
        <Card className="w-full">
          <CardHeader className="items-center text-center">
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <CardTitle>Platform Access Is Expired</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              {isRenewalRole
                ? "Platform Access is expired renew access to access the platform."
                : "This gym's platform access has expired. Please contact your gym admin."}
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  logout();
                  navigate("/login", { replace: true });
                }}
              >
                Logout
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <Outlet />;
}

/** Redirects to /dashboard if the active tenant role is not ADMIN */
export function RequireTenantAdmin() {
  const { tenantRole } = useAuthStore();

  if (tenantRole() !== "ADMIN") {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}

/** Redirects home if already authenticated (for login page) */
export function RedirectIfAuth() {
  const { isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
