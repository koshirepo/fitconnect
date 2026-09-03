/**
 * Documentation: Delhivery tracking push endpoint.
 *
 * - The courier telling us a parcel moved, instead of us asking when somebody happens to open the order. Without it a shipment only advances while a page is being looked at, so an order can read IN_TRANSIT for days after it was handed over.
 * - Delhivery signs nothing. There is no HMAC, no timestamp, no replay guard in their push — the only thing separating a real scan from anyone who has seen a waybill is the Authorization header they were asked to send. So this endpoint fails closed: with no shared secret configured it accepts nothing, because a public route that can mark orders delivered also opens their return windows.
 * - Always answers 200 to a delivery it understood, including one for a waybill we do not hold. Delhivery retries on anything else, and an account-wide push carrying another system's consignments is normal rather than an error.
 * - Primary exports: trackingWebhookController.
 */
import type { Context } from "hono";
import { config } from "../../config";
import { ok, unauthorized } from "../../lib/response";
import { parseTrackingPush } from "../../lib/delhivery";
import { shippingService } from "./shipping.service";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

/**
 * Compare two secrets without letting the clock say how much matched.
 *
 * The comparison is short and remote, so a timing attack here is largely
 * theoretical — but the whole security of this endpoint rests on this one
 * string, and constant time costs nothing to write.
 */
function secretMatches(presented: string, expected: string) {
  if (presented.length !== expected.length) return false;

  let difference = 0;
  for (let index = 0; index < presented.length; index += 1) {
    difference |= presented.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export const trackingWebhookController = {
  async push(c: AppContext) {
    const expected = config.delhiveryWebhookToken;
    if (!expected) {
      return unauthorized(c, "Tracking push is not configured.");
    }

    // Delhivery sends whatever header the account was set up with. Both spellings
    // are accepted because their onboarding form takes either.
    const header = c.req.header("authorization") ?? c.req.header("x-delhivery-token") ?? "";
    const presented = header.replace(/^(Token|Bearer)\s+/i, "").trim();

    if (!secretMatches(presented, expected)) {
      return unauthorized(c, "Invalid tracking push credentials.");
    }

    let body: unknown = null;
    try {
      body = await c.req.json();
    } catch {
      body = null;
    }

    const push = parseTrackingPush(body);
    if (!push) {
      // Understood the request, could not find a scan in it. Reported as
      // accepted-but-ignored rather than as a failure, so Delhivery does not
      // retry a payload that will never parse.
      return ok(c, { received: true, matched: false, reason: "No waybill in payload." });
    }

    const result = await shippingService.recordTrackingPush(push);
    return ok(c, { received: true, ...result.data });
  },
};
