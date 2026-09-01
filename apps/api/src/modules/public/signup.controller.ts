/**
 * Documentation: Public self-signup controller.
 *
 * - Owns the HTTP boundary for the unauthenticated join-a-gym flow: form options, registration, and payment verification.
 * - The gym is taken from the request host rather than a body field, so a visitor can only ever join the gym whose site they are on.
 * - Primary exports: signupController.
 */
import type { Context } from "hono";
import { parseBody } from "../../lib/http";
import {
  badRequest,
  conflict,
  error,
  forbidden,
  notFound,
  failWith,
  ok,
} from "../../lib/response";
import { storeDataUrlImage } from "../../lib/data-url-image";
import { signupService } from "./signup.service";
import { signupQuoteSchema, selfSignupSchema, verifySignupSchema } from "./signup.schema";

/**
 * The gym subdomain this request arrived on.
 * `host` is accepted as a query parameter for the same reason the other public
 * endpoints accept it: a dev server proxying the API sees its own host header.
 */
function requestHost(c: Context) {
  return c.req.query("host") ?? c.req.header("host") ?? "";
}

export const signupController = {
  /**
   * Handle the `signup options` HTTP action.
   * Returns the gym, its plans, charges, and shifts so the public form can render.
   */
  async getOptions(c: Context) {
    const result = await signupService.getOptions(requestHost(c));
    if ("error" in result) return failWith(c, result);
    return ok(c, result.data);
  },

  /**
   * Price a joining offer before anybody has joined.
   *
   * Read-only and writes nothing, but still rate-limited: it is an
   * unauthenticated endpoint that says whether a code is real, which is
   * exactly the shape of thing worth guessing at in bulk.
   */
  async quote(c: Context) {
    const parsed = await parseBody(c, signupQuoteSchema);
    if (!parsed.ok) return parsed.response;

    const result = await signupService.quoteByHost(requestHost(c), parsed.data);
    if ("error" in result) return failWith(c, result);
    return ok(c, result.data);
  },

  /**
   * Handle the `self signup` HTTP action.
   * Creates the inactive membership with its pending bill, and opens the payment.
   */
  async register(c: Context) {
    const parsed = await parseBody(c, selfSignupSchema);
    if (!parsed.ok) return parsed.response;

    const { avatarDataUrl, ...input } = parsed.data;

    // Stored before the membership exists, so a bucket that is misconfigured
    // fails the signup outright rather than leaving a member with no photo.
    let avatarUrl: string | null;
    try {
      avatarUrl = await storeDataUrlImage(c, "avatars", avatarDataUrl);
    } catch {
      return error(
        c,
        503,
        "INTERNAL_ERROR",
        "Your photo could not be saved. Please try again.",
      );
    }
    if (!avatarUrl) return badRequest(c, "That photo could not be read.");

    const result = await signupService.register(
      requestHost(c),
      { ...input, avatarUrl },
      (promise) => c.executionCtx.waitUntil(promise),
    );
    if ("error" in result) return failWith(c, result);

    return ok(c, result.data, 201);
  },

  /**
   * Handle the `verify signup payment` HTTP action.
   * Settles the signup's payments against the checkout signature and reports whether the membership came alive.
   */
  async verify(c: Context) {
    const parsed = await parseBody(c, verifySignupSchema);
    if (!parsed.ok) return parsed.response;

    const result = await signupService.verify(requestHost(c), parsed.data);
    if ("error" in result) return failWith(c, result);

    return ok(c, result.data);
  },
};
