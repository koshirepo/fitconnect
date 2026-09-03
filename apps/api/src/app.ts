/**
 * Documentation: Application composition entrypoint.
 *
 * - Builds the Hono application, applies global middleware, registers all route modules, and normalizes global error handling.
 * - Translate cross-cutting failures like Prisma constraint errors into the shared API response envelope here instead of repeating that logic in controllers.
 * - Primary exports: default export.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { ok, internalError, conflict, badRequest } from "./lib/response";
import { authRoutes } from "./modules/auth/auth.routes";
import { tenantRoutes } from "./modules/tenants/tenants.routes";
import { memberRoutes } from "./modules/members/members.routes";
import { workoutRoutes } from "./modules/workouts/workouts.routes";
import { paymentRoutes, gatewayWebhookRoutes } from "./modules/payments/payments.routes";
import { courierWebhookRoutes } from "./modules/commerce/commerce.routes";
import { iclockRoutes } from "./modules/attendance/iclock.routes";
import { badgeRoutes } from "./modules/badges/badges.routes";
import { couponRoutes } from "./modules/coupons/coupons.routes";
import { freezeRoutes } from "./modules/freezes/freezes.routes";
import { reminderRoutes } from "./modules/reminders/reminders.routes";
import { storeRoutes } from "./modules/store/store.routes";
import { socialRoutes } from "./modules/social/social.routes";
import { auditRoutes } from "./modules/audit/audit.routes";
import { publicRoutes } from "./modules/public/public.routes";
import { commerceRoutes } from "./modules/commerce/commerce.routes";
import { reviewRoutes } from "./modules/commerce/review.routes";
import { pushRoutes } from "./modules/push/push.routes";
import { settingsRoutes } from "./modules/settings/settings.routes";
import { attendanceRoutes } from "./modules/attendance/attendance.routes";
import { uploadRoutes } from "./modules/uploads/uploads.routes";
import { shiftRoutes } from "./modules/shifts/shifts.routes";
import { todoRoutes } from "./modules/todos/todos.routes";
import { platformRoleRoutes, tenantRoleRoutes } from "./modules/roles/roles.routes";

const app = new Hono();

app.use("*", logger());

/**
 * A structured line for every request that did not succeed.
 *
 * Workers Logs can group and count by field, but only on fields that exist:
 * the default logger writes `--> GET /tenants/abc/members/xyz 403 719ms`, which
 * is readable and useless in aggregate — every id makes its own unique string,
 * so "which route is failing, and how often" cannot be asked of it.
 *
 * This emits the same fact as JSON with the ids replaced by their parameter
 * names, so a hundred failures on one route collapse into one row with a count
 * of a hundred. Only non-2xx is logged: the successes are already counted by
 * the metrics chart, and logging them would multiply the volume for nothing.
 *
 * Deliberately no user id, email, or body. This goes to a log store with a
 * long retention and none of that is needed to find a broken route.
 */
app.use("*", async (c, next) => {
  const startedAt = Date.now();
  await next();

  const status = c.res.status;
  if (status < 400) return;

  // The matched route pattern rather than the concrete path, which is what
  // makes these countable. Hono exposes it; the raw path is the fallback.
  const route = c.req.routePath ?? new URL(c.req.url).pathname;

  // The object, not a string of it. Workers Logs turns an object's own fields
  // into queryable ones; `JSON.stringify` hands it a single opaque message
  // instead, which reads fine and cannot be grouped or counted by route — the
  // one thing this log exists to make possible.
  /**
   * A 401 is not a failure worth counting beside the others.
   *
   * Access tokens last an hour, and when one expires every request already in
   * flight comes back 401 at once. The browser queues them behind a single
   * refresh and replays them, so the person at the screen sees nothing — but a
   * dashboard with a dozen parallel queries has just written a dozen "failed"
   * lines for a session that renewed itself exactly as designed.
   *
   * Logged under its own name so it stays visible without drowning the signal:
   * `request_failed` then means something that actually needs looking at, and
   * a spike in `request_unauthenticated` means tokens expiring, which is the
   * app working.
   */
  console.log({
    event: status === 401 ? "request_unauthenticated" : "request_failed",
    status,
    method: c.req.method,
    route,
    durationMs: Date.now() - startedAt,
    // Which gym, so one misconfigured tenant is distinguishable from a problem
    // everybody has. An id, not a name.
    tenantId: c.req.param("tenantId") ?? undefined,
  });
});

