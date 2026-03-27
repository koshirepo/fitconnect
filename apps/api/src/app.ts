import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { ok, internalError, conflict, badRequest } from "./lib/response";
import { authRoutes } from "./modules/auth/auth.routes";
import { tenantRoutes } from "./modules/tenants/tenants.routes";
import { memberRoutes } from "./modules/members/members.routes";
import { workoutRoutes } from "./modules/workouts/workouts.routes";
import { paymentRoutes } from "./modules/payments/payments.routes";
import { badgeRoutes } from "./modules/badges/badges.routes";
import { auditRoutes } from "./modules/audit/audit.routes";
import { publicRoutes } from "./modules/public/public.routes";
import { commerceRoutes } from "./modules/commerce/commerce.routes";
import { reviewRoutes } from "./modules/commerce/review.routes";
import { pushRoutes } from "./modules/push/push.routes";
import { settingsRoutes } from "./modules/settings/settings.routes";
import { attendanceRoutes } from "./modules/attendance/attendance.routes";
import { uploadRoutes } from "./modules/uploads/uploads.routes";

const app = new Hono();

// ─── Global Middleware ────────────────────────────────────────────────────────

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN ?? "*",
    credentials: true,
  }),
);

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get("/", (c) => ok(c, { status: "ok", service: "gms-api" }));

// ─── Routes ───────────────────────────────────────────────────────────────────

app.route("/auth", authRoutes);
app.route("/tenants", tenantRoutes);
app.route("/tenants", memberRoutes); // /tenants/:tenantId/members, /me
app.route("/tenants", workoutRoutes); // /tenants/:tenantId/workout-plans
app.route("/tenants", paymentRoutes); // /tenants/:tenantId/payments & subscriptions
app.route("/tenants", badgeRoutes); // /tenants/:tenantId/badges
app.route("/tenants", settingsRoutes); // /tenants/:tenantId/settings & charges
app.route("/tenants", attendanceRoutes); // /tenants/:tenantId/attendance
app.route("/audit", auditRoutes);
app.route("/public", publicRoutes);
app.route("/", commerceRoutes);
app.route("/", reviewRoutes);
app.route("/push", pushRoutes);
app.route("/uploads", uploadRoutes);

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.onError((err, c) => {
  // Prisma unique constraint violation → 409 Conflict
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

  // Prisma foreign key constraint → 400 Bad Request
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
