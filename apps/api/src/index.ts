/**
 * Documentation: Cloudflare Worker runtime adapter.
 *
 * - Bridges the Hono app into the Worker `fetch` and `scheduled` handlers, exposing Cloudflare bindings to the Node-style utilities used elsewhere in the codebase.
 * - Initializes the D1-backed Prisma client for each request/scheduled run and keeps the scheduled overdue-enforcement job colocated with the Worker entrypoint.
 * - Primary exports: default export.
 */
import app from "./app";
import { setD1 } from "./lib/prisma";
import { log, withRequestContext } from "./lib/logger";

const DAILY_TENANT_REPORT_CRON = "30 3 * * *";
/**
 * 04:30 UTC / 10:00 IST — late enough that a nudge lands during the day rather
 * than overnight, and after the report cron so the two never contend for D1.
 */
const DAILY_RENEWAL_REMINDER_CRON = "30 4 * * *";

type WorkerEnv = {
  DB: D1Database;
  FILES?: R2Bucket;
  UPLOADS_BUCKET?: R2Bucket;
  APP_URL?: string;
  R2_PUBLIC_URL?: string;
  [key: string]: unknown;
};

/**
 * Support the `apply string bindings to env` step in the Cloudflare Worker entrypoint.
 * Worker helpers isolate binding, environment, and scheduled-job setup from the request handler itself.
 */
function applyStringBindingsToEnv(env: WorkerEnv) {
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      process.env[key] = value;
    }
  }
}

/**
 * Support the `with binding aliases` step in the Cloudflare Worker entrypoint.
 * Worker helpers isolate binding, environment, and scheduled-job setup from the request handler itself.
 */
function withBindingAliases(env: WorkerEnv): WorkerEnv {
  return {
    ...env,
    UPLOADS_BUCKET: env.UPLOADS_BUCKET ?? env.FILES,
  };
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    applyStringBindingsToEnv(env);
    await setD1(env.DB);

    try {
      return await app.fetch(request, withBindingAliases(env), ctx);
    } catch (e: any) {
      log.error("worker.uncaught", { error: e });
      return new Response(
        JSON.stringify({ success: false, error: { code: "WORKER_ERROR", message: e?.message } }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": process.env.CORS_ORIGIN ?? "*",
          },
        },
      );
    }
  },

  async scheduled(controller: ScheduledController, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    applyStringBindingsToEnv(env);
    await setD1(env.DB);

    // A schedule has no request to borrow an id from, so it gets its own: every
    // line one morning's run writes, including the background sends it hands to
    // `waitUntil`, carries the same one.
    return withRequestContext(`cron-${crypto.randomUUID()}`, async () => {
      try {
        // Imported here rather than at module scope so the cron path pulls in the
        // reporting code only when a schedule actually fires.
        const { reportService } = await import("./modules/members/reports.service");

        if (controller.cron === DAILY_RENEWAL_REMINDER_CRON) {
          const { renewalReminderService } = await import(
            "./modules/members/renewal-reminders.service"
          );
          const result = await renewalReminderService.runScheduledRenewalReminders(
            (promise) => ctx.waitUntil(promise),
          );

          log.info("scheduled.renewal_reminders", {
            cron: controller.cron,
            ...result.data,
          });

          // Rides along on the same morning schedule: a gym reading its renewal
          // nudges is a gym reading its notifications, which is exactly when
          // "your attendance machine is off" should arrive.
          const { deviceHealthService } = await import(
            "./modules/attendance/device-health.service"
          );
          const devices = await deviceHealthService.runScheduledDeviceHealthChecks((promise) =>
            ctx.waitUntil(promise),
          );
          if (devices.data.silentDevices > 0) {
            log.info("scheduled.device_health", { cron: controller.cron, ...devices.data });
          }
          return;
        }

        if (controller.cron === DAILY_TENANT_REPORT_CRON) {
          // Coins first. Expiring them before the day's reporting means the
          // outstanding-coin figure a gym reads is the one after the sweep, not a
          // number that is already a day stale.
          const { coinAdminService } = await import("./modules/coupons/coupons.service");
          const expiry = await coinAdminService.expireStale();
          if (expiry.data.expiredCoins > 0) {
            log.info("scheduled.coin_expiry", { cron: controller.cron, ...expiry.data });
          }

          /**
           * Sessions nobody checked out of, from yesterday and before.
           *
           * Flagged rather than given an invented leaving time: a manufactured
           * check-out reads exactly like a real one, and anything counting
           * hours would bill it. By this hour every shift of the previous day
           * has ended, including one that ran past midnight.
           */
          const { attendanceService } = await import(
            "./modules/attendance/attendance.service"
          );
          const abandoned = await attendanceService.closeAbandonedSessions();
          if (abandoned.data.closed > 0) {
            log.info("scheduled.attendance_abandoned", {
              cron: controller.cron,
              ...abandoned.data,
            });
          }

          // Suspends everyone past their gym's grace period, then reports on it.
          const result = await reportService.runScheduledTenantReports((promise) =>
            ctx.waitUntil(promise),
          );

          log.info("scheduled.tenant_reports", {
            cron: controller.cron,
            ...result.data,
          });
          return;
        }

        // Every configured cron is handled above, so this is a schedule nobody
        // wrote a branch for. It used to fall through to overdue enforcement,
        // which meant adding any third cron would silently start suspending
        // members on it. An unrecognised schedule now does nothing and says so.
        log.warn("scheduled.unknown_cron", { cron: controller.cron });
      } catch (e: any) {
        log.error("scheduled.error", { cron: controller.cron, error: e });
        throw e;
      }
    });
  },
};
