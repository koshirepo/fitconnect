/**
 * Documentation: Shifts service.
 *
 * - Implements the business rules for tenant shift management by coordinating repositories and enforcing domain invariants.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: shiftService.
 */
import { shiftRepository } from "./shifts.repository";
import type { CreateShiftInput, UpdateShiftInput } from "./shifts.schema";

const SHIFT_TIME_RANGE_ERROR = "End time must be later than start time.";
const hasValidTimeRange = (startTime: string, endTime: string) => startTime < endTime;

export const shiftService = {
  async create(tenantId: string, input: CreateShiftInput) {
    const existing = await shiftRepository.findByTenantAndName(tenantId, input.name);
    if (existing) {
      return { error: "A shift with this name already exists in this gym.", status: 409 as const };
    }

    const shift = await shiftRepository.create(tenantId, input);
    return { data: { shift } };
  },

  async list(tenantId: string, page: number, limit: number, includeInactive: boolean) {
    const { shifts, total } = await shiftRepository.list(tenantId, page, limit, includeInactive);
    return { data: { shifts }, total };
  },

  async getById(tenantId: string, shiftId: string) {
    const shift = await shiftRepository.findById(shiftId, tenantId);
    if (!shift) return { error: "Shift not found.", status: 404 as const };
    return { data: { shift } };
  },

  async update(tenantId: string, shiftId: string, input: UpdateShiftInput) {
    const existing = await shiftRepository.findById(shiftId, tenantId);
    if (!existing) return { error: "Shift not found.", status: 404 as const };

    if (input.name && input.name !== existing.name) {
      const duplicate = await shiftRepository.findByTenantAndName(tenantId, input.name);
      if (duplicate) {
        return { error: "A shift with this name already exists in this gym.", status: 409 as const };
      }
    }

    const startTime = input.startTime ?? existing.startTime;
    const endTime = input.endTime ?? existing.endTime;
    if (!hasValidTimeRange(startTime, endTime)) {
      return { error: SHIFT_TIME_RANGE_ERROR, status: 400 as const };
    }

    const shift = await shiftRepository.update(shiftId, input);
    return { data: { shift } };
  },

  async delete(tenantId: string, shiftId: string) {
    const existing = await shiftRepository.findById(shiftId, tenantId);
    if (!existing) return { error: "Shift not found.", status: 404 as const };

    await shiftRepository.delete(shiftId);
    return { data: true };
  },
};