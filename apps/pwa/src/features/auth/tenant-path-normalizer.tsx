/**
 * Documentation: Gym-subdomain path normalizer.
 *
 * - On a gym subdomain every signed-in page lives under `/dashboard`, so this catches anything that landed on the bare form (`/todos`) and sends it to the canonical one (`/dashboard/todos`).
 * - It exists so a stale link, a bookmark, or a redirect from the app host still resolves instead of dropping the user on the gym's public page.
 * - Anything that is not a known gym path falls through to the gym's public page, which is the right home for an unrecognised URL on that host.
 * - Primary exports: TenantPathNormalizer.
 */
import { Navigate, useLocation } from "react-router-dom";
import { toTenantDashboardPath } from "@/lib/subdomain";

/** Top-level segments that belong to the signed-in gym dashboard. */
const GYM_PATH_SEGMENTS = new Set([
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

export function TenantPathNormalizer() {
  const location = useLocation();
  const [firstSegment] = location.pathname.replace(/^\/+/, "").split("/");

  if (firstSegment && GYM_PATH_SEGMENTS.has(firstSegment)) {
    return (
      <Navigate
        to={toTenantDashboardPath(location.pathname) + location.search}
        replace
      />
    );
  }

  return <Navigate to="/" replace />;
}
