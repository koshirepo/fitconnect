/**
 * Documentation: Shipping service — the shop's side of Delhivery.
 *
 * - Owns everything the storefront needs from a courier: whether an address can be delivered to, what carriage costs, booking the parcel out, tracking it, booking the return, and calling a consignment off.
 * - Shipping is optional infrastructure. With no token or no warehouse the shop still sells: quotes come back as free, and booking is refused with a message an operator can act on rather than an exception a buyer sees. What can be done is decided from the warehouse records, with the `wrangler.toml` pickup location as the fallback for a deployment that has none.
 * - Delhivery is never called on a page view. Tracking is synced at most once every few minutes per shipment and served from the stored scans in between, so a buyer refreshing an order page cannot rate-limit the courier account.
 * - Quotes are rounded up to whole rupees, in the shop's favour by at most a rupee, because the order total is an integer and a fractional carriage charge cannot be collected.
 * - Primary exports: shippingService.
 */
import { config } from "../../config";
import {
  DelhiveryError,
  cancelShipment,
  checkPincodeServiceability,
  createReverseShipment,
  createShipment,
  estimateShippingCharge,
  fetchPackingSlip,
  fetchWaybills,
  mapDelhiveryStatus,
  trackShipment,
  type DelhiveryConfig,
  type DelhiveryTrackingPush,
} from "../../lib/delhivery";
import { commerceRepository } from "./commerce.repository";
import { shippingRepository } from "./shipping.repository";
import { warehouseService } from "./warehouse.service";

/** How stale stored tracking may be before a read goes back to Delhivery. */
const TRACKING_TTL_MS = 5 * 60 * 1000;

/**
 * What a parcel is billed on: weight, size, and the distance between two pincodes.
 *
 * Distance is Delhivery's business — it prices origin to destination as a zone,
 * which is why a quote is asked per warehouse rather than once per order. The
 * other two are ours to compute, and this is the arithmetic every courier in
 * India uses:
 *
 *   volumetric kg = length × width × height (cm) ÷ divisor
 *   chargeable    = max(actual, volumetric)
 *
 * Without it a yoga mat ships for the price of its 1.2kg, and the shop pays the
 * difference on a box that fills a shelf.
 */
function volumetricGrams(cubicCm: number, divisor: number) {
  return Math.round((cubicCm / divisor) * 1000);
}

/**
 * A parcel's billable weight, and how it got there.
 *
 * Volumes are summed rather than boxed: working out how several items actually
 * pack into one carton is a bin-packing problem, and every courier's own
 * calculator makes the same simplifying assumption.
 */
function chargeableWeight(
  items: Array<{ weightGrams: number; cubicCm: number; quantity: number }>,
  divisor: number,
) {
  const actualGrams = items.reduce((sum, item) => sum + item.weightGrams * item.quantity, 0);
  const cubicCm = items.reduce((sum, item) => sum + item.cubicCm * item.quantity, 0);
  const volumetric = volumetricGrams(cubicCm, divisor);

  return {
    actualGrams,
    volumetricGrams: volumetric,
    cubicCm,
    // Delhivery prices a minimum slab anyway, and a zero-gram parcel is a
    // rejected manifest rather than a free one.
    chargeableGrams: Math.max(actualGrams, volumetric, 50),
  };
}

/**
 * The box a parcel is declared in.
 *
 * The largest single item is a floor, not an answer: two of a thing do not fit
 * in the space of one, and a basket of six shakers was being declared as one
 * shaker. Delhivery re-measures at the hub and bills the difference, so the
 * under-declaration was not a saving — it was a surprise on the invoice, and
 * one the quote shown at checkout had already got wrong.
 *
 * So the box is grown until it holds the volume actually going into it, which
 * is the same total the volumetric weight is computed from. Growing the
 * shortest side keeps the carton compact rather than turning it into a long
 * thin thing no courier would recognise. Still an estimate — packing several
 * shapes into one box properly is bin-packing, and no courier's own calculator
 * attempts it either — but an estimate that errs the way an invoice does.
 */
