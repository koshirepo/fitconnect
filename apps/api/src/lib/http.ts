import type { Context } from "hono";
import { z } from "zod";
import { badRequest, validationError } from "./response";

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

