/**
 * Documentation: Public tenant self-registration controller.
 *
 * - Owns the HTTP boundary for the unauthenticated list-your-gym flow: the address availability check and the registration itself.
 * - Unlike the member signup beside it, no gym is read from the request host — this flow runs on the platform's own domain and creates the gym it is talking about.
 * - Primary exports: tenantSignupController.
 */
import type { Context } from "hono";
import { parseBody } from "../../lib/http";
import { badRequest, error, failWith, ok } from "../../lib/response";
import { storeDataUrlImage } from "../../lib/data-url-image";
import { tenantSignupService } from "./tenant-signup.service";
import { checkSlugSchema, registerTenantSchema } from "./tenant-signup.schema";

export const tenantSignupController = {
  /**
   * Handle the `check gym address` HTTP action.
   * Answers whether a slug is free so the form can say so before submission.
   */
  async checkSlug(c: Context) {
    const parsed = checkSlugSchema.safeParse({ slug: c.req.query("slug") ?? "" });
    if (!parsed.success) {
      // An unusable address is simply an unavailable one as far as the form is
      // concerned; the message explains which rule it broke.
      return ok(c, {
        slug: c.req.query("slug") ?? "",
        available: false,
        reason: parsed.error.issues[0]?.message ?? "That address is not valid.",
      });
    }

    const result = await tenantSignupService.checkSlug(parsed.data.slug);
    return ok(c, result.data);
  },

  /**
   * Handle the `register gym` HTTP action.
   * Creates the suspended gym with its owner and returns a session for it.
   */
  async register(c: Context) {
    const parsed = await parseBody(c, registerTenantSchema);
    if (!parsed.ok) return parsed.response;

    const { logoDataUrl, owner, ...input } = parsed.data;
    const { avatarDataUrl, ...ownerInput } = owner;

    /**
     * Both images are stored before the gym exists, so a misconfigured bucket
     * fails the registration outright rather than leaving a gym with no logo
     * and an owner with no face. Uploaded together for the same reason: one
     * succeeding while the other fails is the outcome worth avoiding.
     */
    let logoUrl: string | null;
    let avatarUrl: string | null;
    try {
      [logoUrl, avatarUrl] = await Promise.all([
        storeDataUrlImage(c, "logos", logoDataUrl),
        storeDataUrlImage(c, "avatars", avatarDataUrl),
      ]);
    } catch {
      return error(
        c,
        503,
        "INTERNAL_ERROR",
        "Your images could not be saved. Please try again.",
      );
    }

    if (!logoUrl) return badRequest(c, "That logo could not be read.");
    if (!avatarUrl) return badRequest(c, "That photo could not be read.");

    const result = await tenantSignupService.register(
      { ...input, logoUrl, owner: { ...ownerInput, avatarUrl } },
      (promise) => c.executionCtx.waitUntil(promise),
    );
    if ("error" in result) return failWith(c, result);

    return ok(c, result.data, 201);
  },
};
