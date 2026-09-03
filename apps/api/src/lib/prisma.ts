/**
 * Documentation: Per-request Prisma client for D1.
 *
 * - One client per request, held in an `AsyncLocalStorage` store, reached through the `prisma` proxy every repository already imports. No call site changes: the proxy resolves the current request's client instead of a shared one.
 * - It used to be a single client cached on `globalThis` for the life of the isolate. That is the arrangement Prisma's `DataLoader` is not safe under here: it batches the queries made in one tick into a single call and resolves their promises together, and in a Worker isolate serving two requests at once those ticks interleave. A promise created for request A then resolves inside request B, the runtime cancels the continuation as unsafe, and A hangs until it is killed — surfacing as "your Worker's code had hung and would never generate a response" and an intermittent 500 on a route that works fine on retry. It got worse with concurrency, which is the worst way for a bug to scale.
 * - Scoping the client to the request confines the batch to it, so a batch can only ever resolve into the context that created it.
 * - `setD1` is kept as the name the entrypoint already calls, but it now opens a scope rather than caching a singleton: `runWithD1` wraps the handler, and everything inside sees its own client. Outside any scope — a module-scope query, a background task started without the wrapper — the proxy throws rather than silently reaching for someone else's client.
 * - Primary exports: prisma, runWithD1, setD1.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient } from "../generated/prisma/client";

type Scope = {
  client: PrismaClient;
};

/**
 * The client belonging to the request currently executing.
 *
 * `AsyncLocalStorage` is what makes this possible without threading a client
 * through every repository signature: it follows the async call chain, so a
 * query five awaits deep inside a service still resolves the client its own
 * request opened.
 */
const storage = new AsyncLocalStorage<Scope>();

/** The adapter module, imported once and reused across requests. */
let adapterModule: typeof import("@prisma/adapter-d1") | null = null;

async function loadAdapter() {
  if (!adapterModule) {
    adapterModule = await import("@prisma/adapter-d1");
  }
  return adapterModule;
}

/**
 * Run `handler` with its own Prisma client bound to this D1 binding.
 *
 * The client is constructed per call. That is deliberate and is the whole point
 * of this file: sharing one is what caused requests to cancel each other. The
 * cost is an object per request — the D1 adapter holds no connection pool and
 * opens no socket, so there is nothing here that a pool would have amortised.
 */
export async function runWithD1<T>(db: D1Database, handler: () => Promise<T>): Promise<T> {
  const { PrismaD1 } = await loadAdapter();
  const client = new PrismaClient({ adapter: new PrismaD1(db) });

  return storage.run({ client }, handler);
}

/**
 * Kept for the entrypoint's existing call shape.
 *
 * Does nothing but warm the adapter import, so the first request does not pay
 * for it inside the scope. The scope itself is opened by `runWithD1`.
 */
export async function setD1(_db: D1Database): Promise<void> {
  await loadAdapter();
}

function getPrisma(): PrismaClient {
  const scope = storage.getStore();
  if (scope) return scope.client;

  throw new Error(
    "Prisma was used outside a request scope. Wrap the work in runWithD1(env.DB, ...) — " +
      "a query started outside one has no client of its own and must not borrow another request's.",
  );
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    const client = getPrisma();
    const value = (client as any)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
