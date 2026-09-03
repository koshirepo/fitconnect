/**
 * Documentation: Path normalizers for the two hosts the dashboard is served from.
 *
 * - The same screen has two addresses. On a gym subdomain every signed-in page lives under `/dashboard` (`/dashboard/members/x`); on the app host it does not (`/members/x`). A link written for one host is a dead end on the other, and links get written once and followed anywhere — bookmarks, emails, and above all push notifications, whose payloads are built on the server, which cannot know which host the recipient browses from.
 * - `TenantPathNormalizer` catches a bare path on a gym subdomain and adds the prefix. `ApexPathNormalizer` catches a prefixed path on the app host and removes it. Between them any dashboard link resolves on either host.
 * - Anything that is not a known gym path falls through to the host's own home, which is the right place for an unrecognised URL.
 * - Primary exports: TenantPathNormalizer, ApexPathNormalizer.
 */
import { Navigate, useLocation } from "react-router-dom";
import { APEX_ONLY_SEGMENTS, buildApexUrl, toTenantDashboardPath } from "@/lib/subdomain";

/**
 * Top-level segments that belong to the signed-in gym dashboard.
 *
 * Keep this in step with the dashboard routes in `App.tsx`: a segment missing
 * here is a link that silently lands on the public page instead of the screen
 * it names.
 */
const GYM_PATH_SEGMENTS = new Set([
  "members",
  "referrals",
  "todos",
  "workouts",
  "payments",
  "subscriptions",
  "coupons",
  "store",
  "reminders",
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

  /**
   * Platform work has no gym-scoped form, so it cannot be rewritten — it has
   * to be handed back to the app host. A bookmark or a pasted link to the
   * shop, its warehouses, orders or returns otherwise died here on the
   * landing page. A full page load, because this crosses an origin.
   */
  if (firstSegment && APEX_ONLY_SEGMENTS.has(firstSegment)) {
    const target = buildApexUrl(location.pathname + location.search);
    if (typeof window !== "undefined" && target.startsWith("http")) {
      window.location.replace(target);
      return null;
    }
  }

  return <Navigate to="/" replace />;
}

/**
 * The mirror image, for the app host.
 *
 * A push notification says `/dashboard/members/x` because that is the canonical
 * form on a gym subdomain. An admin who works from the app host has no such
 * route, so before this the tap fell through to the catch-all and dropped them
 * on the landing page — every notification, every time.
 */
export function ApexPathNormalizer() {
  const location = useLocation();
  const stripped = location.pathname.replace(/^\/dashboard(?=\/|$)/, "");
  const [firstSegment] = stripped.replace(/^\/+/, "").split("/");

  // `/dashboard` alone is the gym home, which on this host is `/`.
  if (!firstSegment) return <Navigate to="/" replace />;

  if (GYM_PATH_SEGMENTS.has(firstSegment)) {
    return <Navigate to={stripped + location.search} replace />;
  }

  return <Navigate to="/" replace />;
}
