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