function cartonFor(
  box: { lengthCm: number; widthCm: number; heightCm: number },
  cubicCm: number,
) {
  const dimensions = [
    Math.max(1, box.lengthCm),
    Math.max(1, box.widthCm),
    Math.max(1, box.heightCm),
  ];

  // Grow the smallest side until the box holds what is going in it. Bounded
  // rather than looped on a float comparison: 64 doublings is far past any
  // real basket, and an unbounded loop here would be a hang.
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const volume = dimensions[0]! * dimensions[1]! * dimensions[2]!;
    if (volume >= cubicCm) break;

    const shortest = dimensions.indexOf(Math.min(...dimensions));
    dimensions[shortest] = Math.ceil(
      dimensions[shortest]! * Math.min(2, Math.max(1.2, cubicCm / volume)),
    );
  }

  return {
    lengthCm: dimensions[0]!,
    widthCm: dimensions[1]!,
    heightCm: dimensions[2]!,
  };
}

/** Once a parcel reaches one of these there is nothing further to sync. */
const TERMINAL_SHIPMENT_STATUSES = new Set(["DELIVERED", "RTO", "CANCELLED"]);

/**
 * What a consignment's state means for the order carrying it.
 *
 * Only the forward states appear: a parcel coming back is the returns flow, and
 * RTO is a decision the shop records rather than a step the order walks into.
 */
const ORDER_STATUS_BY_SHIPMENT: Record<string, string> = {
  MANIFESTED: "SHIPPED",
  IN_TRANSIT: "IN_TRANSIT",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
};

/**
 * The order fields this service needs to book anything.
 * Declared structurally so the repository's select shape stays its own business.
 */
type ShippableOrder = {
  id: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string;
  buyerAddress: string;
  buyerCity: string | null;
  buyerState: string | null;
  buyerPincode: string | null;
  totalAmount: number;
  items: Array<{ productId: string; productName: string; quantity: number }>;
};

