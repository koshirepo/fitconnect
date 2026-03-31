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
import { shiftRoutes } from "./modules/shifts/shifts.routes";
import { todoRoutes } from "./modules/todos/todos.routes";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN ?? "*",
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
app.route("/tenants", settingsRoutes);
app.route("/tenants", attendanceRoutes);
app.route("/tenants", shiftRoutes);
app.route("/tenants", todoRoutes);
app.route("/audit", auditRoutes);
app.route("/public", publicRoutes);
app.route("/", commerceRoutes);
app.route("/", reviewRoutes);
app.route("/push", pushRoutes);
app.route("/uploads", uploadRoutes);

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
