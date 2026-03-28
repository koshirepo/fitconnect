import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";

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

/** Redirects home if already authenticated (for login page) */
export function RedirectIfAuth() {
  const { isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
