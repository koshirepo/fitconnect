/**
 * Documentation: HTTP boundary for passkeys.
 *
 * - Two ceremonies, four calls. Registration needs a session — you are adding a key to an account you are already in. Sign-in cannot have one, which is the point, so those two routes are unauthenticated and rate-limited like every other anonymous write in this API.
 * - The relying party is derived from the request host rather than configuration: a passkey ceremony is only valid against the origin the browser is actually on, and a mismatch is the failure the whole protocol exists to produce.
 * - Verification never mints a session itself. It answers "whose key was that", and the session is issued by the same `authService.issueSession` a password login uses, so account status, the gym-subdomain rule, and the response shape stay identical across both.
 * - Primary exports: passkeyController.
 */
import { passkeyService } from "./passkeys.service";
import { authService } from "./auth.service";
import { resolveRequestTenantHost } from "../../lib/tenant-host";
import { ok, badRequest, unauthorized, notFound, forbidden } from "../../lib/response";
import type { Context } from "hono";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

/** The origin the browser is on, which is the only one its assertion is valid for. */
function requestHost(c: AppContext) {
  const origin = c.req.header("origin");
  if (origin) {
    try {
      return new URL(origin).host;
    } catch {
      // Fall through to the Host header.
    }
  }
  return c.req.header("host") ?? "";
}

export const passkeyController = {
  /** Options for creating a passkey on the signed-in account. */
  async registerOptions(c: AppContext) {
    const user = c.get("authUser");
    const result = await passkeyService.registrationOptions(user.id, requestHost(c));
    if ("error" in result) return notFound(c, result.error!);
    return ok(c, result.data);
  },

  /** Check what the authenticator created, and store the public half. */
  async registerVerify(c: AppContext) {
    const user = c.get("authUser");
    const body = (await c.req.json().catch(() => null)) as {
      handle?: string;
      response?: unknown;
      label?: string;
    } | null;

    if (!body?.handle || !body.response) {
      return badRequest(c, "That registration was incomplete. Try again.");
    }

    const result = await passkeyService.verifyRegistration(user.id, requestHost(c), {
      handle: body.handle,
      response: body.response as never,
      ...(body.label ? { label: body.label } : {}),
    });
    if ("error" in result) return badRequest(c, result.error!);
    return ok(c, result.data, 201);
  },

  /**
   * Options for signing in.
   *
   * Unauthenticated by definition, and deliberately asks for no email: with a
   * resident key the authenticator already knows which account it holds, and
   * naming accounts to an anonymous caller would leak which addresses exist.
   */
  async loginOptions(c: AppContext) {
    const result = await passkeyService.authenticationOptions(requestHost(c));
    return ok(c, result.data);
  },

  /** Verify the assertion, then issue a session exactly as a password would. */
  async loginVerify(c: AppContext) {
    const body = (await c.req.json().catch(() => null)) as {
      handle?: string;
      response?: unknown;
    } | null;

    if (!body?.handle || !body.response) {
      return badRequest(c, "That sign-in was incomplete. Try again.");
    }

    const verified = await passkeyService.verifyAuthentication(requestHost(c), {
      handle: body.handle,
      response: body.response as never,
    });
    if ("error" in verified) {
      return verified.status === 400
        ? badRequest(c, verified.error!)
        : unauthorized(c, verified.error!);
    }

    // A sign-in from a gym subdomain is scoped to that gym; the app root is not.
    const requestTenant = resolveRequestTenantHost({
      origin: c.req.header("origin"),
      host: c.req.header("host"),
    });

    const session = await authService.issueSession(verified.data.userId, requestTenant);
    if ("error" in session) {
      return session.status === 403
        ? forbidden(c, session.error!)
        : unauthorized(c, session.error!);
    }

    return ok(c, session.data);
  },

  /** The passkeys on this account. */
  async list(c: AppContext) {
    const user = c.get("authUser");
    const result = await passkeyService.list(user.id);
    return ok(c, result.data);
  },

  /** Forget one. Scoped to the owner, so somebody else's id matches nothing. */
  async remove(c: AppContext) {
    const user = c.get("authUser");
    const result = await passkeyService.remove(user.id, c.req.param("passkeyId")!);
    if ("error" in result) return notFound(c, result.error!);
    return ok(c, result.data);
  },
};
