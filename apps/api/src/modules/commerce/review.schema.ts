/**
 * Documentation: Review schema definitions.
 *
 * - Defines the Zod schemas and inferred TypeScript input types used to validate requests for product reviews, comments, and helpful-vote interactions.
 * - Bounds come from `FEEDBACK_LIMITS` in the shared package rather than being written here, so the PWA's character counter and this validator cannot disagree. They did: a comment on a review was capped at 500 here while the composer counted to 2000, so the server refused writing the box had told somebody was fine.
 * - The field is still `text` rather than `body`, matching the `ProductReviewComment` column. Renaming it is a database migration, not a schema edit, and the PWA already maps both names onto one row shape at the call site.
 * - When a request payload or query contract changes, update this file first and then adjust the controller/service code that consumes the parsed input.
 * - Primary exports: createReviewSchema, createCommentSchema, CreateReviewInput, CreateCommentInput.
 */
import { z } from "zod";
import { FEEDBACK_LIMITS } from "@fitconnect/shared/constants";

export const createReviewSchema = z.object({
  rating: z
    .number()
    .int()
    .min(FEEDBACK_LIMITS.RATING_MIN)
    .max(FEEDBACK_LIMITS.RATING_MAX),
  title: z.string().trim().min(1).max(FEEDBACK_LIMITS.REVIEW_TITLE_MAX_LENGTH),
  description: z.string().trim().min(1).max(FEEDBACK_LIMITS.REVIEW_BODY_MAX_LENGTH),
  isAnonymous: z.boolean().default(false),
});

export const createCommentSchema = z.object({
  text: z.string().trim().min(1).max(FEEDBACK_LIMITS.COMMENT_MAX_LENGTH),
  isAnonymous: z.boolean().default(false),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
