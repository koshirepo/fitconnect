/**
 * Documentation: Shipping repository.
 *
 * - Prisma queries for consignments and return requests: the rows the shop keeps about a parcel's journey out to a buyer and back again.
 * - Kept apart from `commerce.repository` because these tables have their own lifecycle — an order is created once, while a shipment is written to on every courier scan — and mixing them made the order select shape grow a tracking history nobody asked for.
 * - Primary exports: shippingRepository.
 */
import { prisma } from "../../lib/prisma";

export const shipmentSelect = {
  id: true,
  orderId: true,
  warehouseId: true,
  provider: true,
  kind: true,
  waybill: true,
  status: true,
  statusDetail: true,
  currentLocation: true,
  pickupLocation: true,
  estimatedDeliveryAt: true,
  scans: true,
  lastSyncedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const returnRequestSelect = {
  id: true,
  orderId: true,
  status: true,
  reason: true,
  comment: true,
  shipmentId: true,
  decidedById: true,
  decidedAt: true,
  decisionNote: true,
  refundAmount: true,
  refundedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const shippingRepository = {
  /**
   * What the basket weighs, in grams.
   *
   * Read from the products rather than taken from the request: a browser that
   * could name its own weight could quote itself a rupee of carriage on a
   * twenty-kilo parcel.
   */
  async totalWeightGrams(items: Array<{ productId: string; quantity: number }>) {
    if (items.length === 0) return 0;

    const products = await prisma.product.findMany({
      where: { id: { in: [...new Set(items.map((item) => item.productId))] } },
      select: { id: true, weightGrams: true },
    });

    const weightById = new Map(products.map((product) => [product.id, product.weightGrams]));

    const total = items.reduce(
      (sum, item) => sum + (weightById.get(item.productId) ?? 0) * item.quantity,
      0,
    );

    // Delhivery prices a minimum slab anyway, and a zero-gram parcel is a
    // rejected manifest rather than a free one.
    return Math.max(total, 50);
  },

  /**
   * Weight and warehouse for each product in one read.
   *
   * Grouping a basket by warehouse and weighing each group are the same
   * question asked twice, and two round trips to answer it would be one too
   * many on a checkout page that re-quotes as the buyer types.
   */
  async productShippingFacts(productIds: string[]) {
    const products = await prisma.product.findMany({
      where: { id: { in: [...new Set(productIds)] } },
      select: {
        id: true,
        name: true,
        weightGrams: true,
        lengthCm: true,
        widthCm: true,
        heightCm: true,
        warehouseId: true,
      },
    });

    return new Map(products.map((product) => [product.id, product]));
  },

  createShipment(data: {
    orderId: string;
    warehouseId?: string | null;
    kind: "FORWARD" | "REVERSE";
    waybill: string;
    status: string;
    statusDetail: string | null;
    pickupLocation: string;
  }) {
    return prisma.shipment.create({
      data: { ...data, lastSyncedAt: new Date() },
      select: shipmentSelect,
    });
  },

  /**
   * The consignment of this kind that is still in play for an order.
   *
   * Narrowed by warehouse when one is given, because an order drawing on two
   * warehouses is two parcels: finding the first one must not be read as "this
   * order is already booked" and stop the second from ever going out.
   *
   * Cancelled and failed ones are skipped so a re-book after a refusal is not
   * mistaken for a parcel already on its way.
   */
  /**
   * The consignment a waybill belongs to.
   *
   * How a courier push finds its way home: Delhivery knows the waybill and
   * nothing about our order ids, so this is the only join between a scan and
   * the order it moves.
   */
  findShipmentByWaybill(waybill: string) {
    return prisma.shipment.findFirst({
      where: { waybill },
      orderBy: { createdAt: "desc" },
      select: shipmentSelect,
    });
  },

  /** Append one pushed scan, keeping the ones already stored. */
  appendShipmentScan(
    shipmentId: string,
    data: {
      status: string;
      statusDetail: string | null;
      currentLocation: string | null;
      scans: unknown;
    },
  ) {
    return prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        status: data.status,
        statusDetail: data.statusDetail,
        currentLocation: data.currentLocation,
        scans: data.scans as never,
        lastSyncedAt: new Date(),
      },
      select: shipmentSelect,
    });
  },

  findActiveShipment(
    orderId: string,
    kind: "FORWARD" | "REVERSE",
    warehouseId?: string | null,
  ) {
    return prisma.shipment.findFirst({
      where: {
        orderId,
        kind,
        status: { notIn: ["CANCELLED", "FAILED"] },
        ...(warehouseId === undefined ? {} : { warehouseId }),
      },
      orderBy: { createdAt: "desc" },
      select: shipmentSelect,
    });
  },

  /** Every parcel of this kind still in play, across all warehouses. */
  listActiveShipments(orderId: string, kind: "FORWARD" | "REVERSE") {
    return prisma.shipment.findMany({
      where: { orderId, kind, status: { notIn: ["CANCELLED", "FAILED"] } },
      orderBy: { createdAt: "asc" },
      select: shipmentSelect,
    });
  },

  findShipmentById(shipmentId: string) {
    return prisma.shipment.findUnique({ where: { id: shipmentId }, select: shipmentSelect });
  },

  listShipmentsByOrder(orderId: string) {
    return prisma.shipment.findMany({
      where: { orderId },
      orderBy: { createdAt: "asc" },
      select: shipmentSelect,
    });
  },

  updateShipmentTracking(
    shipmentId: string,
    data: {
      status: string;
      statusDetail: string | null;
      currentLocation: string | null;
      estimatedDeliveryAt: Date | null;
      scans: unknown;
    },
  ) {
    return prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        status: data.status,
        statusDetail: data.statusDetail,
        currentLocation: data.currentLocation,
        estimatedDeliveryAt: data.estimatedDeliveryAt,
        scans: data.scans as never,
        lastSyncedAt: new Date(),
      },
      select: shipmentSelect,
    });
  },

  createReturnRequest(data: { orderId: string; reason: string; comment?: string }) {
    return prisma.returnRequest.create({
      data: { orderId: data.orderId, reason: data.reason, comment: data.comment },
      select: returnRequestSelect,
    });
  },

  findReturnRequestById(returnRequestId: string) {
    return prisma.returnRequest.findUnique({
      where: { id: returnRequestId },
      select: returnRequestSelect,
    });
  },

  listReturnsByOrder(orderId: string) {
    return prisma.returnRequest.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
      select: returnRequestSelect,
    });
  },

  /** A return that has not yet been settled one way or the other. */
  findOpenReturnByOrder(orderId: string) {
    return prisma.returnRequest.findFirst({
      where: { orderId, status: { in: ["REQUESTED", "APPROVED", "PICKED_UP", "RECEIVED"] } },
      orderBy: { createdAt: "desc" },
      select: returnRequestSelect,
    });
  },

  async listReturns(page: number, limit: number, status?: string) {
    const where = status ? { status } : {};

    const [returns, total] = await Promise.all([
      prisma.returnRequest.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          ...returnRequestSelect,
          order: {
            select: {
              id: true,
              buyerName: true,
              buyerEmail: true,
              totalAmount: true,
              status: true,
              paymentStatus: true,
            },
          },
        },
      }),
      prisma.returnRequest.count({ where }),
    ]);

    return { returns, total };
  },

  updateReturnStatus(
    returnRequestId: string,
    data: {
      status: string;
      decidedById?: string;
      decisionNote?: string;
      refundAmount?: number;
      refundedAt?: Date;
    },
  ) {
    return prisma.returnRequest.update({
      where: { id: returnRequestId },
      data: {
        status: data.status,
        ...(data.decidedById ? { decidedById: data.decidedById, decidedAt: new Date() } : {}),
        ...(data.decisionNote === undefined ? {} : { decisionNote: data.decisionNote }),
        ...(data.refundAmount === undefined ? {} : { refundAmount: data.refundAmount }),
        ...(data.refundedAt === undefined ? {} : { refundedAt: data.refundedAt }),
      },
      select: returnRequestSelect,
    });
  },

  attachReturnShipment(returnRequestId: string, shipmentId: string) {
    return prisma.returnRequest.update({
      where: { id: returnRequestId },
      data: { shipmentId },
      select: returnRequestSelect,
    });
  },
};
