/**
 * Documentation: Review schema definitions.
 *
 * - Defines the Zod schemas and inferred TypeScript input types used to validate requests for product reviews, comments, and helpful-vote interactions.
 * - When a request payload or query contract changes, update this file first and then adjust the controller/service code that consumes the parsed input.
 * - Primary exports: createReviewSchema, createCommentSchema, CreateReviewInput, CreateCommentInput.
 */
import { z } from "zod";

export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  isAnonymous: z.boolean().default(false),
});

export const createCommentSchema = z.object({
  text: z.string().min(1).max(500),
  isAnonymous: z.boolean().default(false),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
