/**
 * Documentation: One line per event, with the request that caused it.
 *
 * - Replaces bare `console.*` calls. Those printed a message and, if you were lucky, an object — which in the Workers dashboard means grepping free text and guessing which lines belong to the same request.
 * - Every entry is one JSON object: level, event, requestId, and whatever fields the caller passes. Cloudflare's log search indexes those fields, so "every failed push for this gym" is a query rather than a read-through.
 * - The request id comes from `AsyncLocalStorage`, so a service five calls deep logs it without every function in between having to carry one. Cloudflare's own `cf-ray` is used where the platform supplied it, since that is the id support will quote back.
 * - Errors are unwrapped here rather than at each call site: `{ error }` on an `Error` serialises to `{}`, which is how a stack trace goes missing exactly when it is wanted.
 * - Primary exports: log, withRequestContext, currentRequestId.
 */
import { AsyncLocalStorage } from "node:async_hooks";

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

type RequestContext = { requestId: string };

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Run a request's work with an id attached to everything it logs.
 *
 * Called once, by the request-logging middleware. Anything awaited inside —
 * including background work started with `waitUntil` from within the request —
 * inherits the same id.
 */
export function withRequestContext<T>(requestId: string, run: () => T): T {
  return storage.run({ requestId }, run);
}

/** The id of the request being served, when there is one. */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/** An Error becomes readable fields; anything else is stringified as-is. */
function describeError(error: unknown): Fields {
  if (error instanceof Error) {
    return {
      error: error.message,
      errorName: error.name,
      // Kept whole: a truncated stack usually loses the frame that matters.
      stack: error.stack,
    };
  }

  return { error: typeof error === "string" ? error : JSON.stringify(error) };
}

function emit(level: Level, event: string, fields: Fields = {}) {
  const { error, ...rest } = fields;
  const entry = {
    level,
    event,
    requestId: currentRequestId(),
    ...rest,
    ...(error === undefined ? {} : describeError(error)),
  };

  // `console` is the only sink a Worker has; what changes is that the thing
  // written is one parseable object rather than a sentence and some arguments.
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * The logger.
 *
 * `event` is a stable, greppable name — "push.send.failed", not a sentence that
 * changes the next time somebody edits the wording. Everything variable belongs
 * in the fields.
 */
export const log = {
  debug: (event: string, fields?: Fields) => emit("debug", event, fields),
  info: (event: string, fields?: Fields) => emit("info", event, fields),
  warn: (event: string, fields?: Fields) => emit("warn", event, fields),
  error: (event: string, fields?: Fields) => emit("error", event, fields),
};
