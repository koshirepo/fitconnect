/**
 * Documentation: Warehouse repository.
 *
 * - Prisma queries for the places parcels leave from, and for the collections Delhivery has been asked to make from them.
 * - Owns the one invariant that cannot be expressed in the SQLite schema: at most one warehouse is the default. Setting a new one clears the old, in that order, here rather than in three call sites.
 * - Primary exports: warehouseRepository.
 */
import { prisma } from "../../lib/prisma";

export const warehouseSelect = {
  id: true,
  name: true,
  contactPerson: true,
  phone: true,
  email: true,
  address: true,
  city: true,
  state: true,
  pincode: true,
  returnAddress: true,
  returnCity: true,
  returnState: true,
  returnPincode: true,
  isDefault: true,
  isActive: true,
  registeredAt: true,
  registerError: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const pickupRequestSelect = {
  id: true,
  warehouseId: true,
  pickupId: true,
  pickupDate: true,
  pickupTime: true,
  expectedPackageCount: true,
  status: true,
  note: true,
  createdAt: true,
} as const;

export const warehouseRepository = {
  async listWarehouses(includeInactive = true) {
    const where = includeInactive ? {} : { isActive: true };

    const [warehouses, total] = await Promise.all([
      prisma.warehouse.findMany({
        where,
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        select: {
          ...warehouseSelect,
          _count: { select: { products: true } },
        },
      }),
      prisma.warehouse.count({ where }),
    ]);

    return { warehouses, total };
  },

  findById(warehouseId: string) {
    return prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: warehouseSelect,
    });
  },

  findByName(name: string) {
    return prisma.warehouse.findUnique({ where: { name }, select: warehouseSelect });
  },

  /** The warehouse products fall back to when they name none of their own. */
  findDefault() {
    return prisma.warehouse.findFirst({
      where: { isDefault: true, isActive: true },
      select: warehouseSelect,
    });
  },

  create(data: {
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
  }) {
    return prisma.warehouse.create({ data, select: warehouseSelect });
  },

  update(
    warehouseId: string,
    data: Partial<{
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
    return prisma.warehouse.update({
      where: { id: warehouseId },
      data,
      select: warehouseSelect,
    });
  },

  /**
   * Make one warehouse the default, and only one.
   *
   * The clear runs first: two defaults for a moment would have the fallback
   * pick whichever row came back first, which is not a thing to leave to
   * ordering.
   */
  async setDefault(warehouseId: string) {
    await prisma.warehouse.updateMany({
      where: { isDefault: true, NOT: { id: warehouseId } },
      data: { isDefault: false },
    });
    return prisma.warehouse.update({
      where: { id: warehouseId },
      data: { isDefault: true },
      select: warehouseSelect,
    });
  },

  markRegistered(warehouseId: string, error: string | null) {
    return prisma.warehouse.update({
      where: { id: warehouseId },
      data: {
        registeredAt: error ? null : new Date(),
        registerError: error,
      },
      select: warehouseSelect,
    });
  },

  /** Refuses to orphan products: a warehouse still stocking something stays. */
  async countProducts(warehouseId: string) {
    // Warehouses are a platform-shop concept; a gym's products never have one.
    return prisma.product.count({ where: { warehouseId, tenantId: null } });
  },

  delete(warehouseId: string) {
    return prisma.warehouse.delete({ where: { id: warehouseId }, select: warehouseSelect });
  },

  /**
   * Which warehouse ships each of these products.
   *
   * Returned as a map rather than joined rows because every caller is grouping
   * a basket by warehouse, and that is the shape grouping wants.
   */
  async warehouseIdsForProducts(productIds: string[]) {
    const products = await prisma.product.findMany({
      where: { id: { in: [...new Set(productIds)] }, tenantId: null },
      select: { id: true, warehouseId: true },
    });

    return new Map(products.map((product) => [product.id, product.warehouseId]));
  },

  createPickupRequest(data: {
    warehouseId: string;
    pickupId: string | null;
    pickupDate: string;
    pickupTime: string;
    expectedPackageCount: number;
    status: string;
    note?: string;
    requestedById?: string;
  }) {
    return prisma.pickupRequest.create({ data, select: pickupRequestSelect });
  },

  listPickupRequests(warehouseId: string, limit = 20) {
    return prisma.pickupRequest.findMany({
      where: { warehouseId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: pickupRequestSelect,
    });
  },

  /** Parcels manifested from this warehouse that nobody has collected yet. */
  countPendingShipments(warehouseId: string) {
    return prisma.shipment.count({
      where: { warehouseId, status: "MANIFESTED" },
    });
  },
};
