/**
 * Documentation: Attendance device controller.
 *
 * - The HTTP boundary for registering RFID machines and mapping members to the PIN their card is enrolled under.
 * - Every write is audited. Registering a device is what authorises it to write attendance for a gym, and reassigning a PIN silently moves whose visits are recorded — both are worth being able to reconstruct later.
 * - Primary exports: deviceController.
 */
import type { Context } from "hono";
import { z } from "zod";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { ok, failWith } from "../../lib/response";
import { deviceService } from "./devices.service";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

/**
 * Serials are printed on a label and typed in by hand, so the shape is kept
 * permissive — vendors use letters, digits, dashes and colons — while still
 * refusing whitespace and punctuation that would only ever be a mistake.
 */
const serialSchema = z
  .string()
  .trim()
  .min(3, "Enter the serial number printed on the device.")
  .max(64)
  .regex(/^[A-Za-z0-9:_-]+$/, "A serial is letters, numbers, and - _ : only.");

const createDeviceSchema = z.object({
  serialNumber: serialSchema,
  name: z.string().trim().min(2, "Give the device a name.").max(80),
  location: z.string().trim().max(120).optional(),
  /** IANA zone. The device reports local time with no offset, so this decides when a punch happened. */
  timezone: z.string().trim().max(64).optional(),
});

const updateDeviceSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    location: z.string().trim().max(120).nullable().optional(),
    timezone: z.string().trim().max(64).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

const assignCardSchema = z
  .object({
    /** The number the card is enrolled under on the machine. Null unassigns. */
    deviceUserPin: z.number().int().min(1).max(999_999_999).nullable().optional(),
    rfidCardNumber: z.string().trim().max(64).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide a PIN or a card number.",
  });

export const deviceController = {
  async listDevices(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const result = await deviceService.listDevices(tenantId);
    return ok(c, result.data);
  },

  async createDevice(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, createDeviceSchema);
    if (!parsed.ok) return parsed.response;

    const result = await deviceService.createDevice(tenantId, parsed.data);
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "CREATE",
      entity: "AttendanceDevice",
      entityId: result.data.device.id,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { serialNumber: result.data.device.serialNumber },
    });

    return ok(c, result.data, 201);
  },

  async updateDevice(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const deviceId = c.req.param("deviceId")!;
    const parsed = await parseBody(c, updateDeviceSchema);
    if (!parsed.ok) return parsed.response;

    const result = await deviceService.updateDevice(tenantId, deviceId, parsed.data);
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "UPDATE",
      entity: "AttendanceDevice",
      entityId: deviceId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: parsed.data as Record<string, unknown>,
    });

    return ok(c, result.data);
  },

  async deleteDevice(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const deviceId = c.req.param("deviceId")!;

    const result = await deviceService.deleteDevice(tenantId, deviceId);
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "DELETE",
      entity: "AttendanceDevice",
      entityId: deviceId,
      actorId: c.get("authUser").id,
      tenantId,
    });

    return ok(c, result.data);
  },

  async assignCard(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;
    const parsed = await parseBody(c, assignCardSchema);
    if (!parsed.ok) return parsed.response;

    const result = await deviceService.assignCard(tenantId, membershipId, parsed.data);
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "UPDATE",
      entity: "TenantMembership",
      entityId: membershipId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { rfid: parsed.data as Record<string, unknown> },
    });

    return ok(c, result.data);
  },
};
