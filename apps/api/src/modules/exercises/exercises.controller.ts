/**
 * Documentation: Exercise library controller.
 *
 * - The HTTP boundary for the platform's exercise library: parse, delegate, and shape the reply.
 * - Reading is open to any signed-in caller, so the controller decides one thing the routes cannot: whether the reader manages the library, which is what makes retired entries visible.
 * - Videos are turned into playable addresses here, against the request's own origin, so a clip resolves under a gym's subdomain, the app host, or localhost without any of them being configured.
 * - Writes are audited. A library every gym trains from is worth being able to ask "who changed this, and when".
 * - Primary exports: exerciseController.
 */
import type { Context } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { exerciseService } from "./exercises.service";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { parsePagination } from "../../lib/pagination";
import { publicAssetUrl } from "../../lib/storage";
import { badRequest, notFound, ok, okPaginated } from "../../lib/response";
import {
  createExerciseSchema,
  listExercisesSchema,
  updateExerciseSchema,
} from "./exercises.schema";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

/**
 * Whether this caller may see and change what the library has retired.
 *
 * Written defensively because the reads are open to visitors: an anonymous
 * request carries no resolved permission set at all, and a visitor is never
 * managing anything.
 */
function canManage(c: AppContext) {
  return Boolean(c.get("permissions")?.has(Permission.PLATFORM_EXERCISES_MANAGE));
}

/** The reader, when there is one. Null for a visitor with no account. */
function readerId(c: AppContext) {
  return c.get("authUser")?.id ?? c.get("optionalAuthUser")?.id ?? null;
}

/** A stored object key, as the address this request's origin serves it from. */
function assetUrlFor(c: AppContext) {
  return (key: string) => publicAssetUrl(c.req.url, key);
}

export const exerciseController = {
  async list(c: AppContext) {
    const parsed = listExercisesSchema.safeParse(c.req.query());
    const filters = parsed.success ? parsed.data : {};
    const { page, limit } = parsePagination(c);

    const { data, total } = await exerciseService.list(
      filters,
      readerId(c),
      canManage(c),
      page,
      limit,
      assetUrlFor(c),
    );

    return okPaginated(c, data, { page, limit, total });
  },

  /** The filter rail: every muscle group, with how many exercises it holds. */
  async muscleGroups(c: AppContext) {
    const result = await exerciseService.muscleGroups(
      canManage(c),
      c.req.query("includeInactive") === "true",
    );

    return ok(c, result.data);
  },

  async get(c: AppContext) {
    const result = await exerciseService.get(
      c.req.param("idOrSlug")!,
      readerId(c),
      canManage(c),
      assetUrlFor(c),
    );

    if ("error" in result) return notFound(c, result.error!);

    return ok(c, result.data);
  },

  async create(c: AppContext) {
    const parsed = await parseBody(c, createExerciseSchema);
    if (!parsed.ok) return parsed.response;

    const result = await exerciseService.create(parsed.data, assetUrlFor(c));
    if ("error" in result) return badRequest(c, result.error!);

    await auditLog({
      action: "CREATE",
      entity: "Exercise",
      entityId: result.data.exercise.id,
      actorId: c.get("authUser")!.id,
      metadata: { name: result.data.exercise.name, muscleGroup: result.data.exercise.muscleGroup },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  async update(c: AppContext) {
    const exerciseId = c.req.param("exerciseId")!;
    const parsed = await parseBody(c, updateExerciseSchema);
    if (!parsed.ok) return parsed.response;

    const result = await exerciseService.update(exerciseId, parsed.data, assetUrlFor(c));
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "UPDATE",
      entity: "Exercise",
      entityId: exerciseId,
      actorId: c.get("authUser").id,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  async remove(c: AppContext) {
    const exerciseId = c.req.param("exerciseId")!;

    const result = await exerciseService.remove(exerciseId);
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "DELETE",
      entity: "Exercise",
      entityId: exerciseId,
      actorId: c.get("authUser").id,
      // Worth recording which happened: a retired exercise still exists, and
      // somebody will ask why it is no longer in the picker.
      metadata: { retained: result.data.retained },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },
};
