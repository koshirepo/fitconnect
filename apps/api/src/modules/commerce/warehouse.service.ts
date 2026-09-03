/**
 * Documentation: Warehouse service — the shop's pickup locations, and Delhivery's.
 *
 * - Owns the two-sided life of a warehouse: a row here, and a registered pickup location at Delhivery. Creating one does both, because a warehouse Delhivery has never heard of cannot ship, and a name typed into two systems separately eventually differs by a space.
 * - Registration failing is not creation failing. The warehouse is kept with the courier's refusal recorded on it, so an operator can fix the address and retry instead of re-entering everything.
 * - Falls back to the `wrangler.toml` pickup location when no warehouse rows exist at all, which is exactly the single-warehouse deployment this replaced.
 * - Primary exports: warehouseService.
 */
import { config } from "../../config";
import {
  DelhiveryError,
  registerWarehouse,
  requestPickup,
  updateWarehouse,
  type DelhiveryWarehouse,
} from "../../lib/delhivery";
import { shippingService } from "./shipping.service";
import { warehouseRepository } from "./warehouse.repository";

type WarehouseRow = {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string;
  email: string | null;
  address: string;
  city: string;
  state: string;
  pincode: string;
  returnAddress: string | null;
  returnCity: string | null;
  returnState: string | null;
  returnPincode: string | null;
};

/** The row, in the shape the courier's API wants. */
function toDelhivery(warehouse: WarehouseRow): DelhiveryWarehouse {
  return {
    name: warehouse.name,
    phone: warehouse.phone,
    email: warehouse.email ?? undefined,
    address: warehouse.address,
    city: warehouse.city,
    state: warehouse.state,
    pincode: warehouse.pincode,
    contactPerson: warehouse.contactPerson ?? undefined,
    returnAddress: warehouse.returnAddress ?? undefined,
    returnCity: warehouse.returnCity ?? undefined,
    returnState: warehouse.returnState ?? undefined,
    returnPincode: warehouse.returnPincode ?? undefined,
  };
}

