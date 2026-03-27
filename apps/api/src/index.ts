import app from "./app";
import { setD1 } from "./lib/prisma";

type WorkerEnv = {
  DB: D1Database;
  FILES?: R2Bucket;
  UPLOADS_BUCKET?: R2Bucket;
  R2_PUBLIC_URL?: string;
  [key: string]: unknown;
};

function applyStringBindingsToEnv(env: WorkerEnv) {
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      process.env[key] = value;
    }
  }
}

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
