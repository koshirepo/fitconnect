/**
 * Documentation: Push schema definitions.
 *
 * - Defines the Zod schemas and inferred TypeScript input types used to validate requests for browser push subscription lifecycle and notification delivery.
 * - When a request payload or query contract changes, update this file first and then adjust the controller/service code that consumes the parsed input.
 * - Primary exports: pushSubscribeSchema, PushSubscribeInput.
 */
import { z } from "zod";

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;
