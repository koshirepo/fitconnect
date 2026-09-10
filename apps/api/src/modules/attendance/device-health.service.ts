/**
 * Documentation: Noticing when an attendance machine has gone quiet.
 *
 * - The wall reader is how most gyms mark attendance, and it fails silently: no punches simply looks like no visitors. This is the daily pass that turns that silence into a notification.
 * - "Quiet" is deliberately much longer than the five minutes the devices page calls offline. That badge answers "is it up right now" for somebody already looking; this one wakes people, so it waits until the machine has missed a stretch no working device would miss — a whole night included.
 * - One alert per silence, not one a day: `silenceAlertedAt` is set when the gym is told and cleared the moment the device speaks again. A gym with a dead reader gets one message, not a morning ritual.
 * - A device that has never once reported is skipped. That is a registration somebody has not finished plugging in, and telling them it is offline every morning helps nobody.
 * - Primary exports: deviceHealthService, DEVICE_SILENT_AFTER_MS.
 */
import { prisma } from "../../lib/prisma";
import { pushService } from "../push/push.service";

/**
 * How long a device may say nothing before the gym is told.
 *
 * Six hours. These machines poll every thirty seconds even when nobody is
 * training, so six hours of silence is not a quiet afternoon — it is unplugged,
 * off the network, or dead. Long enough that a router reboot or a power cut
 * during the night does not wake anybody at 3am.
 */
export const DEVICE_SILENT_AFTER_MS = 6 * 60 * 60 * 1000;

function formatLastSeen(lastSeenAt: Date, timezone: string) {
  return lastSeenAt.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  });
}

export const deviceHealthService = {
  /**
   * Tell every gym whose reader has stopped reporting.
   *
   * Runs from the daily cron. Returns what it found so the schedule's log line
   * says something useful on a morning when nothing was wrong.
   */
  async runScheduledDeviceHealthChecks(
    scheduleBackgroundTask?: (promise: Promise<unknown>) => void,
  ) {
    const silentBefore = new Date(Date.now() - DEVICE_SILENT_AFTER_MS);

    const silent = await prisma.attendanceDevice.findMany({
      where: {
        isActive: true,
        // Never heard from at all is a setup that was not finished, not a
        // machine that died.
        lastSeenAt: { not: null, lt: silentBefore },
        silenceAlertedAt: null,
      },
      select: {
        id: true,
        name: true,
        location: true,
        timezone: true,
        lastSeenAt: true,
        tenantId: true,
      },
    });

    const dispatch = (promise: Promise<unknown>) => {
      if (scheduleBackgroundTask) scheduleBackgroundTask(promise);
      return promise;
    };

    for (const device of silent) {
      const where = device.location ? `${device.name} (${device.location})` : device.name;
      const since = formatLastSeen(device.lastSeenAt!, device.timezone);

      dispatch(
        pushService.sendToTenantAdmins(device.tenantId, {
          title: "Attendance machine offline",
          body: `${where} has not reported since ${since}. Nobody's attendance is being recorded through it.`,
          url: "/dashboard/attendance/devices",
        }),
      );
    }

    // Marked in one statement rather than per device: the alert itself is
    // best-effort, and a push that failed to deliver is not a reason to tell
    // the same gym again tomorrow about a machine they can already see is off.
    if (silent.length > 0) {
      await prisma.attendanceDevice.updateMany({
        where: { id: { in: silent.map((device) => device.id) } },
        data: { silenceAlertedAt: new Date() },
      });
    }

    return {
      data: {
        silentDevices: silent.length,
        tenants: new Set(silent.map((device) => device.tenantId)).size,
      },
    };
  },
};
