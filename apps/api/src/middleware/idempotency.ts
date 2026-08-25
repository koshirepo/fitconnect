/**
 * Documentation: Replay protection for queued offline writes.
 *
 * - The PWA queues writes made offline and replays them when the connection returns. A write the API accepted whose response never reached the browser gets retried, and without this the retry creates a second record — two members, or two payments for one collection.
 * - Each queued write carries a stable `Idempotency-Key` for its whole life. The first request under a key runs normally and its response is stored; every later request under the same key is answered from that store without touching the database again.
 * - Scoped to the caller: a key is only ever replayed to the user who created it, so one client cannot read another's response by guessing a key.
 * - Requests without the header are untouched. This is opt-in protection for the replay path, not a tax on every write.
 * - Primary exports: idempotency.
 */
import { createMiddleware } from "hono/factory";
import { prisma } from "../lib/prisma";
import type { AppBindings } from "../types/app-context";

/** Longer than any plausible offline queue, short enough to prune cheaply. */
const RETENTION_MS = 24 * 60 * 60 * 1000;

/** A key is client-generated; cap it so it cannot be used to store bulk data. */
const MAX_KEY_LENGTH = 200;

/**
 * Answer a repeated write from its stored result instead of doing it twice.
 *
 * Only successful responses are recorded. A failed write should be retried
 * properly rather than having its failure replayed forever — the client's own
 * retry logic decides what to do with a 4xx or 5xx.
 */
export const idempotency = createMiddleware<AppBindings>(async (c, next) => {
  const key = c.req.header("idempotency-key");
  if (!key || key.length > MAX_KEY_LENGTH) return next();

  const userId = c.get("authUser")?.id;
  if (!userId) return next();

  const existing = await prisma.idempotencyKey.findUnique({
    where: { key },
    select: { userId: true, statusCode: true, response: true },
  });

  if (existing) {
    // A key belonging to someone else is treated as absent rather than as an
    // error: it is not this caller's business that the key exists at all.
    if (existing.userId !== userId) return next();

    return c.json(JSON.parse(existing.response), existing.statusCode as 200);
  }

  await next();

  const status = c.res.status;
  if (status < 200 || status >= 300) return;

  // The response body can only be read once, so it is cloned before storing.
  let body: string;
  try {
    body = await c.res.clone().text();
  } catch {
    return;
  }

  try {
    await prisma.idempotencyKey.create({
      data: {
        key,
        userId,
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        statusCode: status,
        response: body,
      },
    });
  } catch {
    // A racing duplicate lost the insert. The other request stored the same
    // outcome, so there is nothing to fix and nothing worth failing over.
  }

  // Opportunistic pruning: one cheap delete on roughly one write in fifty,
  // which keeps the table from growing without needing a scheduled job.
  if (Math.random() < 0.02) {
    prisma.idempotencyKey
      .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } } })
      .catch(() => {});
  }
});
