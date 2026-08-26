/**
 * Documentation: Freeze schema definitions.
 *
 * - Validates a freeze request before it reaches the service. The service still re-checks everything that depends on the member's record — the budget, the plan, the overlap — because those cannot be known from the body alone.
 * - Primary exports: createFreezeSchema, endFreezeSchema, CreateFreezeInput, EndFreezeInput.
 */
import { z } from "zod";

export const createFreezeSchema = z.object({
  startsOn: z.coerce.date(),
  /** The service enforces the 3-day floor and the plan's remaining budget. */
  days: z.number().int().min(1).max(365),
  reason: z.string().max(200).optional(),
  /**
   * Backdating a freeze. Allowed only as a deliberate override and written to
   * the audit log, because "freeze me from the 1st" on the 20th is a request to
   * be given back days the member already had.
   */
  allowBackdate: z.boolean().optional(),
});

export const endFreezeSchema = z.object({
  /** Defaults to today, which is what unfreezing normally means. */
  endedOn: z.coerce.date().optional(),
});

export type CreateFreezeInput = z.infer<typeof createFreezeSchema>;
export type EndFreezeInput = z.infer<typeof endFreezeSchema>;
