import * as React from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { buildTenantDashboardUrl, isTenantSubdomain } from "@/lib/subdomain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Building2 } from "lucide-react";
import { usePermissions } from "./permission-gate";
import type { Permission } from "@/lib/permissions";

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

/**
 * Hard requirement that gym pages are only ever served from a gym's own
 * subdomain.
 *
 * Every tenant-scoped screen sits behind this. Off a gym host the route does
 * not render at all — the user is sent to the same path on their gym's
 * subdomain, so a deep link still lands where it was pointing. When the host
 * cannot carry a subdomain (an IP address, typically local development on
 * 127.0.0.1) there is nowhere to send them, so the guard explains that instead
 * of silently falling through to the page.
 */
export function RequireTenantHost() {
  const { currentMembership } = useAuthStore();
  const location = useLocation();
  const membership = currentMembership();
  const onGymHost = isTenantSubdomain();

  const target =
    !onGymHost && membership?.tenantSlug
      ? buildTenantDashboardUrl(membership.tenantSlug, location.pathname + location.search)
      : null;

  // A full page load, not a router navigation: the destination is a different
  // origin, so the app has to boot again there.
  React.useEffect(() => {
    if (target) window.location.replace(target);
  }, [target]);

  if (onGymHost) {
    return <Outlet />;
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center px-4">
      <Card className="w-full">
        <CardHeader className="items-center text-center">
          <Building2 className="h-10 w-10 text-muted-foreground" />
          <CardTitle>{target ? "Opening your gym…" : "Gym pages live on your gym's address"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {target ? (
            <p className="text-sm text-muted-foreground">
              Taking you to <span className="font-medium">{membership?.tenantName}</span>.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {membership
                ? `${membership.tenantName} is served from its own web address. This host cannot serve gym pages — open the gym's subdomain instead.`
                : "Sign in to a gym to reach its pages."}
            </p>
          )}
          {target && (
            <a href={target} className="text-sm font-medium text-primary underline">
              Continue
            </a>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Gates a route subtree on capabilities rather than a role name.
 * `anyOf` passes when the user holds at least one permission; `allOf` requires
 * every one. Redirects to the dashboard rather than showing a dead screen.
 */
export function RequirePermission({
  anyOf,
  allOf,
  redirectTo = "/dashboard",
}: {
  anyOf?: Permission[];
  allOf?: Permission[];
  redirectTo?: string;
}) {
  const { canAny, canAll } = usePermissions();

  const allowed =
    (anyOf?.length ? canAny(...anyOf) : true) && (allOf?.length ? canAll(...allOf) : true);

  if (!allowed) {
    return <Navigate to={redirectTo} replace />;
  }
  return <Outlet />;
}

/** Redirects home if already authenticated (for login page) */
export function RedirectIfAuth() {
  const { isAuthenticated } = useAuthStore();
  const target = isTenantSubdomain() ? "/" : "/dashboard";

  if (isAuthenticated) {
    return <Navigate to={target} replace />;
  }
  return <Outlet />;
}