/**
 * Every gym is served from its own subdomain, so the browser origin varies per
 * request (`https://rudra.fitconnect.co.in`). A single fixed `CORS_ORIGIN` would
 * therefore reject every gym while allowing only the apex, so the allowlist is
 * built from the configured root domains and any subdomain of them.
 *
 * `CORS_ORIGIN` still works as an explicit comma-separated allowlist when a
 * deployment needs origins outside that pattern.
 */
function resolveCorsOrigin(origin: string): string | null {
  const explicit = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (explicit.includes("*")) return origin || "*";
  if (explicit.includes(origin)) return origin;
  if (!origin) return null;

  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }

  // The app's own hosts, plus one level of gym subdomain beneath each.
  const roots = [
    ...explicit.map((entry) => {
      try {
        return new URL(entry).hostname.toLowerCase();
      } catch {
        return entry.toLowerCase();
      }
    }),
    ...(process.env.APP_ROOT_DOMAINS ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  ];

  for (const root of roots) {
    if (host === root || host.endsWith(`.${root}`)) return origin;
  }

  return null;
}

app.use(
  "*",
  cors({
    origin: resolveCorsOrigin,
    credentials: true,
  }),
);


app.get("/", (c) => ok(c, { status: "ok", service: "gms-api" }));

app.route("/auth", authRoutes);
app.route("/tenants", tenantRoutes);
app.route("/tenants", memberRoutes);
app.route("/tenants", workoutRoutes);
app.route("/tenants", paymentRoutes);
app.route("/tenants", badgeRoutes);
app.route("/tenants", couponRoutes);
app.route("/tenants", freezeRoutes);
app.route("/tenants", reminderRoutes);
app.route("/tenants", storeRoutes);
app.route("/tenants", socialRoutes);
app.route("/tenants", settingsRoutes);
app.route("/tenants", attendanceRoutes);
app.route("/tenants", shiftRoutes);
app.route("/tenants", todoRoutes);
app.route("/tenants", tenantRoleRoutes);
app.route("/platform", platformRoleRoutes);
app.route("/audit", auditRoutes);
app.route("/public", publicRoutes);
app.route("/", commerceRoutes);
app.route("/", reviewRoutes);
app.route("/push", pushRoutes);
app.route("/uploads", uploadRoutes);
// Payment gateway callbacks. No session — each delivery carries its own HMAC
// signature, verified against the gym's webhook secret.
app.route("/webhooks", gatewayWebhookRoutes);
// Courier scan pushes. Delhivery signs nothing, so the route authenticates on a
// shared secret and refuses every delivery until one is configured.
app.route("/webhooks", courierWebhookRoutes);
// RFID attendance machines. No session and no bearer token — a device on a wall
// can hold neither — so this is mounted clear of the authenticated groups and
// identifies a device by the serial it reports, which must already be
// registered to a gym.
app.route("/iclock", iclockRoutes);

app.onError((err, c) => {
  /**
   * Every uncaught throw, named and countable.
   *
   * An exception that becomes a 500 was previously visible only as a bar on a
   * chart. The error class and message are what turn "597 errors" into
   * something with a cause — and the route is what says where to look.
   */
  console.log({
    event: "request_error",
    error: err.constructor?.name ?? "Error",
    message: err.message?.slice(0, 300),
    method: c.req.method,
    route: c.req.routePath ?? new URL(c.req.url).pathname,
    tenantId: c.req.param("tenantId") ?? undefined,
  });

  if (
    err.constructor?.name === "PrismaClientKnownRequestError" &&
    (err as any).code === "P2002"
  ) {
    const target = (err as any).meta?.target;
    if (target) {
      const fields = Array.isArray(target) ? target : [target];
      const fieldName = fields
        .map((f: string) =>
          f
            .replace(/_/g, " ")
            .replace(/\b\w/g, (ch: string) => ch.toUpperCase()),
        )
        .join(", ");
      return conflict(
        c,
        `A record with this ${fieldName.toLowerCase()} already exists.`,
      );
    }
    return conflict(c, "A record with this value already exists.");
  }

  if (
    err.constructor?.name === "PrismaClientKnownRequestError" &&
    (err as any).code === "P2003"
  ) {
    return badRequest(
      c,
      "Referenced record not found. Please check your input.",
    );
  }

  console.error("[unhandled]", err);
  return internalError(c);
});

export default app;
