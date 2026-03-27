import type { Context } from "hono";
import { parseBody } from "../../lib/http";
import { parsePagination } from "../../lib/pagination";
import { auditLog } from "../../lib/audit";
import { ok, okPaginated, badRequest, notFound } from "../../lib/response";
import { commerceService } from "./commerce.service";
import {
  createProductSchema,
  placeOrderSchema,
  updateOrderStatusSchema,
  updateProductSchema,
} from "./commerce.schema";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const commerceController = {
  async listPublicProducts(c: AppContext) {
    const { page, limit } = parsePagination(c);
    const category = c.req.query("category");
    const search = c.req.query("search");
    const { data, total } = await commerceService.listPublicProducts(page, limit, category, search);
    return okPaginated(c, data, { page, limit, total });
  },

  async getPublicProductById(c: AppContext) {
    const productId = c.req.param("id")!;
    const result = await commerceService.getPublicProductById(productId);
    if ("error" in result) return notFound(c, result.error!);
    return ok(c, result.data);
  },

  async placeOrder(c: AppContext) {
    const parsed = await parseBody(c, placeOrderSchema);
    if (!parsed.ok) return parsed.response;

    const userId = c.get("optionalAuthUser")?.id;
    const result = await commerceService.placeOrder(parsed.data, userId);
    if ("error" in result) return badRequest(c, result.error!);
    return ok(c, result.data, 201);
  },

  async getOrderById(c: AppContext) {
    const orderId = c.req.param("id")!;
    const result = await commerceService.getOrderById(orderId);
    if ("error" in result) return notFound(c, result.error!);
    return ok(c, result.data);
  },

  async listMyOrders(c: AppContext) {
    const { page, limit } = parsePagination(c);
    const userId = c.get("authUser").id;
    const { data, total } = await commerceService.listMyOrders(userId, page, limit);
    return okPaginated(c, data, { page, limit, total });
  },

  async listAdminProducts(c: AppContext) {
    const { page, limit } = parsePagination(c);
    const includeInactive = c.req.query("includeInactive") !== "false";
    const category = c.req.query("category");
    const search = c.req.query("search");
    const { data, total } = await commerceService.listAdminProducts(
      page,
      limit,
      includeInactive,
      category,
      search,
    );
    return okPaginated(c, data, { page, limit, total });
  },

  async createProduct(c: AppContext) {
    const parsed = await parseBody(c, createProductSchema);
    if (!parsed.ok) return parsed.response;
    const result = await commerceService.createProduct(parsed.data);
    if ("error" in result) return badRequest(c, result.error!);

    await auditLog({
      action: "CREATE",
      entity: "Product",
      entityId: result.data.product.id,
      actorId: c.get("authUser").id,
      metadata: { category: parsed.data.category, price: parsed.data.price },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  async updateProduct(c: AppContext) {
    const productId = c.req.param("productId")!;
    const parsed = await parseBody(c, updateProductSchema);
    if (!parsed.ok) return parsed.response;

    const result = await commerceService.updateProduct(productId, parsed.data);
    if ("error" in result) {
      if (result.status === 404) return notFound(c, result.error!);
      return badRequest(c, result.error!);
    }

    await auditLog({
      action: "UPDATE",
      entity: "Product",
      entityId: productId,
      actorId: c.get("authUser").id,
      metadata: { fields: Object.keys(parsed.data) },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  async listAdminOrders(c: AppContext) {
    const { page, limit } = parsePagination(c);
    const status = c.req.query("status");
    const { data, total } = await commerceService.listAllOrders(page, limit, status);
    return okPaginated(c, data, { page, limit, total });
  },

  async getAdminOrderById(c: AppContext) {
    const orderId = c.req.param("orderId")!;
    const result = await commerceService.getOrderById(orderId);
    if ("error" in result) return notFound(c, result.error!);
    return ok(c, result.data);
  },

  async updateOrderStatus(c: AppContext) {
    const orderId = c.req.param("orderId")!;
    const parsed = await parseBody(c, updateOrderStatusSchema);
    if (!parsed.ok) return parsed.response;

    const result = await commerceService.updateOrderStatus(orderId, parsed.data.status);
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "UPDATE",
      entity: "Order",
      entityId: orderId,
      actorId: c.get("authUser").id,
      metadata: { from: result.previousStatus, to: parsed.data.status },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },
};
