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
import {
  adjustStockSchema,
  createProductSchema,
  createVariantSchema,
  listProductsSchema,
  updateProductSchema,
  updateVariantSchema,
} from "./store.schema";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { conflict, notFound, ok } from "../../lib/response";
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
