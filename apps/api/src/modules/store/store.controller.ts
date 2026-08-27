/**
 * Documentation: Gym store catalogue controller.
 *
 * - The HTTP boundary for managing a gym's stock: parse, delegate, and shape the reply.
 * - Reads are open to anyone who may browse the store; writes need `STORE_MANAGE`, which the routes enforce. The one thing decided here rather than in the route is whether retired products are visible — that follows the caller's permissions, not a query parameter they can set.
 * - Stock movements are audited. A count that changes without a trail is the kind of thing a gym argues about later.
 * - Primary exports: storeController.
 */
import type { Context } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { storeService } from "./store.service";
import { storeCheckoutService, storeSaleService } from "./store-sale.service";
import {
  adjustStockSchema,
  counterSaleSchema,
  storeCheckoutSchema,
  storeCheckoutVerifySchema,
  createProductSchema,
  createVariantSchema,
  listProductsSchema,
  updateProductSchema,
  updateVariantSchema,
} from "./store.schema";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { badRequest, conflict, forbidden, notFound, ok } from "../../lib/response";
import { paymentRepository } from "../payments/payments.repository";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

/** Whether this caller may see what the gym has retired. */
function canManage(c: AppContext) {
  return c.get("permissions").has(Permission.STORE_MANAGE);
}

export const storeController = {
  async listProducts(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = listProductsSchema.safeParse(c.req.query());
    const filters = parsed.success ? parsed.data : {};

    const result = await storeService.listProducts(tenantId, filters, canManage(c));
    return ok(c, result.data);
  },

  async getProduct(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const result = await storeService.getProduct(tenantId, c.req.param("productId")!);
    if ("error" in result) return notFound(c, result.error!);

    return ok(c, result.data);
  },

  async createProduct(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, createProductSchema);
    if (!parsed.ok) return parsed.response;

    const result = await storeService.createProduct(tenantId, parsed.data);

    await auditLog({
      action: "CREATE",
      entity: "StoreProduct",
      entityId: result.data.product.id,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { name: result.data.product.name, variants: parsed.data.variants.length },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  async updateProduct(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const productId = c.req.param("productId")!;
    const parsed = await parseBody(c, updateProductSchema);
    if (!parsed.ok) return parsed.response;

    const result = await storeService.updateProduct(tenantId, productId, parsed.data);
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "UPDATE",
      entity: "StoreProduct",
      entityId: productId,
      actorId: c.get("authUser").id,
      tenantId,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  async deleteProduct(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const productId = c.req.param("productId")!;

    const result = await storeService.deleteProduct(tenantId, productId);
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "DELETE",
      entity: "StoreProduct",
      entityId: productId,
      actorId: c.get("authUser").id,
      tenantId,
      // Worth recording which happened: a retired product still appears in the
      // catalogue with `isActive: false`, and someone will ask why.
      metadata: { retained: result.data.retained },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  async addVariant(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const productId = c.req.param("productId")!;
    const parsed = await parseBody(c, createVariantSchema);
    if (!parsed.ok) return parsed.response;

    const result = await storeService.addVariant(tenantId, productId, parsed.data);
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "CREATE",
      entity: "StoreVariant",
      entityId: result.data.variant.id,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { productId, name: result.data.variant.name },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  async updateVariant(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const variantId = c.req.param("variantId")!;
    const parsed = await parseBody(c, updateVariantSchema);
    if (!parsed.ok) return parsed.response;

    const result = await storeService.updateVariant(tenantId, variantId, parsed.data);
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "UPDATE",
      entity: "StoreVariant",
      entityId: variantId,
      actorId: c.get("authUser").id,
      tenantId,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  async deleteVariant(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const variantId = c.req.param("variantId")!;

    const result = await storeService.deleteVariant(tenantId, variantId);
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "DELETE",
      entity: "StoreVariant",
      entityId: variantId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { retained: result.data.retained },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  async adjustStock(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const variantId = c.req.param("variantId")!;
    const parsed = await parseBody(c, adjustStockSchema);
    if (!parsed.ok) return parsed.response;

    const result = await storeService.adjustStock(tenantId, variantId, parsed.data);
    if ("error" in result) {
      return result.status === 409 ? conflict(c, result.error!) : notFound(c, result.error!);
    }

    await auditLog({
      action: "UPDATE",
      entity: "StoreVariant",
      entityId: variantId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { stockDelta: parsed.data.delta, note: parsed.data.note },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },
};

/**
 * Ring up a counter sale.
 *
 * Kept apart from `storeController` because selling is a different concern from
 * managing a catalogue, and the two carry different permissions.
 */
export const storeSaleController = {
  async sellAtCounter(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, counterSaleSchema);
    if (!parsed.ok) return parsed.response;

    // The service resolves which membership this staff member holds here, the
    // same way the payment path does, rather than the route guessing at it.
    const result = await storeSaleService.sellAtCounter(
      tenantId,
      parsed.data,
      c.get("authUser").id,
    );

    if ("error" in result) {
      if (result.status === 409) return conflict(c, result.error!);
      if (result.status === 404) return notFound(c, result.error!);
      return badRequest(c, result.error!);
    }

    await auditLog({
      action: "CREATE",
      entity: "StoreOrder",
      entityId: result.data.order.id,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: {
        total: result.data.total,
        discount: result.data.discount,
        coinsRedeemed: result.data.coinsRedeemed,
        coinsEarned: result.data.coinsEarned,
      },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },
};


/**
 * A member buying for themselves online.
 *
 * The buyer is always whoever is signed in — the request never names a
 * membership, because accepting one would let a member put a purchase on
 * somebody else's account.
 */
export const storeCheckoutController = {
  async start(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, storeCheckoutSchema);
    if (!parsed.ok) return parsed.response;

    const user = c.get("authUser");
    const membership = await paymentRepository.findMembershipByUser(tenantId, user.id);
    if (!membership) return forbidden(c, "You are not a member of this gym.");

    const result = await storeCheckoutService.start(tenantId, membership.id, parsed.data, user.id);
    if ("error" in result) {
      if (result.status === 409) return conflict(c, result.error!);
      if (result.status === 404) return notFound(c, result.error!);
      return badRequest(c, result.error!);
    }

    return ok(c, result.data, 201);
  },

  async verify(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, storeCheckoutVerifySchema);
    if (!parsed.ok) return parsed.response;

    const user = c.get("authUser");
    const membership = await paymentRepository.findMembershipByUser(tenantId, user.id);
    if (!membership) return forbidden(c, "You are not a member of this gym.");

    const result = await storeCheckoutService.verify(tenantId, membership.id, parsed.data);
    if ("error" in result) {
      if (result.status === 409) return conflict(c, result.error!);
      if (result.status === 404) return notFound(c, result.error!);
      return badRequest(c, result.error!);
    }

    await auditLog({
      action: "UPDATE",
      entity: "StoreOrder",
      entityId: result.data.orderId,
      actorId: user.id,
      tenantId,
      metadata: { settled: !result.data.alreadySettled },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  async cancel(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const orderId = c.req.param("orderId")!;

    const user = c.get("authUser");
    const membership = await paymentRepository.findMembershipByUser(tenantId, user.id);
    if (!membership) return forbidden(c, "You are not a member of this gym.");

    const result = await storeCheckoutService.cancel(tenantId, membership.id, orderId);
    if ("error" in result) return notFound(c, result.error!);

    return ok(c, result.data);
  },
};
