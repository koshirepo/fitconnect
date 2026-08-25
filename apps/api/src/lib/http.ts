/**
 * Documentation: HTTP parsing helpers.
 *
 * - Parses JSON request bodies and validates them against Zod schemas, returning ready-to-send Hono responses on failure.
 * - Controllers use this to keep request-shape validation centralized and avoid repetitive try/catch boilerplate.
 * - Primary exports: parseBody.
 */
import type { Context } from "hono";
import { z } from "zod";
import { badRequest, validationError } from "./response";

/**
 * Utility helper for the http module that owns the `parse body` step.
 * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
 */
export const parseBody = async <T extends z.ZodTypeAny>(c: Context, schema: T) => {
  let json: unknown;

  try {
    json = await c.req.json();
  } catch {
    return {
      ok: false as const,
      response: badRequest(c, "Invalid JSON body."),
    };
  }

  const parsed = schema.safeParse(json);

  if (!parsed.success) {
    return {
      ok: false as const,
      response: validationError(c, parsed.error.flatten()),
    };
  }

  return {
    ok: true as const,
    data: parsed.data,
  };
};

