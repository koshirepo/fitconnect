/**
 * Documentation: Coupons controller.
 *
 * - The HTTP boundary for managing coupons and for pricing a purchase against one. Creating, editing, and deleting are gated on their own permissions, so a gym can let a coach apply a coupon at the desk without letting them invent one.
 * - Every write is audited. Staff-applied discounts are a well-known source of revenue leakage, and the trail is the only way to answer who gave what away.
 * - Primary exports: couponController.
 */
import type { Context } from "hono";
import { couponRepository } from "./coupons.repository";
import { coinAdminService, couponService } from "./coupons.service";
import {
  coinAdjustSchema,
  createCouponSchema,
  quoteSchema,
  updateCouponSchema,
} from "./coupons.schema";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { badRequest, conflict, forbidden, notFound, ok } from "../../lib/response";
import { prisma } from "../../lib/prisma";
import { Permission } from "@fitconnect/shared/types/permissions";
import { can } from "../../lib/permissions";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

/** Split the relation ids out of a validated body; the rest are columns. */
function splitLinks<T extends { badgeIds?: string[]; subscriptionIds?: string[] }>(
  input: T,
) {
  const { badgeIds, subscriptionIds, ...columns } = input;
  return { badgeIds, subscriptionIds, columns };
}

export const couponController = {
  async list(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const includeInactive = c.req.query("includeInactive") === "true";
    const coupons = await couponRepository.list(tenantId, includeInactive);
    return ok(c, { coupons });
  },

  async get(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const couponId = c.req.param("couponId")!;

    const coupon = await couponRepository.find(tenantId, couponId);
    if (!coupon) return notFound(c, "Coupon not found.");

    const redemptions = await couponRepository.listRedemptions(tenantId, couponId);
    return ok(c, { coupon, redemptions });
  },

  async create(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, createCouponSchema);
    if (!parsed.ok) return parsed.response;

    const existing = await couponRepository.findByCode(tenantId, parsed.data.code);
    if (existing) return conflict(c, "A coupon with that code already exists.");

    const { badgeIds, subscriptionIds, columns } = splitLinks(parsed.data);
    const coupon = await couponRepository.create(
      tenantId,
      columns,
      badgeIds ?? [],
      subscriptionIds ?? [],
    );

    await auditLog({
      action: "CREATE",
      entity: "Coupon",
      entityId: coupon.id,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { code: coupon.code, type: coupon.type },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, { coupon }, 201);
  },

  async update(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const couponId = c.req.param("couponId")!;
    const parsed = await parseBody(c, updateCouponSchema);
    if (!parsed.ok) return parsed.response;

    const existing = await couponRepository.find(tenantId, couponId);
    if (!existing) return notFound(c, "Coupon not found.");

    if (parsed.data.code && parsed.data.code !== existing.code) {
      const clash = await couponRepository.findByCode(tenantId, parsed.data.code);
      if (clash) return conflict(c, "A coupon with that code already exists.");
    }

    const { badgeIds, subscriptionIds, columns } = splitLinks(parsed.data);
    const coupon = await couponRepository.update(
      couponId,
      columns,
      badgeIds,
      subscriptionIds,
    );

    await auditLog({
      action: "UPDATE",
      entity: "Coupon",
      entityId: couponId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { code: coupon.code, fields: Object.keys(columns) },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, { coupon });
  },

  async remove(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const couponId = c.req.param("couponId")!;

    const existing = await couponRepository.find(tenantId, couponId);
    if (!existing) return notFound(c, "Coupon not found.");

    // Deleting would take its redemption history with it, and that history is
    // the record of discounts already given. Deactivating keeps the trail.
    if (existing._count.redemptions > 0) {
      return badRequest(
        c,
        "This coupon has been redeemed and cannot be deleted. Deactivate it instead.",
      );
    }

    await couponRepository.remove(couponId);

    await auditLog({
      action: "DELETE",
      entity: "Coupon",
      entityId: couponId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { code: existing.code },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, { couponId });
  },

  /**
   * Price a purchase before it is saved.
   *
   * The same call the payment path makes, so what a screen previews is exactly
   * what will be charged.
   */
  async quote(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, quoteSchema);
    if (!parsed.ok) return parsed.response;

    const result = await couponService.quote({ tenantId, ...parsed.data });
    if ("error" in result) {
      return result.status === 404
        ? notFound(c, result.error)
        : badRequest(c, result.error);
    }

    return ok(c, { quote: result.data });
  },

  /** A member's coin balance and recent history. */
  /**
   * Give coins, or take them back.
   *
   * The one movement the ledger documented and nothing ever wrote — which
   * is why a negative balance from a reversal could never be forgiven.
   */
  async adjustCoins(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;

    const parsed = await parseBody(c, coinAdjustSchema);
    if (!parsed.ok) return parsed.response;

    const user = c.get("authUser");
    const result = await coinAdminService.adjust({
      tenantId,
      membershipId,
      amount: parsed.data.amount,
      note: parsed.data.note,
      actorUserId: user.id,
    });

    if ("error" in result) {
      return result.status === 404
        ? notFound(c, result.error!)
        : badRequest(c, result.error!);
    }

    await auditLog({
      action: "UPDATE",
      entity: "CoinLedgerEntry",
      entityId: membershipId,
      actorId: user.id,
      tenantId,
      metadata: { amount: parsed.data.amount, note: parsed.data.note },
    });

    return ok(c, result.data);
  },

  async coins(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;

    // `COUPONS_READ` is held by every member, so on its own it let anybody
    // read anybody else's balance and their whole earning history by
    // editing the id in the url. Staff who manage coupons keep the gym-wide
    // view; everyone else may read only their own.
    if (!can(c, Permission.COUPONS_CREATE)) {
      const user = c.get("authUser");
      const own = await prisma.tenantMembership.findFirst({
        where: { id: membershipId, tenantId, userId: user.id },
        select: { id: true },
      });
      if (!own) return forbidden(c, "You can only see your own coins.");
    }

    const [balance, entries] = await Promise.all([
      couponService.getCoinBalance(tenantId, membershipId),
      couponService.listCoinEntries(tenantId, membershipId),
    ]);

    return ok(c, { balance, entries });
  },
};
