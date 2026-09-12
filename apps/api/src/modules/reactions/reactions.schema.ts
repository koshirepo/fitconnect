/**
 * Documentation: Likes and comments — request schemas.
 *
 * - One set of schemas for every reaction in the app, because there is now one pair of tables behind them: a gym's public page, a product in a gym's store, and an exercise in the platform library.
 * - A subject is a type and an id, both taken from the path. The type is an enum here rather than a free string: an unknown subject would otherwise write rows nothing ever reads, and the service decides who may react per type.
 * - A like carries no body at all. It is a toggle against a unique key, so there is nothing to validate beyond who is asking and what about, and both come from the session and the path.
 * - Comment bodies are trimmed and capped. The cap is generous — somebody explaining how a lift worked for them should not be cut off mid-sentence — but bounded, because this is a comment box and not a document store.
 * - Primary exports: SUBJECT_TYPES, subjectSchema, commentSchema, listCommentsSchema, and the inferred input types.
 */
import { z } from "zod";
import { FEEDBACK_LIMITS, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@fitconnect/shared/constants";
import { cleanText } from "../../lib/clean-text";

/**
 * What can be reacted to.
 *
 * Adding one is a constant and a rule in the service — never a migration, which
 * is the whole point of keeping the subject in two columns.
 */
export const SUBJECT_TYPES = ["GYM", "PRODUCT", "EXERCISE"] as const;

export type SubjectType = (typeof SUBJECT_TYPES)[number];

export const subjectSchema = z.object({
  subjectType: z.enum(SUBJECT_TYPES),
  /** A cuid in every case today, but validated as an opaque id, not a format. */
  subjectId: z.string().trim().min(1).max(80),
});

export const commentSchema = z.object({
  body: cleanText(
    z.string().trim().min(1, "A comment cannot be empty.").max(FEEDBACK_LIMITS.COMMENT_MAX_LENGTH),
  ),
});

export const listCommentsSchema = z.object({
  /** Newest first, in pages, because a popular subject accumulates these. */
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type SubjectInput = z.infer<typeof subjectSchema>;
export type CommentInput = z.infer<typeof commentSchema>;
export type ListCommentsInput = z.infer<typeof listCommentsSchema>;