export const warehouseService = {
  async listWarehouses(includeInactive = true) {
    const { warehouses, total } = await warehouseRepository.listWarehouses(includeInactive);
    return { data: { warehouses }, total };
  },

  async getWarehouse(warehouseId: string) {
    const warehouse = await warehouseRepository.findById(warehouseId);
    if (!warehouse) return { error: "Warehouse not found.", status: 404 as const };

    const pickups = await warehouseRepository.listPickupRequests(warehouseId);
    const pendingShipments = await warehouseRepository.countPendingShipments(warehouseId);

    return { data: { warehouse, pickups, pendingShipments } };
  },

  /**
   * Create a warehouse here and register it there.
   *
   * The first warehouse becomes the default whether or not it was asked for:
   * with one warehouse and no default, every product without an explicit
   * warehouse would be unshippable for no reason anyone chose.
   */
  async createWarehouse(input: {
    name: string;
    contactPerson?: string;
    phone: string;
    email?: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    returnAddress?: string;
    returnCity?: string;
    returnState?: string;
    returnPincode?: string;
    isDefault?: boolean;
    /** Already a pickup location in Delhivery — link it rather than create it. */
    alreadyRegistered?: boolean;
  }) {
    const existing = await warehouseRepository.findByName(input.name);
    if (existing) {
      return { error: "A warehouse with that name already exists.", status: 409 as const };
    }

    const { alreadyRegistered, ...fields } = input;

    const { total } = await warehouseRepository.listWarehouses();
    const warehouse = await warehouseRepository.create({
      ...fields,
      isDefault: fields.isDefault || total === 0,
    });

    if (warehouse.isDefault) await warehouseRepository.setDefault(warehouse.id);

    /**
     * A location the operator says Delhivery already holds is taken on trust
     * and never sent to the courier.
     *
     * There is nothing to check it against — Delhivery will not list what it
     * has — and creating it again would either be refused or leave a duplicate
     * pickup location that quietly competes with the real one. If the name is
     * wrong, the first manifest says so, which is the earliest anything could.
     */
    if (alreadyRegistered) {
      const linked = await warehouseRepository.markRegistered(warehouse.id, null);
      return { data: { warehouse: linked, registerError: null } };
    }

    const registered = await this.registerWithCourier(warehouse.id);

    if ("error" in registered) {
      // The warehouse exists here even when Delhivery would not take it. Re-read
      // rather than returning the row from before the attempt: the refusal was
      // written to it, and a screen showing a clean row beside an error message
      // is the kind of disagreement that gets reported as a bug.
      const saved = await warehouseRepository.findById(warehouse.id);
      return { data: { warehouse: saved ?? warehouse, registerError: registered.error! } };
    }

    return { data: { warehouse: registered.data.warehouse, registerError: null } };
  },

  async updateWarehouse(
    warehouseId: string,
    input: Partial<{
      contactPerson: string;
      phone: string;
      email: string;
      address: string;
      city: string;
      state: string;
      pincode: string;
      returnAddress: string;
      returnCity: string;
      returnState: string;
      returnPincode: string;
      isActive: boolean;
      isDefault: boolean;
    }>,
  ) {
    const existing = await warehouseRepository.findById(warehouseId);
    if (!existing) return { error: "Warehouse not found.", status: 404 as const };

    const { isDefault, ...fields } = input;
    let warehouse = await warehouseRepository.update(warehouseId, fields);

    if (isDefault) warehouse = await warehouseRepository.setDefault(warehouseId);

    // Address changes have to reach Delhivery or the label prints the old one.
    // A courier that refuses is recorded, not thrown: the row is already saved.
    const pushed = await this.pushToCourier(warehouse, "update");

    return {
      data: {
        warehouse: pushed.warehouse ?? warehouse,
        registerError: pushed.error,
      },
    };
  },

  /**
   * Put a warehouse on Delhivery's books, or say why not.
   *
   * Safe to call again: a name Delhivery already holds comes back as a conflict
   * and is treated as registered, because that is what it is.
   */
  async registerWithCourier(warehouseId: string) {
    const warehouse = await warehouseRepository.findById(warehouseId);
    if (!warehouse) return { error: "Warehouse not found.", status: 404 as const };

    const pushed = await this.pushToCourier(warehouse, "create");
    if (pushed.error) return { error: pushed.error, status: 502 as const };

    // Non-null by construction: the row was read at the top of this method.
    return { data: { warehouse: pushed.warehouse ?? warehouse } };
  },

  /**
   * The one place that talks to the courier about a warehouse.
   *
   * Returns rather than throws, and always hands back a row: every caller wants
   * to save something and show the operator what happened.
   */
  async pushToCourier(warehouse: Awaited<ReturnType<typeof warehouseRepository.findById>>, mode: "create" | "update") {
    if (!warehouse) return { warehouse, error: "Warehouse not found." };

    const delhivery = shippingService.resolveConfig();
    if (!delhivery) {
      const saved = await warehouseRepository.markRegistered(
        warehouse.id,
        "No Delhivery token is configured, so this warehouse is not registered with the courier.",
      );
      return { warehouse: saved, error: saved.registerError };
    }

    try {
      const payload = toDelhivery(warehouse);
      if (mode === "create") {
        await registerWarehouse(delhivery, payload);
      } else {
        await updateWarehouse(delhivery, payload);
      }
      const saved = await warehouseRepository.markRegistered(warehouse.id, null);
      return { warehouse: saved, error: null };
    } catch (err) {
      if (err instanceof DelhiveryError) {
        const detail = `${err.message}${err.detail ? ` ${err.detail}` : ""}`;
        /**
         * Delhivery rejects a name it already holds, and for our purposes that
         * is the desired end state rather than a failure — the pickup location
         * exists, which is all registering was for.
         *
         * Matched narrowly, because Delhivery says "ClientWarehouse matching
         * query does not exist" when the warehouse is *missing* — the exact
         * opposite — and a test for the bare word "exist" read that as success.
         * A warehouse it had never heard of was then stamped as registered, and
         * the failure only surfaced later, as a refused manifest.
         */
        const alreadyThere =
          /already/i.test(detail ?? "") &&
          !/does not exist|not found|matching query/i.test(detail ?? "");
        const saved = await warehouseRepository.markRegistered(
          warehouse.id,
          alreadyThere ? null : detail,
        );
        return { warehouse: saved, error: alreadyThere ? null : detail };
      }
      throw err;
    }
  },

  async deleteWarehouse(warehouseId: string) {
    const existing = await warehouseRepository.findById(warehouseId);
    if (!existing) return { error: "Warehouse not found.", status: 404 as const };

    const productCount = await warehouseRepository.countProducts(warehouseId);
    if (productCount > 0) {
      return {
        error: `${productCount} product${productCount === 1 ? "" : "s"} still ship from this warehouse. Move them first, or mark it inactive instead.`,
        status: 409 as const,
      };
    }

    // Delhivery has no delete: a pickup location stays on their books, and this
    // only stops us manifesting from it.
    const warehouse = await warehouseRepository.delete(warehouseId);
    return { data: { warehouse } };
  },

  /**
   * Ask Delhivery to collect from a warehouse.
   *
   * The package count defaults to what is actually waiting — parcels manifested
   * from there and not yet picked up — because that is the number the driver
   * needs and the one an operator would otherwise count by hand.
   */
  async schedulePickup(
    warehouseId: string,
    input: { pickupDate: string; pickupTime: string; expectedPackageCount?: number },
    requestedById?: string,
  ) {
    const warehouse = await warehouseRepository.findById(warehouseId);
    if (!warehouse) return { error: "Warehouse not found.", status: 404 as const };

    if (!warehouse.registeredAt) {
      return {
        error: "This warehouse is not registered with Delhivery yet, so nothing can be collected from it.",
        status: 409 as const,
      };
    }

    const delhivery = shippingService.resolveConfig();
    if (!delhivery) {
      return { error: "No Delhivery token is configured.", status: 409 as const };
    }

    const pending = await warehouseRepository.countPendingShipments(warehouseId);
    const expectedPackageCount = input.expectedPackageCount ?? Math.max(pending, 1);

    try {
      const result = await requestPickup(delhivery, {
        warehouseName: warehouse.name,
        pickupDate: input.pickupDate,
        pickupTime: input.pickupTime,
        expectedPackageCount,
      });

      const pickup = await warehouseRepository.createPickupRequest({
        warehouseId,
        pickupId: result.pickupId,
        pickupDate: input.pickupDate,
        pickupTime: input.pickupTime,
        expectedPackageCount,
        status: "REQUESTED",
        requestedById,
      });

      return { data: { pickup } };
    } catch (err) {
      if (err instanceof DelhiveryError) {
        const detail = `${err.message}${err.detail ? ` ${err.detail}` : ""}`;
        // Recorded even in failure: an operator chasing a collection that never
        // happened needs to see that it was asked for and refused.
        await warehouseRepository.createPickupRequest({
          warehouseId,
          pickupId: null,
          pickupDate: input.pickupDate,
          pickupTime: input.pickupTime,
          expectedPackageCount,
          status: "FAILED",
          note: detail,
          requestedById,
        });
        return { error: detail, status: 502 as const };
      }
      throw err;
    }
  },

  /**
   * Which warehouse actually ships a product.
   *
   * The product's own, then the default row, then the deployment's configured
   * pickup location for a shop that never entered warehouses at all. The last
   * case is the single-warehouse setup this feature grew out of, and it keeps
   * working untouched.
   */
  async resolveForProduct(productWarehouseId: string | null) {
    if (productWarehouseId) {
      const warehouse = await warehouseRepository.findById(productWarehouseId);
      if (warehouse?.isActive) return warehouse;
    }

    const fallback = await warehouseRepository.findDefault();
    if (fallback) return fallback;

    if (!config.delhiveryPickupLocation) return null;

    // The configured pickup location, dressed as a row. Nothing writes it, and
    // it exists only so a deployment with no warehouse records can still ship.
    return {
      id: "",
      name: config.delhiveryPickupLocation,
      contactPerson: null,
      phone: "",
      email: null,
      address: "",
      city: "",
      state: "",
      pincode: config.delhiveryOriginPincode,
      returnAddress: null,
      returnCity: null,
      returnState: null,
      returnPincode: null,
      isDefault: true,
      isActive: true,
      registeredAt: new Date(),
      registerError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  },
};
