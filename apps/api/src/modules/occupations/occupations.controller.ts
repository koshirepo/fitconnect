/**
 * Documentation: Occupations controller.
 *
 * - Owns the HTTP boundary for the platform-wide occupation list: request parsing, service invocation, response shaping, and audit logging.
 * - Controller code should stay thin: validate inputs, call the service layer, and convert outcomes into the shared API response envelope.
 * - Primary exports: occupationController.
 */
import type { Context } from "hono";
import { occupationService } from "./occupations.service";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { ok, okMessage, conflict, notFound } from "../../lib/response";
import { createOccupationSchema, updateOccupationSchema } from "./occupations.schema";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const occupationController = {
  /**
   * The list every member form draws its picker from.
   *
   * Active rows only by default: an occupation that was retired stays on the
   * members who hold it but must stop being offered to new ones.
   */
  async list(c: AppContext) {
    const includeInactive = c.req.query("includeInactive") === "true";
    const withCounts = c.req.query("withCounts") === "true";

    const result = await occupationService.list(includeInactive, withCounts);
    return ok(c, result.data);
  },

  async create(c: AppContext) {
    const parsed = await parseBody(c, createOccupationSchema);
    if (!parsed.ok) return parsed.response;

    const result = await occupationService.create(parsed.data);
    if ("error" in result) return conflict(c, result.error!);

    await auditLog({
      action: "CREATE",
      entity: "Occupation",
      entityId: result.data.occupation.id,
      actorId: c.get("authUser").id,
      metadata: parsed.data,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  async update(c: AppContext) {
    const occupationId = c.req.param("occupationId")!;
    const parsed = await parseBody(c, updateOccupationSchema);
    if (!parsed.ok) return parsed.response;

    const result = await occupationService.update(occupationId, parsed.data);
    if ("error" in result) {
      if (result.status === 404) return notFound(c, result.error!);
      return conflict(c, result.error!);
    }

    await auditLog({
      action: "UPDATE",
      entity: "Occupation",
      entityId: occupationId,
      actorId: c.get("authUser").id,
      metadata: parsed.data,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  async delete(c: AppContext) {
    const occupationId = c.req.param("occupationId")!;

    const result = await occupationService.delete(occupationId);
    if ("error" in result) {
      if (result.status === 404) return notFound(c, result.error!);
      return conflict(c, result.error!);
    }

    await auditLog({
      action: "DELETE",
      entity: "Occupation",
      entityId: occupationId,
      actorId: c.get("authUser").id,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return okMessage(c, "Occupation deleted.");
  },
};