export const shippingService = {
  /**
   * What the deployment can actually do, which is not all-or-nothing.
   *
   * Each capability needs a different piece: checking a pincode needs only the
   * token, pricing also needs somewhere to price from, and booking needs a
   * warehouse Delhivery has on file. A shop with just a token still gets
   * serviceability checks rather than nothing.
   */
  canCheckPincodes() {
    return Boolean(config.delhiveryToken);
  },

  canQuote() {
    return Boolean(config.delhiveryToken && config.delhiveryOriginPincode);
  },

  /**
   * Why a booking cannot go out, naming only what is actually missing.
   *
   * Asks the warehouse records, not the environment. `DELHIVERY_PICKUP_LOCATION`
   * is the fallback for a deployment that never entered a warehouse, so telling
   * an operator to go and set it — when they have a perfectly good warehouse on
   * the Warehouses screen — sends them to fix something that is not broken.
   *
   * Three distinct answers, because they need three different actions: no token
   * is a deployment setting, no warehouse is a record to create, and a warehouse
   * the courier has not accepted is a registration to retry.
   */
  async bookingBlockedReason(): Promise<string | null> {
    if (!config.delhiveryToken) {
      return "Shipping is not configured: set DELHIVERY_API_TOKEN to book a courier.";
    }

    const warehouse = await warehouseService.resolveForProduct(null);
    if (!warehouse) {
      return "No warehouse is set up to ship from. Add one under Commerce → Warehouses — it is registered with Delhivery as you save it.";
    }

    if (!warehouse.registeredAt) {
      return `"${warehouse.name}" is not registered with Delhivery yet, so nothing can be manifested from it. Open Commerce → Warehouses and retry the registration.`;
    }

    return null;
  },

  /**
   * Reserve waybill numbers from Delhivery.
   *
   * Not part of placing or shipping an order — manifestation assigns its own.
   * This is for the operator who needs numbers in hand first: a block of labels
   * to print, or AWBs to give a courier to reconcile against.
   */
  async reserveWaybills(count: number) {
    const delhivery = this.resolveConfig();
    if (!delhivery) {
      return { error: "Shipping is not configured.", status: 409 as const };
    }

    try {
      const waybills = await fetchWaybills(delhivery, count);
      return { data: { waybills, count: waybills.length } };
    } catch (err) {
      if (err instanceof DelhiveryError) {
        return {
          error: err.detail ? `${err.message} ${err.detail}` : err.message,
          status: 502 as const,
        };
      }
      throw err;
    }
  },

  /** The client config, or null when the deployment has no token at all. */
  resolveConfig(): DelhiveryConfig | null {
    if (!config.delhiveryToken) return null;
    return {
      token: config.delhiveryToken,
      baseUrl: config.delhiveryBaseUrl,
      pickupLocation: config.delhiveryPickupLocation,
      originPincode: config.delhiveryOriginPincode,
      clientName: config.delhiveryClientName,
    };
  },

  /**
   * Can this pincode be delivered to, and can a return be collected from it?
   *
   * With no courier configured every pincode is reported serviceable: the shop
   * is then shipping by hand, and refusing the buyer's address would be a
   * courier's answer to a question no courier was asked.
   */
  async checkServiceability(pincode: string) {
    const delhivery = this.resolveConfig();
    if (!delhivery) {
      return {
        data: {
          pincode,
          serviceable: true,
          city: null,
          state: null,
          prepaid: true,
          cod: false,
          pickupAvailable: false,
          courierConfigured: false,
        },
      };
    }

    try {
      const result = await checkPincodeServiceability(delhivery, pincode);
      return { data: { ...result, courierConfigured: true } };
    } catch (err) {
      if (err instanceof DelhiveryError) {
        return { error: "Could not check that pincode right now.", status: 502 as const };
      }
      throw err;
    }
  },

  /**
   * Split a basket into the parcels it will actually become.
   *
   * One group per warehouse, because Delhivery manifests one consignment per
   * pickup location: a basket drawing on two warehouses is two parcels, two
   * waybills and two carriage charges, and pretending otherwise at checkout
   * only moves the surprise to the invoice.
   *
   * Items whose warehouse cannot be resolved are dropped rather than guessed
   * at. Somewhere else has to notice that and refuse; quoting them against an
   * arbitrary origin would put a number on a parcel nobody can send.
   */
  async groupByWarehouse(items: Array<{ productId: string; quantity: number }>) {
    const facts = await shippingRepository.productShippingFacts(
      items.map((item) => item.productId),
    );

    const divisor = config.volumetricDivisor;

    const groups = new Map<
      string,
      {
        warehouse: Awaited<ReturnType<typeof warehouseService.resolveForProduct>>;
        items: Array<{ productId: string; quantity: number }>;
        measures: Array<{ weightGrams: number; cubicCm: number; quantity: number }>;
        /** Largest single dimension in the parcel, for the manifest's box. */
        lengthCm: number;
        widthCm: number;
        heightCm: number;
      }
    >();
    const unassigned: string[] = [];

    for (const item of items) {
      const product = facts.get(item.productId);
      if (!product) continue;

      const warehouse = await warehouseService.resolveForProduct(product.warehouseId);
      if (!warehouse) {
        unassigned.push(product.name);
        continue;
      }

      // Keyed by name rather than id: the fallback warehouse from config has no
      // id, and the name is what Delhivery groups by anyway.
      const key = warehouse.name;
      const group =
        groups.get(key) ??
        { warehouse, items: [], measures: [], lengthCm: 0, widthCm: 0, heightCm: 0 };

      group.items.push(item);
      group.measures.push({
        weightGrams: product.weightGrams,
        cubicCm: product.lengthCm * product.widthCm * product.heightCm,
        quantity: item.quantity,
      });
      // The carton has to be at least as big as the largest thing in it.
      group.lengthCm = Math.max(group.lengthCm, product.lengthCm);
      group.widthCm = Math.max(group.widthCm, product.widthCm);
      group.heightCm = Math.max(group.heightCm, product.heightCm);

      groups.set(key, group);
    }

    return {
      groups: [...groups.values()].map((group) => {
        const weight = chargeableWeight(group.measures, divisor);
        return { ...group, ...weight, ...cartonFor(group, weight.cubicCm) };
      }),
      unassigned,
    };
  },

  /**
   * What carriage costs for a basket going to this pincode, in whole rupees.
   *
   * Priced per parcel and summed: each warehouse quotes from its own pincode,
   * and a Delhi warehouse and a Bihar one do not charge the same to reach
   * Bangalore. The weight comes from the products, never from the request.
   */
  async quote(items: Array<{ productId: string; quantity: number }>, pincode: string) {
    const delhivery = this.resolveConfig();
    // No token: carriage is free rather than unknown, which is what a shop
    // delivering by hand actually charges.
    if (!delhivery) {
      return {
        data: {
          shippingAmount: 0,
          courierConfigured: false,
          quoteIssue: "No courier is configured, so carriage was not priced.",
        },
      };
    }

    const { groups } = await this.groupByWarehouse(items);

    // Nothing resolved to a warehouse, and no origin configured either: there
    // is no origin to price from, so there is no price to give.
    if (groups.length === 0 && !this.canQuote()) {
      return {
        data: {
          shippingAmount: 0,
          courierConfigured: false,
          quoteIssue:
            "Nothing in this order ships from a warehouse, and no origin pincode is configured, so carriage was not priced.",
        },
      };
    }

    try {
      let shippingAmount = 0;
      let weightGrams = 0;
      // Worth telling the buyer: a light parcel priced on its size looks wrong
      // otherwise.
      let volumetricUsed = false;
      /** Warehouses that could not be priced from, named for the operator. */
      const unpriced: string[] = [];

      for (const group of groups) {
        const originPincode = group.warehouse?.pincode || config.delhiveryOriginPincode;
        // A warehouse with no pincode cannot be priced from. Free beats wrong —
        // but the parcel is counted, because a shop that ships one of two
        // parcels free should be told which and why.
        if (!originPincode) {
          unpriced.push(group.warehouse?.name ?? "an unnamed warehouse");
          continue;
        }

        const rupees = await estimateShippingCharge(delhivery, {
          destinationPincode: pincode,
          weightGrams: group.chargeableGrams,
          originPincode,
        });

        shippingAmount += Math.ceil(rupees);
        weightGrams += group.chargeableGrams;
        volumetricUsed = volumetricUsed || group.volumetricGrams > group.actualGrams;
      }

      return {
        data: {
          shippingAmount,
          courierConfigured: true,
          weightGrams,
          /** True when size, not mass, decided the price. */
          volumetricUsed,
          /** How many parcels this basket becomes, which the buyer should know. */
          parcelCount: groups.length,
          quoteIssue:
            unpriced.length > 0
              ? `Carriage was not priced for ${unpriced.length} of ${groups.length} parcel${groups.length === 1 ? "" : "s"}: ${unpriced.join(", ")} has no pincode to ship from.`
              : null,
        },
      };
    } catch (err) {
      if (err instanceof DelhiveryError) {
        return { error: "Could not price shipping to that pincode.", status: 502 as const };
      }
      throw err;
    }
  },

  /**
   * Book the order out to the buyer — one parcel per warehouse it draws on.
   *
   * Each warehouse is booked independently and recorded as it succeeds, so a
   * courier refusing the second parcel leaves the first genuinely booked rather
   * than rolling back a consignment that now exists at Delhivery. The caller is
   * told what went out and what did not.
   *
   * Refuses rather than throws for every reason an operator could fix — no
   * courier configured, no pincode on the order, a product with no warehouse —
   * so none of it reads as a failure of the order itself.
   */
  /**
   * Why this order must not reach a real courier.
   *
   * Seed data exists to be walked through, and every screen it drives should
   * work — but manifesting it books a parcel to an invented address and bills
   * the account for it. The seeder says as much in its own header: dummy data
   * must not be able to manifest a real consignment.
   *
   * The check is on the live host rather than on some environment name,
   * because the host is what actually decides whose money is at stake. Against
   * Delhivery staging these orders book freely, which is the point of staging.
   */
  demoOrderReason(orderId: string): string | null {
    if (!config.delhiveryIsLive) return null;
    if (!orderId.startsWith("seed-")) return null;

    return (
      "This is a seeded demo order, and this deployment is pointed at live Delhivery. " +
      "Booking it would create a real consignment to an invented address and bill the account. " +
      "Point DELHIVERY_BASE_URL at staging to book it, or use a real order."
    );
  },

  /**
   * A courier refusal, said in a way the operator can act on.
   *
   * Delhivery sometimes ends a failure with "Package might have been partially
   * saved" — it could not charge the manifest, but the consignment may already
   * exist on its side. Reported as a plain failure that reads as an invitation
   * to press the button again, and a second press against a package Delhivery
   * did keep is how one order goes out twice. So the warning is carried
   * through rather than buried in courier wording.
   */
  describeRefusal(detail: string) {
    return /partially saved|might have been saved/i.test(detail)
      ? `${detail} Check this order in the Delhivery panel before retrying — a consignment may already exist there.`
      : detail;
  },

  async bookForwardShipment(order: ShippableOrder) {
    const blocked = await this.bookingBlockedReason();
    if (blocked) return { error: blocked, status: 409 as const };

    const demo = this.demoOrderReason(order.id);
    if (demo) return { error: demo, status: 409 as const };

    const delhivery = this.resolveConfig()!;
    if (!order.buyerPincode || !order.buyerCity || !order.buyerState) {
      return {
        error: "This order has no delivery pincode, so it cannot be shipped by courier.",
        status: 409 as const,
      };
    }

    const { groups, unassigned } = await this.groupByWarehouse(
      order.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    );

    if (unassigned.length > 0) {
      return {
        error: `No warehouse ships ${unassigned.join(", ")}. Assign one, or set a default warehouse.`,
        status: 409 as const,
      };
    }
    if (groups.length === 0) {
      return { error: "This order has nothing that can be shipped.", status: 409 as const };
    }

    const nameByProduct = new Map(order.items.map((item) => [item.productId, item.productName]));
    const booked = [];
    let alreadyBooked = 0;

    for (const group of groups) {
      const warehouseId = group.warehouse?.id || null;

      const existing = await shippingRepository.findActiveShipment(
        order.id,
        "FORWARD",
        warehouseId,
      );
      if (existing) {
        booked.push(existing);
        alreadyBooked += 1;
        continue;
      }

      const quantity = group.items.reduce((sum, item) => sum + item.quantity, 0);
      const description = group.items
        .map((item) => `${nameByProduct.get(item.productId) ?? "Item"} x${item.quantity}`)
        .join(", ")
        .slice(0, 250);

      // Declared value is this parcel's share, not the order's total: two
      // parcels each declaring the full amount would insure the order twice.
      const declaredValueRupees = Math.max(
        1,
        Math.round((order.totalAmount * quantity) / Math.max(1, order.items.reduce((sum, item) => sum + item.quantity, 0))),
      );

      try {
        const result = await createShipment(delhivery, {
          orderId: groups.length > 1 ? `${order.id}-${booked.length + 1}` : order.id,
          consignee: {
            name: order.buyerName,
            address: order.buyerAddress,
            city: order.buyerCity,
            state: order.buyerState,
            pincode: order.buyerPincode,
            phone: order.buyerPhone,
            email: order.buyerEmail,
          },
          declaredValueRupees,
          weightGrams: group.chargeableGrams,
          lengthCm: group.lengthCm,
          widthCm: group.widthCm,
          heightCm: group.heightCm,
          description,
          quantity,
          pickupLocation: group.warehouse?.name,
        });

        const shipment = await shippingRepository.createShipment({
          orderId: order.id,
          warehouseId,
          kind: "FORWARD",
          waybill: result.waybill,
          status: "MANIFESTED",
          statusDetail: result.remark,
          pickupLocation: group.warehouse?.name ?? delhivery.pickupLocation,
        });

        booked.push(shipment);
      } catch (err) {
        if (err instanceof DelhiveryError) {
          const detail = this.describeRefusal(
            err.detail ? `${err.message} ${err.detail}` : err.message,
          );
          return {
            error:
              booked.length > 0
                ? `${detail} ${booked.length} of ${groups.length} parcels were booked; retry to book the rest.`
                : detail,
            status: 502 as const,
          };
        }
        throw err;
      }
    }

    return {
      data: {
        shipment: booked[0]!,
        shipments: booked,
        alreadyBooked: alreadyBooked === groups.length,
      },
    };
  },

  /**
   * Book the parcel back from the buyer.
   *
   * The buyer's address becomes the origin and the warehouse the destination,
   * which is the whole difference between this and a forward booking.
   */
  async bookReverseShipment(order: ShippableOrder, returnRequestId: string) {
    const blocked = await this.bookingBlockedReason();
    if (blocked) return { error: blocked, status: 409 as const };

    const demo = this.demoOrderReason(order.id);
    if (demo) return { error: demo, status: 409 as const };

    const delhivery = this.resolveConfig()!;
    if (!order.buyerPincode || !order.buyerCity || !order.buyerState) {
      return {
        error: "This order has no pickup pincode, so a return cannot be collected.",
        status: 409 as const,
      };
    }

    const weightGrams = await shippingRepository.totalWeightGrams(
      order.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    );
    const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const description = order.items
      .map((item) => `${item.productName} x${item.quantity}`)
      .join(", ")
      .slice(0, 250);

    /**
     * Goods go back where they came from.
     *
     * The forward parcel records the warehouse it left, so a return follows it
     * rather than the default: sending a Bihar warehouse's stock back to a
     * Delhi one is how inventory ends up in the wrong building.
     */
    const outbound = await shippingRepository.findActiveShipment(order.id, "FORWARD");
    const destination = outbound?.pickupLocation ?? delhivery.pickupLocation;

    try {
      const result = await createReverseShipment(delhivery, {
        // Distinct from the order id: Delhivery rejects a reference it has
        // already manifested, and the forward parcel used the order id itself.
        referenceId: `${order.id}-R`,
        consignee: {
          name: order.buyerName,
          address: order.buyerAddress,
          city: order.buyerCity,
          state: order.buyerState,
          pincode: order.buyerPincode,
          phone: order.buyerPhone,
          email: order.buyerEmail,
        },
        declaredValueRupees: order.totalAmount,
        weightGrams,
        description,
        quantity,
        pickupLocation: destination,
      });

      const shipment = await shippingRepository.createShipment({
        orderId: order.id,
        warehouseId: outbound?.warehouseId ?? null,
        kind: "REVERSE",
        waybill: result.waybill,
        status: "MANIFESTED",
        statusDetail: result.remark,
        pickupLocation: destination,
      });

      await shippingRepository.attachReturnShipment(returnRequestId, shipment.id);

      return { data: { shipment } };
    } catch (err) {
      if (err instanceof DelhiveryError) {
        return {
          error: this.describeRefusal(
            err.detail ? `${err.message} ${err.detail}` : err.message,
          ),
          status: 502 as const,
        };
      }
      throw err;
    }
  },

  /**
   * Record one scan Delhivery pushed to us.
   *
   * The pull path asks the courier what happened when somebody opens the page;
   * this is the courier telling us as it happens, which is the difference
   * between an order that says DELIVERED and one that says so three days late.
   * Both end in the same two writes, so both agree about the outcome.
   *
   * A waybill we do not hold is not an error. Delhivery pushes for the whole
   * account, and a consignment booked by another system is simply not ours.
   */
  async recordTrackingPush(push: DelhiveryTrackingPush) {
    const shipment = await shippingRepository.findShipmentByWaybill(push.waybill);
    if (!shipment) return { data: { matched: false } };

    const status = mapDelhiveryStatus(push.status, push.statusDetail);

    // A terminal consignment stays where it is. A late scan for a parcel
    // already delivered, returned or cancelled has nothing left to say, and
    // replaying it would walk the order backwards.
    if (TERMINAL_SHIPMENT_STATUSES.has(shipment.status)) {
      return { data: { matched: true, applied: false } };
    }

    const scans = Array.isArray(shipment.scans) ? [...(shipment.scans as unknown[])] : [];
    scans.push({
      status: push.status,
      detail: push.statusDetail ?? "",
      location: push.location ?? "",
      scannedAt: push.scannedAt ?? new Date().toISOString(),
      ...(push.nslCode ? { nslCode: push.nslCode } : {}),
    });

    await shippingRepository.appendShipmentScan(shipment.id, {
      status,
      statusDetail: push.statusDetail,
      currentLocation: push.location,
      scans,
    });

    // Only the outbound parcel moves the order. A reverse consignment coming
    // back is the returns flow's business, and it owns those states itself.
    if (shipment.kind === "FORWARD") {
      await this.advanceOrderForShipment(shipment.orderId, status);
    }

    return { data: { matched: true, applied: true, status } };
  },

  /**
   * Carry a consignment's state onto the order it belongs to.
   *
   * Shared by the push above and the tracking page, because two paths deciding
   * separately what a scan means to an order is how they come to disagree.
   */
  async advanceOrderForShipment(orderId: string, shipmentStatus: string) {
    const mapped = ORDER_STATUS_BY_SHIPMENT[shipmentStatus];
    if (!mapped) return null;

    const order = await commerceRepository.findOrderById(orderId);
    if (!order) return null;

    // CANCELLED and RETURNED are decisions the shop made, and a courier scan
    // arriving afterwards must not walk the order back out of them.
    if (order.status === "CANCELLED" || order.status === "RETURNED") return null;
    if (order.status === mapped) return null;

    return commerceRepository.advanceOrderStatus(
      orderId,
      mapped as "SHIPPED" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED",
    );
  },

  /**
   * Bring a consignment's status up to date, within reason.
   *
   * Returns the stored row untouched when it was synced recently or has already
   * finished, so a page that renders tracking can call this freely. A courier
   * that is unreachable is not an error here either: stale tracking beats a
   * broken order page.
   */
  async syncShipment(shipment: {
    id: string;
    waybill: string;
    status: string;
    lastSyncedAt: Date | null;
  }) {
    const delhivery = this.resolveConfig();
    if (!delhivery) return null;
    if (TERMINAL_SHIPMENT_STATUSES.has(shipment.status)) return null;

    const age = shipment.lastSyncedAt ? Date.now() - shipment.lastSyncedAt.getTime() : Infinity;
    if (age < TRACKING_TTL_MS) return null;

    try {
      const tracking = await trackShipment(delhivery, shipment.waybill);
      const status = mapDelhiveryStatus(tracking.status, tracking.statusDetail);

      return await shippingRepository.updateShipmentTracking(shipment.id, {
        status,
        statusDetail: tracking.statusDetail,
        currentLocation: tracking.location,
        estimatedDeliveryAt: tracking.estimatedDeliveryAt
          ? new Date(tracking.estimatedDeliveryAt)
          : null,
        scans: tracking.scans,
      });
    } catch {
      // Courier down, waybill not yet in their system, token trouble: none of
      // it should take the order page with it. The stored scans still render.
      return null;
    }
  },

  /**
   * Where the label for a parcel can be printed from.
   *
   * The link comes from Delhivery each time it is asked for. Their PDFs expire,
   * and a stored URL would fail at the moment somebody stands at a printer.
   */
  async fetchLabel(shipmentId: string) {
    const shipment = await shippingRepository.findShipmentById(shipmentId);
    if (!shipment) return { error: "Shipment not found.", status: 404 as const };

    const delhivery = this.resolveConfig();
    if (!delhivery) return { error: "No Delhivery token is configured.", status: 409 as const };

    try {
      const { pdfUrl } = await fetchPackingSlip(delhivery, [shipment.waybill]);
      if (!pdfUrl) {
        return {
          error: "Delhivery has no label for this waybill yet. Try again in a minute.",
          status: 404 as const,
        };
      }
      return { data: { waybill: shipment.waybill, pdfUrl } };
    } catch (err) {
      if (err instanceof DelhiveryError) {
        return { error: "Could not fetch the label right now.", status: 502 as const };
      }
      throw err;
    }
  },

  /**
   * Call a booked parcel off.
   *
   * Only possible while Delhivery still holds it as manifested; once it has
   * been picked up the way back is an RTO, which is the courier's decision.
   */
  async cancelForwardShipment(orderId: string) {
    const delhivery = this.resolveConfig();
    if (!delhivery) return { data: { cancelled: false } };

    const shipment = await shippingRepository.findActiveShipment(orderId, "FORWARD");
    if (!shipment) return { data: { cancelled: false } };

    try {
      await cancelShipment(delhivery, shipment.waybill);
      await shippingRepository.updateShipmentTracking(shipment.id, {
        status: "CANCELLED",
        statusDetail: "Cancelled by the shop.",
        currentLocation: null,
        estimatedDeliveryAt: null,
        scans: [],
      });
      return { data: { cancelled: true } };
    } catch (err) {
      if (err instanceof DelhiveryError) {
        return {
          error:
            "The courier would not cancel this consignment. It may already be on its way; refuse the delivery to send it back.",
          status: 409 as const,
        };
      }
      throw err;
    }
  },
};
