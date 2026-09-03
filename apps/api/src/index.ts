/**
 * Documentation: Cloudflare Worker runtime adapter.
 *
 * - Bridges the Hono app into the Worker `fetch` and `scheduled` handlers, exposing Cloudflare bindings to the Node-style utilities used elsewhere in the codebase.
 * - Initializes the D1-backed Prisma client for each request/scheduled run and keeps the scheduled overdue-enforcement job colocated with the Worker entrypoint.
 * - Primary exports: default export.
 */
import app from "./app";
import { runWithD1 } from "./lib/prisma";

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

    try {
      // Every query this request makes resolves against a client of its own.
      // Sharing one across requests let Prisma batch two requests' queries
      // together and resolve one inside the other, which the runtime cancels —
      // the request then hangs until it is killed.
      return await runWithD1(env.DB, async () =>
        app.fetch(request, withBindingAliases(env), ctx),
      );
    } catch (e: any) {
      console.error("[worker-uncaught]", e?.message, e?.stack);
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

    await runWithD1(env.DB, async () => {
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

        console.info("[scheduled-renewal-reminders]", {
          cron: controller.cron,
          ...result.data,
        });
        return;
      }

      if (controller.cron === DAILY_TENANT_REPORT_CRON) {
        // Coins first. Expiring them before the day's reporting means the
        // outstanding-coin figure a gym reads is the one after the sweep, not a
        // number that is already a day stale.
        const { coinAdminService } = await import("./modules/coupons/coupons.service");
        const expiry = await coinAdminService.expireStale();
        if (expiry.data.expiredCoins > 0) {
          console.info("[scheduled-coin-expiry]", expiry.data);
        }

        const result = await reportService.runScheduledTenantReports((promise) =>
          ctx.waitUntil(promise),
        );

        console.info("[scheduled-tenant-reports]", {
          cron: controller.cron,
          ...result.data,
        });
        return;
      }

      const result = await reportService.runScheduledOverdueEnforcement((promise) =>
        ctx.waitUntil(promise),
      );

      console.info("[scheduled-overdue-enforcement]", {
        cron: controller.cron,
        ...result.data,
      });
    } catch (e: any) {
      console.error("[scheduled-overdue-enforcement-error]", e?.message, e?.stack);
      throw e;
    }
    });
  },
};
