/**
 * Documentation: Lazy Prisma client binding for D1.
 *
 * - Caches the generated Prisma client per active D1 binding and exposes a proxy so downstream code can import `prisma` directly.
 * - `setD1` must run before any repository query; the Worker entrypoint is responsible for that initialization order.
 * - Primary exports: prisma, setD1.
 *
 * One client per isolate, shared by every request it serves. That is the
 * intended shape for Prisma on Workers — building one per request would pay for
 * the adapter and engine setup on every call — but it has a consequence worth
 * knowing about before touching this file.
 *
 * The client batches queries, so a promise created while serving one request can
 * be resolved while serving another. Current workerd treats that as a bug and
 * cancels the continuation, which leaves the first request awaiting something
 * that will never settle; 30s later the runtime kills it as hung and the caller
 * gets a 503. It arrived without a code change on our side and showed up as
 * whole dashboards failing at once, since parallel queries share the batch.
 *
 * `no_handle_cross_request_promise_resolution` in wrangler.toml is what makes
 * this safe. Remove one and you must remove the other: without the flag, the
 * shared client hangs requests under load.
 */
import { PrismaClient } from "../generated/prisma/client";

type PrismaState = {
  client?: PrismaClient;
  db?: D1Database;
};

type GlobalPrismaState = typeof globalThis & {
  __gmsPrismaState?: PrismaState;
};

const state = ((globalThis as GlobalPrismaState).__gmsPrismaState ??= {});

/**
 * Utility helper for the prisma module that owns the `reset client` step.
 * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
 */
function resetClient() {
  if (state.client) {
    void state.client.$disconnect().catch(() => undefined);
  }
  state.client = undefined;
  state.db = undefined;
}

/**
 * Utility helper for the prisma module that owns the `set d1` step.
 * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
 */
export async function setD1(db: D1Database) {
  if (state.client && state.db === db) {
    return;
  }

  const { PrismaD1 } = await import("@prisma/adapter-d1");

  resetClient();
  state.db = db;
  state.client = new PrismaClient({
    adapter: new PrismaD1(db),
  });
}

/**
 * Utility helper for the prisma module that owns the `get prisma` step.
 * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
 */
function getPrisma(): PrismaClient {
  if (state.client) {
    return state.client;
  }

  throw new Error("Prisma client not configured. Call setD1(env.DB) before accessing Prisma.");
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    const client = getPrisma();
    const value = (client as any)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
