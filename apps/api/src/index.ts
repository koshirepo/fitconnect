/**
 * Documentation: Cloudflare Worker runtime adapter.
 *
 * - Bridges the Hono app into the Worker `fetch` and `scheduled` handlers, exposing Cloudflare bindings to the Node-style utilities used elsewhere in the codebase.
 * - Initializes the D1-backed Prisma client for each request/scheduled run and keeps the scheduled overdue-enforcement job colocated with the Worker entrypoint.
 * - Primary exports: default export.
 */
import app from "./app";
import { setD1 } from "./lib/prisma";

const DAILY_TENANT_REPORT_CRON = "30 3 * * *";

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
    await setD1(env.DB);

    try {
      const { memberService } = await import("./modules/members/members.service");

      if (controller.cron === DAILY_TENANT_REPORT_CRON) {
        const result = await memberService.runScheduledTenantReports((promise) =>
          ctx.waitUntil(promise),
        );

        console.info("[scheduled-tenant-reports]", {
          cron: controller.cron,
          ...result.data,
        });
        return;
      }

      const result = await memberService.runScheduledOverdueEnforcement((promise) =>
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
  },
};
