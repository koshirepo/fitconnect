/**
 * Documentation: Member ID card controller.
 *
 * - The HTTP boundary for the public card link. No authentication: the token in the URL is the credential, which is what lets a member open their card from a message on a phone that has never signed in.
 * - Answers are explicitly uncacheable. The whole point of the card is that it reflects the record as it stands right now, so a proxy holding yesterday's copy would defeat it.
 * - Primary exports: idCardController.
 */
import type { Context } from "hono";
import { idCardService } from "./id-card.service";
import { notFound, ok } from "../../lib/response";

export const idCardController = {
  /**
   * Handle the `get id card` HTTP action.
   * Reads the member's current details for rendering; never a stored image.
   */
  async getCard(c: Context) {
    const token = c.req.param("token") ?? "";
    if (!token) return notFound(c, "Card not found.");

    const result = await idCardService.getCard(token);
    if ("error" in result) return notFound(c, result.error ?? "Card not found.");

    // A card is regenerated on every open by design.
    c.header("Cache-Control", "no-store");
    return ok(c, result.data);
  },
};
