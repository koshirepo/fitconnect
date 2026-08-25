/**
 * Documentation: Host-aware navigation.
 *
 * - `useAppNavigate` is a drop-in for `useNavigate` that rewrites gym paths to their canonical `/dashboard/...` form when the app is running on a gym subdomain.
 * - Gym screens can then link to `/members` or `/payments` without every call site remembering which host it is on, which is what kept producing links that worked on one host and 404'd on the other.
 * - Non-gym paths (`/`, `/login`, `/shop`, `/tenants`, `/platform-*`) pass through untouched.
 * - Primary exports: useAppNavigate, GYM_PATH_SEGMENTS, isGymPath.
 */
import * as React from "react";
import { useNavigate, type NavigateOptions, type To } from "react-router-dom";
import { isTenantSubdomain, toTenantDashboardPath } from "@/lib/subdomain";

/** Top-level segments that belong to the signed-in gym dashboard. */
export const GYM_PATH_SEGMENTS = new Set([
  "members",
  "referrals",
  "todos",
  "workouts",
  "payments",
  "subscriptions",
  "attendance",
  "badges",
  "settings",
  "audit",
  "finance",
  "profile",
  "orders",
]);

/** True when a path addresses a gym screen rather than a public or platform one. */
export function isGymPath(path: string) {
  const [firstSegment] = path.replace(/^\/+/, "").split(/[/?#]/);
  return GYM_PATH_SEGMENTS.has(firstSegment);
}

/** Map a path to the form valid on the current host. */
export function resolveAppPath(path: string) {
  if (!isTenantSubdomain() || !isGymPath(path)) return path;
  return toTenantDashboardPath(path);
}

/**
 * `useNavigate`, with gym paths resolved for the current host.
 * Numeric arguments (`navigate(-1)`) and location objects pass straight through.
 */
export function useAppNavigate() {
  const navigate = useNavigate();

  return React.useCallback(
    (to: To | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        navigate(to);
        return;
      }
      if (typeof to === "string") {
        navigate(resolveAppPath(to), options);
        return;
      }
      navigate(to, options);
    },
    [navigate],
  );
}
