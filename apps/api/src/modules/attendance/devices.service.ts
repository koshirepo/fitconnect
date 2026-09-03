/**
 * Documentation: Managing the RFID machines a gym has on its wall.
 *
 * - The registry the punch endpoint checks against. A device that is not here is not trusted, so this is where a gym's readers are actually authorised — adding one is the security decision, not a convenience.
 * - `serialNumber` is unique across every gym because it is the only identifier a punch carries. Claiming one that is already registered is refused with a message that says so rather than a constraint error, since the usual cause is a serial typed into the wrong gym.
 * - Online is derived from `lastSeenAt` rather than stored. These devices poll on their own schedule, so "last heard from" is the only honest signal, and computing it at read time means a device that dies is reported as offline without anything having to notice.
 * - Primary exports: deviceService.
 */
import { prisma } from "../../lib/prisma";
import { DEVICE_OFFLINE_AFTER_MS } from "./iclock.service";
import { provisioningService } from "./provisioning.service";

const deviceSelect = {
  id: true,
  serialNumber: true,
  name: true,
  location: true,
  timezone: true,
  isActive: true,
  lastSeenAt: true,
  lastPunchAt: true,
  createdAt: true,
} as const;

type DeviceRow = {
  lastSeenAt: Date | null;
  [key: string]: unknown;
};

/** A device is online if it has spoken to us recently enough to still be there. */
function withOnline<T extends DeviceRow>(device: T) {
  return {
    ...device,
    online:
      device.lastSeenAt !== null &&
      Date.now() - device.lastSeenAt.getTime() < DEVICE_OFFLINE_AFTER_MS,
  };
}

export const deviceService = {
  async listDevices(tenantId: string) {
    const devices = await prisma.attendanceDevice.findMany({
      where: { tenantId },
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
      select: deviceSelect,
    });

    return { data: { devices: devices.map(withOnline) } };
  },

  async createDevice(
    tenantId: string,
    input: {
      serialNumber: string;
      name: string;
      location?: string;
      timezone?: string;
    },
  ) {
    const serialNumber = input.serialNumber.trim();

    // Checked rather than caught: a serial already registered is almost always
    // the same machine entered against the wrong gym, and "already registered"
    // says that where a unique-constraint error would not.
    const existing = await prisma.attendanceDevice.findUnique({
      where: { serialNumber },
      select: { tenantId: true },
    });

    if (existing) {
      return {
        error:
          existing.tenantId === tenantId
            ? "This device is already registered here."
            : "That serial number is registered to another gym. Check the number on the back of the unit.",
        status: 409 as const,
      };
    }

    const device = await prisma.attendanceDevice.create({
      data: {
        tenantId,
        serialNumber,
        name: input.name.trim(),
        location: input.location?.trim() || null,
        timezone: input.timezone?.trim() || "Asia/Kolkata",
      },
      select: deviceSelect,
    });

    // A reader joining a gym that already issues cards has to be told about
    // everybody, or every existing member is enrolled at its keypad by hand.
    await provisioningService.syncAllToDevice(tenantId, device.id);

    return { data: { device: withOnline(device) } };
  },

  async updateDevice(
    tenantId: string,
    deviceId: string,
    input: {
      name?: string;
      location?: string | null;
      timezone?: string;
      isActive?: boolean;
    },
  ) {
    const existing = await prisma.attendanceDevice.findFirst({
      where: { id: deviceId, tenantId },
      select: { id: true },
    });
    if (!existing) return { error: "Device not found.", status: 404 as const };

    // The serial is deliberately not editable. It is what a punch is matched
    // on, so changing it is registering a different machine — which is what
    // adding one does.
    const device = await prisma.attendanceDevice.update({
      where: { id: deviceId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.location !== undefined
          ? { location: input.location?.trim() || null }
          : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone.trim() } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: deviceSelect,
    });

    return { data: { device: withOnline(device) } };
  },

  async deleteDevice(tenantId: string, deviceId: string) {
    const existing = await prisma.attendanceDevice.findFirst({
      where: { id: deviceId, tenantId },
      select: { id: true },
    });
    if (!existing) return { error: "Device not found.", status: 404 as const };

    await prisma.attendanceDevice.delete({ where: { id: deviceId } });
    return { data: { deleted: true } };
  },

  /**
   * Give a member the number their card is enrolled under on the machine.
   *
   * The PIN is what arrives on a punch, so this is the mapping that makes the
   * whole thing work. Both fields are cleared with null rather than an empty
   * string, because a unique index treats "" as a value and the second member
   * to be un-assigned would collide with the first.
   */
  async assignCard(
    tenantId: string,
    membershipId: string,
    input: { deviceUserPin?: number | null; rfidCardNumber?: string | null },
  ) {
    const membership = await prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      // The PIN as it stands, because changing or clearing it means the old one
      // has to be withdrawn from the machines as well as the new one added.
      select: { id: true, deviceUserPin: true },
    });
    if (!membership) return { error: "Member not found.", status: 404 as const };

    if (input.deviceUserPin != null) {
      const clash = await prisma.tenantMembership.findFirst({
        where: {
          tenantId,
          deviceUserPin: input.deviceUserPin,
          id: { not: membershipId },
        },
        select: { memberId: true },
      });
      if (clash) {
        return {
          error: `PIN ${input.deviceUserPin} is already used by member #${clash.memberId}.`,
          status: 409 as const,
        };
      }
    }

    const updated = await prisma.tenantMembership.update({
      where: { id: membershipId },
      data: {
        ...(input.deviceUserPin !== undefined
          ? { deviceUserPin: input.deviceUserPin }
          : {}),
        ...(input.rfidCardNumber !== undefined
          ? { rfidCardNumber: input.rfidCardNumber?.trim() || null }
          : {}),
      },
      select: { id: true, memberId: true, deviceUserPin: true, rfidCardNumber: true },
    });

    /**
     * Carry the change out to the readers.
     *
     * A PIN that changed or was cleared has to be withdrawn under its old
     * number first, or the machine keeps recognising the old card — the device
     * has no idea the two are the same person.
     *
     * Queued, never awaited for correctness: the assignment is already saved,
     * and a queue write that fails leaves the devices behind rather than
     * leaving the member wrong. Refusing a save because a machine is offline
     * would be the worse trade.
     */
    const previousPin = membership.deviceUserPin;
    if (previousPin && previousPin !== updated.deviceUserPin) {
      await provisioningService.removeMember(tenantId, previousPin, membershipId);
    }

    if (updated.deviceUserPin) {
      await provisioningService.syncMember(tenantId, membershipId);
    }

    return { data: { membership: updated } };
  },
};
