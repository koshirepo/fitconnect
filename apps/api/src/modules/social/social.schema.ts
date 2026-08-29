/**
 * Documentation: Likes and comments — request schemas.
 *
 * - Covers both things a member can react to: a product in the gym store, and the gym itself.
 * - A like carries no body at all. It is a toggle against a unique key, so there is nothing to validate beyond who is asking and what they are asking about, both of which come from the session and the path.
 * - Comment bodies are trimmed and capped. The cap is deliberately generous — somebody explaining how a supplement worked out for them should not be cut off mid-sentence — but bounded, because this is a comment box and not a document store.
 * - Primary exports: the schemas, and the inferred input types.
 */
import { z } from "zod";

export const commentSchema = z.object({
  body: z.string().trim().min(1, "A comment cannot be empty.").max(2000),
});

export const listCommentsSchema = z.object({
  /** Newest first, in pages, because a popular product accumulates these. */
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CommentInput = z.infer<typeof commentSchema>;
export type ListCommentsInput = z.infer<typeof listCommentsSchema>;
