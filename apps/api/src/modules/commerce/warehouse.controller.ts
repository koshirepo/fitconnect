/**
 * Documentation: Warehouse controller.
 *
 * - The HTTP boundary for pickup locations: listing them, creating them here and at Delhivery in one action, correcting them, retiring them, and asking the courier to collect.
 * - Registration outcomes are reported, never thrown. A warehouse Delhivery refused is still a warehouse; the response carries the refusal so the screen can show it beside the row instead of losing the entry.
 * - Every write is audited — a changed pickup address is why a parcel went to the wrong building three weeks later.
 * - Primary exports: warehouseController.
 */
import type { Context } from "hono";
import { parseBody } from "../../lib/http";
import { auditLog } from "../../lib/audit";
import { ok, failWith } from "../../lib/response";
import { shippingService } from "./shipping.service";
import { warehouseService } from "./warehouse.service";
import {
  createWarehouseSchema,
  schedulePickupSchema,
  updateWarehouseSchema,
} from "./commerce.schema";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const warehouseController = {
  /**
   * Reserve waybill numbers from the courier.
   *
   * Behind the order permissions rather than the catalog ones: an AWB is
   * fulfilment stationery, and reserving a block is a dispatch decision.
   */
  async reserveWaybills(c: Context) {
    const requested = Number(c.req.query("count") ?? "1");
    const count = Number.isFinite(requested) ? requested : 1;

    const result = await shippingService.reserveWaybills(count);
    if ("error" in result) return failWith(c, result);

    return ok(c, result.data);
  },

  /** Handle the `list warehouses` HTTP action for the commerce module. */
  async listWarehouses(c: AppContext) {
    const includeInactive = c.req.query("includeInactive") !== "false";
    const result = await warehouseService.listWarehouses(includeInactive);
    return ok(c, result.data);
  },

  /** Handle the `get warehouse` HTTP action, with its recent pickup requests. */
  async getWarehouse(c: AppContext) {
    const warehouseId = c.req.param("warehouseId")!;
    const result = await warehouseService.getWarehouse(warehouseId);
    if ("error" in result) return failWith(c, result);
    return ok(c, result.data);
  },

  /** Handle the `create warehouse` HTTP action, registering it with Delhivery. */
  async createWarehouse(c: AppContext) {
    const parsed = await parseBody(c, createWarehouseSchema);
    if (!parsed.ok) return parsed.response;

    const result = await warehouseService.createWarehouse(parsed.data);
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "CREATE",
      entity: "Warehouse",
      entityId: result.data.warehouse.id,
      actorId: c.get("authUser").id,
      metadata: {
        name: result.data.warehouse.name,
        registered: Boolean(result.data.warehouse.registeredAt),
      },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  /** Handle the `update warehouse` HTTP action, pushing changes to Delhivery. */
  async updateWarehouse(c: AppContext) {
    const warehouseId = c.req.param("warehouseId")!;
    const parsed = await parseBody(c, updateWarehouseSchema);
    if (!parsed.ok) return parsed.response;

    const result = await warehouseService.updateWarehouse(warehouseId, parsed.data);
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "UPDATE",
      entity: "Warehouse",
      entityId: warehouseId,
      actorId: c.get("authUser").id,
      metadata: { fields: Object.keys(parsed.data) },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /** Handle the `register warehouse` HTTP action — retry a refused registration. */
  async registerWarehouse(c: AppContext) {
    const warehouseId = c.req.param("warehouseId")!;
    const result = await warehouseService.registerWithCourier(warehouseId);
    if ("error" in result) return failWith(c, result);
    return ok(c, result.data);
  },

  /** Handle the `delete warehouse` HTTP action. */
  async deleteWarehouse(c: AppContext) {
    const warehouseId = c.req.param("warehouseId")!;
    const result = await warehouseService.deleteWarehouse(warehouseId);
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "DELETE",
      entity: "Warehouse",
      entityId: warehouseId,
      actorId: c.get("authUser").id,
      metadata: { name: result.data.warehouse.name },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /** Handle the `schedule pickup` HTTP action for one warehouse. */
  async schedulePickup(c: AppContext) {
    const warehouseId = c.req.param("warehouseId")!;
    const parsed = await parseBody(c, schedulePickupSchema);
    if (!parsed.ok) return parsed.response;

    const result = await warehouseService.schedulePickup(
      warehouseId,
      parsed.data,
      c.get("authUser").id,
    );
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "CREATE",
      entity: "PickupRequest",
      entityId: result.data.pickup.id,
      actorId: c.get("authUser").id,
      metadata: {
        warehouseId,
        pickupDate: parsed.data.pickupDate,
        packages: result.data.pickup.expectedPackageCount,
      },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },
};
