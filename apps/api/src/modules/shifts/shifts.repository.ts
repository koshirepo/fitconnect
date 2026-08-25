/**
 * Documentation: Shifts repository.
 *
 * - Encapsulates Prisma queries for tenant shift definitions, including relation loading and write patterns that are specific to the persistence layer.
 * - Keep raw database concerns here so the service layer can reason about domain behavior without duplicating query details.
 * - Primary exports: shiftRepository.
 */
import { prisma } from "../../lib/prisma";
import type { CreateShiftInput, UpdateShiftInput } from "./shifts.schema";

const shiftSelect = {
  id: true,
  tenantId: true,
  name: true,
  description: true,
  startTime: true,
  endTime: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const shiftRepository = {
  findByTenantAndName(tenantId: string, name: string) {
    return prisma.shift.findUnique({
      where: { tenantId_name: { tenantId, name } },
      select: shiftSelect,
    });
  },

  findById(id: string, tenantId: string) {
    return prisma.shift.findFirst({
      where: { id, tenantId },
      select: shiftSelect,
    });
  },

  create(tenantId: string, data: CreateShiftInput) {
    return prisma.shift.create({
      data: {
        tenantId,
        name: data.name,
        description: data.description,
        startTime: data.startTime,
        endTime: data.endTime,
        isActive: data.isActive,
      },
      select: shiftSelect,
    });
  },

  update(id: string, data: UpdateShiftInput) {
    return prisma.shift.update({
      where: { id },
      data,
      select: shiftSelect,
    });
  },

  delete(id: string) {
    return prisma.shift.delete({ where: { id } });
  },

  async list(tenantId: string, page: number, limit: number, includeInactive = false) {
    const where = {
      tenantId,
      ...(includeInactive ? {} : { isActive: true }),
    };

    const [shifts, total] = await Promise.all([
      prisma.shift.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ startTime: "asc" }, { endTime: "asc" }, { name: "asc" }],
        select: shiftSelect,
      }),
      prisma.shift.count({ where }),
    ]);

    return { shifts, total };
  },
};