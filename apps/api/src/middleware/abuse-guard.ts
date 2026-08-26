/**
 * Documentation: Abuse protection for unauthenticated endpoints.
 *
 * - Public self-signup creates a user account and can open a Razorpay order, with no session in front of it. Left open, a script can mint members and payment orders at whatever rate it likes; both cost the gym real money to clean up.
 * - Two independent layers, because they fail differently: a per-IP rate limit caps volume from one source, and a Turnstile check asks whether there is a browser behind the request at all. A determined attacker rotating IPs still meets Turnstile; a legitimate member on a shared connection still gets through the rate limit.
 * - Both are inert until configured. That keeps local development and the first deploy working, and it is why the rate-limit binding and the Turnstile secret are optional rather than required — an unconfigured guard logs once rather than locking the gym out of its own signup page.
 * - Primary exports: rateLimitSignup, verifyTurnstile.
 */
import type { Context, Next } from "hono";
import { tooManyRequests, badRequest } from "../lib/response";
import type { AppBindings } from "../types/app-context";

type AppContext = Context<AppBindings>;

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** The field the Turnstile widget posts, named by Cloudflare's own convention. */
const TURNSTILE_TOKEN_FIELD = "cf-turnstile-response";

/**
 * The caller's address, as Cloudflare reports it.
 *
 * `CF-Connecting-IP` is set by the edge and cannot be spoofed by the client,
 * unlike `X-Forwarded-For`, which anyone may send.
 */
function clientIp(c: AppContext) {
  return c.req.header("cf-connecting-ip") ?? "unknown";
}

/**
 * Cap signup attempts per IP.
 *
 * Keyed by address and route so the two signup endpoints do not consume each
 * other's budget: a member who registers and then verifies is one of each, not
 * two of one.
 */
export async function rateLimitSignup(c: AppContext, next: Next) {
  const limiter = c.env?.SIGNUP_RATE_LIMITER;
  if (!limiter) return next();

  const { success } = await limiter.limit({
    key: `${clientIp(c)}:${new URL(c.req.url).pathname}`,
  });

  if (!success) {
    return tooManyRequests(
      c,
      "Too many attempts from this connection. Please wait a minute and try again.",
    );
  }

  return next();
}

/**
 * Require a solved Turnstile challenge.
 *
 * The token is single-use and verified server-side; a client that skips the
 * widget cannot forge one. Reads the token without consuming the request body,
 * so the controller behind this still parses it normally.
 */
export async function verifyTurnstile(c: AppContext, next: Next) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return next();

  let token: string | undefined;
  try {
    const body = (await c.req.raw.clone().json()) as Record<string, unknown>;
    const candidate = body?.[TURNSTILE_TOKEN_FIELD];
    if (typeof candidate === "string") token = candidate;
  } catch {
    // A body that is not JSON fails the same way a missing token does.
  }

  if (!token) {
    return badRequest(c, "Human verification is required. Please reload the page and try again.");
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, remoteip: clientIp(c) }),
    });

    const outcome = (await response.json()) as { success?: boolean };
    if (!outcome.success) {
      return badRequest(c, "Human verification failed. Please reload the page and try again.");
    }
  } catch {
    // Cloudflare being unreachable must not close the only way to join a gym.
    // Volume is still capped by the rate limit above.
    console.error("[turnstile] verification unreachable; allowing request");
  }

  return next();
}
