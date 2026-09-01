/**
 * Documentation: Freezes controller.
 *
 * - The HTTP boundary for pausing and resuming a membership, plus the status a screen needs to decide what to offer: the remaining budget, the current freeze, and the history.
 * - Every freeze is audited, including the backdate override. A freeze moves a member's end date, which is money, and "who gave them those days" is the question that gets asked afterwards.
 * - Primary exports: freezeController.
 */
import type { Context } from "hono";
import { freezeService } from "./freezes.service";
import { createFreezeSchema, endFreezeSchema } from "./freezes.schema";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { badRequest, failWith, forbidden, notFound, ok } from "../../lib/response";
import { can } from "../../lib/permissions";
import { Permission } from "@fitconnect/shared/types/permissions";
import { prisma } from "../../lib/prisma";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

/**
 * Whether this caller may act on this membership's freezes.
 *
 * A member holds `members:freeze:self`, which opens the door but scopes
 * nothing — so the membership is checked against their own here. Staff
 * holding `members:freeze` act on anyone.
 */
async function refuseIfNotAllowed(c: AppContext, membershipId: string) {
  if (can(c, Permission.MEMBERS_FREEZE)) return null;

  const tenantId = c.req.param("tenantId")!;
  const own = await prisma.tenantMembership.findFirst({
    where: { tenantId, userId: c.get("authUser").id },
    select: { id: true },
  });

  if (!own || own.id !== membershipId) {
    return forbidden(c, "You can only freeze your own membership.");
  }
  return null;
}

export const freezeController = {
  /**
   * Handle the `freeze status` HTTP action.
   * Everything a screen needs to decide whether to offer a freeze and for how long.
   */
  async getStatus(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;

    const refusal = await refuseIfNotAllowed(c, membershipId);
    if (refusal) return refusal;

    const result = await freezeService.getStatus(tenantId, membershipId);
    return ok(c, result.data);
  },

  /**
   * Handle the `create freeze` HTTP action.
   * The service owns every rule that can refuse one.
   */
  async create(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;
    const parsed = await parseBody(c, createFreezeSchema);
    if (!parsed.ok) return parsed.response;

    const refusal = await refuseIfNotAllowed(c, membershipId);
    if (refusal) return refusal;

    // Backdating hands back days the member already had, so it stays a staff
    // decision even though members can arrange their own freezes.
    const isStaff = can(c, Permission.MEMBERS_FREEZE);
    if (parsed.data.allowBackdate && !isStaff) {
      return forbidden(c, "Only staff can backdate a freeze.");
    }

    const actorId = c.get("authUser").id;
    const result = await freezeService.create(
      tenantId,
      membershipId,
      parsed.data,
      actorId,
    );
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "CREATE",
      entity: "MembershipFreeze",
      entityId: result.data.freeze.id,
      actorId,
      tenantId,
      metadata: {
        membershipId,
        days: parsed.data.days,
        startsOn: parsed.data.startsOn.toISOString(),
        newTermEndsOn: result.data.newTermEndsOn.toISOString(),
        // Recorded on purpose: backdating hands back days the member already had.
        backdated: Boolean(parsed.data.allowBackdate),
      },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  /**
   * Handle the `end freeze` HTTP action.
   * Unused days go back to the budget and the term shortens to match.
   */
  async end(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const freezeId = c.req.param("freezeId")!;
    const parsed = await parseBody(c, endFreezeSchema);
    if (!parsed.ok) return parsed.response;

    const freeze = await prisma.membershipFreeze.findFirst({
      where: { id: freezeId, tenantId },
      select: { membershipId: true },
    });
    if (!freeze) return notFound(c, "Freeze not found.");

    const refusal = await refuseIfNotAllowed(c, freeze.membershipId);
    if (refusal) return refusal;

    const result = await freezeService.end(
      tenantId,
      freezeId,
      parsed.data.endedOn ?? new Date(),
      "ENDED_EARLY",
    );
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "UPDATE",
      entity: "MembershipFreeze",
      entityId: freezeId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: {
        daysUsed: result.data.daysUsed,
        daysReturned: result.data.daysReturned,
      },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },
};
