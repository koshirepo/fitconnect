/**
 * Documentation: Pushing members out to the attendance machines.
 *
 * - Assigning a card in the app now reaches the wall. Before this, a device only learned about somebody when a person stood at its keypad and enrolled them, which with three readers meant doing it three times and explained cards that worked at one door and not another.
 * - These devices cannot be pushed to — they poll, and the protocol hands work over in the answer to that poll. So enrolling queues a command per active device and the delivery happens whenever each next asks, which is also why a machine that is unplugged catches up by itself when it returns rather than needing anything replayed by hand.
 * - The command text is the vendor's, tab-separated and positional. `PIN` is what a punch reports and `Card` is the number encoded in the plastic; both are sent because the device matches the card at the door and reports the PIN afterwards.
 * - Queuing never fails the thing that caused it. A card assignment that saved is saved — if the queue write fails, the member is still correct here and the devices are behind, which is recoverable. Refusing the assignment because a machine might be offline would not be.
 * - Primary exports: provisioningService.
 */
import { prisma } from "../../lib/prisma";

/**
 * One enrolment line, in the shape the firmware parses.
 *
 * `Pri=0` is an ordinary user rather than an administrator — a member must
 * never be able to enter the device's own menu. `Grp=1` and the all-zero `TZ`
 * put them in the default group with no time restriction, because access hours
 * are the gym's business and are decided here, not on the reader.
 */
function userInfoCommand(input: {
  pin: number;
  name: string;
  cardNumber: string | null;
}): string {
  const name = input.name.replace(/[\t\r\n]/g, " ").slice(0, 24);

  return [
    `DATA UPDATE USERINFO PIN=${input.pin}`,
    `Name=${name}`,
    "Pri=0",
    "Passwd=",
    `Card=${input.cardNumber ?? ""}`,
    "Grp=1",
    "TZ=0000000000000000",
  ].join("\t");
}

function deleteUserCommand(pin: number): string {
  return `DATA DELETE USERINFO PIN=${pin}`;
}

export const provisioningService = {
  /**
   * Queue a member's enrolment on every active machine in their gym.
   *
   * Called whenever the mapping changes — assigned, re-carded, renamed. The
   * command is an upsert on the device's side, so re-sending one is how a
   * correction propagates rather than something to avoid.
   */
  async syncMember(tenantId: string, membershipId: string) {
    const membership = await prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      select: {
        deviceUserPin: true,
        rfidCardNumber: true,
        user: { select: { name: true } },
      },
    });

    // No PIN is not an error: most members never get a card, and there is
    // nothing for a device to know about them.
    if (!membership?.deviceUserPin) return { data: { queued: 0 } };

    return this.enqueueForTenant(tenantId, {
      kind: "USER_SET",
      membershipId,
      command: userInfoCommand({
        pin: membership.deviceUserPin,
        name: membership.user.name,
        cardNumber: membership.rfidCardNumber,
      }),
    });
  },

  /**
   * Queue the removal of a PIN from every machine.
   *
   * Takes the PIN rather than the membership because the usual caller is
   * un-assigning a card, and by then the row no longer says what to remove.
   */
  async removeMember(tenantId: string, pin: number, membershipId?: string) {
    return this.enqueueForTenant(tenantId, {
      kind: "USER_DELETE",
      membershipId: membershipId ?? null,
      command: deleteUserCommand(pin),
    });
  },

  /**
   * Put one command on every active device's queue.
   *
   * A deactivated device is skipped: it is deactivated because the gym does not
   * want it acting, and filling its queue would mean a surprise burst the day
   * somebody turns it back on.
   */
  async enqueueForTenant(
    tenantId: string,
    input: { kind: string; command: string; membershipId: string | null },
  ) {
    const devices = await prisma.attendanceDevice.findMany({
      where: { tenantId, isActive: true },
      select: { id: true },
    });

    if (devices.length === 0) return { data: { queued: 0 } };

    await prisma.deviceCommand.createMany({
      data: devices.map((device) => ({
        deviceId: device.id,
        tenantId,
        kind: input.kind,
        command: input.command,
        membershipId: input.membershipId,
      })),
    });

    return { data: { queued: devices.length } };
  },

  /**
   * Everything a gym knows, queued onto one device.
   *
   * For a machine joining a gym that already has members carrying cards, and
   * for a device that was reset. Without it a new reader knows nobody and every
   * card is enrolled by hand — which is the problem this whole file exists for.
   */
  async syncAllToDevice(tenantId: string, deviceId: string) {
    const members = await prisma.tenantMembership.findMany({
      where: { tenantId, deviceUserPin: { not: null }, status: { not: "DELETED" } },
      select: {
        id: true,
        deviceUserPin: true,
        rfidCardNumber: true,
        user: { select: { name: true } },
      },
    });

    if (members.length === 0) return { data: { queued: 0 } };

    await prisma.deviceCommand.createMany({
      data: members.map((member) => ({
        deviceId,
        tenantId,
        kind: "USER_SET",
        membershipId: member.id,
        command: userInfoCommand({
          pin: member.deviceUserPin!,
          name: member.user.name,
          cardNumber: member.rfidCardNumber,
        }),
      })),
    });

    return { data: { queued: members.length } };
  },

  /**
   * The work waiting for a device, handed over and marked sent.
   *
   * Capped per poll because the firmware reads a bounded buffer and a gym
   * enrolling four hundred members at once would otherwise hand it a payload it
   * silently truncates. The rest go out on the next poll, seconds later.
   */
  async takePending(deviceId: string, limit = 10) {
    const pending = await prisma.deviceCommand.findMany({
      where: { deviceId, sentAt: null },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true, command: true },
    });

    if (pending.length === 0) return [];

    // Marked sent on handover rather than on confirmation. A device that takes
    // a command and never reports back leaves a row that is sent and not
    // completed, which is visible; re-sending on every poll until confirmation
    // would instead loop forever against a device that cannot apply it.
    await prisma.deviceCommand.updateMany({
      where: { id: { in: pending.map((command) => command.id) } },
      data: { sentAt: new Date() },
    });

    return pending;
  },

  /** Record what the device said about a command it ran. */
  async completeCommand(commandId: string, resultCode: string | null) {
    await prisma.deviceCommand
      .update({
        where: { id: commandId },
        data: { completedAt: new Date(), resultCode },
      })
      .catch(() => {
        // An id we do not recognise is a device replaying an old result after a
        // device was removed. Nothing to record, nothing to fail.
      });
  },
};
