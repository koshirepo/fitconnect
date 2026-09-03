/**
 * Documentation: The ZKTeco/eSSL "Push" (ADMS) protocol, server side.
 *
 * - These machines are not API clients. They speak a fixed, undocumented-in-public dialect over plain HTTP: query parameters for identity, tab-separated text for payloads, and bare `OK` for success. They do not read JSON and they do not read status codes the way a client would — an answer they cannot parse is treated as a failure and the batch is sent again, forever. So every response here is plain text in exactly the shape the firmware expects, and the content type matters as much as the body.
 * - Identity is the serial number in the query string. There is no secret, no signature, no session — that is the protocol, not an omission here. What limits it is that a serial must be registered to a gym before anything is accepted: an unknown device is refused rather than trusted, so posting attendance requires knowing a serial somebody has already enrolled. That is weak authentication and worth saying plainly; anyone who learns a serial can post punches for that gym.
 * - Attendance logs carry the device PIN, never the card number — the card lives in the device's enrolment record, not its attendance log. So the PIN is the join to a member, and a punch for a PIN nobody has mapped is recorded as seen and skipped rather than dropped silently or guessed at.
 * - Punch times arrive as local wall-clock with no offset. They are read against the device's configured timezone, because a machine in a gym does not know what UTC is and will happily report 09:15 for a member who arrived at 03:45 UTC.
 * - A device re-sends anything it is unsure landed. Nothing here assumes exactly-once: the attendance upsert is keyed on (tenant, member, day), so a replayed batch and two readers at two doors both collapse to the one visit that actually happened.
 * - Primary exports: iclockService.
 */
import { prisma } from "../../lib/prisma";
import { attendanceRepository } from "./attendance.repository";

/**
 * Seconds between a device's command polls.
 *
 * Only affects how quickly a server-side command (enrolling a card, say)
 * reaches the device. Attendance is unaffected: `Realtime=1` below makes the
 * machine push a punch the moment it happens rather than waiting for a poll.
 * So this is a cost dial, not a latency one — at 10s a single device is 8,640
 * requests a day, and a gym with a reader on every floor adds up.
 */
const POLL_DELAY_SECONDS = 30;

/** How long a device may go unheard from before the UI calls it offline. */
export const DEVICE_OFFLINE_AFTER_MS = 5 * 60 * 1000;

/**
 * A punch, as one line of an ATTLOG upload.
 *
 * The firmware sends more columns than this and not always the same number of
 * them, so the parse takes the first two positionally and treats the rest as
 * optional. Anything without a PIN and a timestamp is not a punch.
 */
export type Punch = {
  pin: string;
  /** Local wall-clock at the device, e.g. "2026-09-03 09:15:00". */
  timestamp: string;
  /** 0 = check-in, 1 = check-out, and vendor-specific values beyond. */
  status: string | null;
  /** How the person identified: 1 fingerprint, 4 card, 15 face. */
  verifyMode: string | null;
};

export function parseAttendanceLog(body: string): Punch[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const columns = line.split("\t");
      const pin = (columns[0] ?? "").trim();
      const timestamp = (columns[1] ?? "").trim();
      if (!pin || !timestamp) return null;

      return {
        pin,
        timestamp,
        status: (columns[2] ?? "").trim() || null,
        verifyMode: (columns[3] ?? "").trim() || null,
      };
    })
    .filter((punch): punch is Punch => punch !== null);
}

/**
 * The instant a device meant, as UTC.
 *
 * The device sends "2026-09-03 09:15:00" and nothing about the offset it is in.
 * Read as UTC — which is what `Date.parse` would do with a "T" — a morning
 * punch in India lands five and a half hours early and can fall on the previous
 * day, which is the kind of error nobody notices until a month of reports is
 * wrong. So the offset is derived from the device's own configured zone.
 */
export function toUtc(localTimestamp: string, timezone: string): Date | null {
  const match = localTimestamp.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  // Treat the wall clock as UTC first, then subtract the zone's offset at that
  // moment. Doing it in this order is what makes it correct across a DST change
  // rather than only in January.
  const asIfUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? "0"),
  );

  const offsetMinutes = zoneOffsetMinutes(new Date(asIfUtc), timezone);
  if (offsetMinutes === null) return null;

  return new Date(asIfUtc - offsetMinutes * 60_000);
}

/** Minutes a zone is ahead of UTC at a given instant, or null if unknown. */
function zoneOffsetMinutes(at: Date, timezone: string): number | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const parts = Object.fromEntries(
      formatter.formatToParts(at).map((part) => [part.type, part.value]),
    );

    const asZone = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour === "24" ? "0" : parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );

    return Math.round((asZone - at.getTime()) / 60_000);
  } catch {
    // An unknown zone is a configuration error, not something to guess around.
    return null;
  }
}

/**
 * The calendar day a punch belongs to, from the wall clock that produced it.
 *
 * Taken from the local date the device reported rather than from the UTC
 * instant, because those are not the same day and the gym means the local one.
 * A member walking in at 04:30 on the 3rd in India is 23:00 on the 2nd in UTC:
 * converting first and truncating after files that visit under the previous
 * day, and an early-morning gym would have every dawn session on the wrong
 * date. The instant is still computed — it is what says when they arrived — but
 * the day comes from the date the device printed.
 */
function localDay(localTimestamp: string): Date | null {
  const match = localTimestamp.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
}

export const iclockService = {
  /**
   * The gym a serial belongs to, or null.
   *
   * The single gate on this whole surface. Everything else trusts what the
   * device says, so a serial that resolves to nothing must stop here.
   */
  async findDevice(serialNumber: string) {
    const serial = serialNumber.trim();
    if (!serial) return null;

    return prisma.attendanceDevice.findUnique({
      where: { serialNumber: serial },
      select: {
        id: true,
        tenantId: true,
        name: true,
        timezone: true,
        isActive: true,
      },
    });
  },

  /** Note that a device spoke to us, without claiming it did anything. */
  async touch(deviceId: string, punched = false) {
    const now = new Date();
    await prisma.attendanceDevice.update({
      where: { id: deviceId },
      data: { lastSeenAt: now, ...(punched ? { lastPunchAt: now } : {}) },
    });
  },

  /**
   * The configuration block a device asks for when it comes online.
   *
   * The shape is fixed by the firmware, down to the trailing newline. The
   * values that matter: `Realtime=1` makes punches push as they happen,
   * `TransFlag` lists what the device may upload, and `Delay` is the command
   * poll interval — the cost dial described at the top of this file.
   */
  configFor(serialNumber: string): string {
    return [
      `GET OPTION FROM: ${serialNumber}`,
      "Stamp=9999",
      "OpStamp=9999",
      "ErrorDelay=60",
      `Delay=${POLL_DELAY_SECONDS}`,
      "TransTimes=00:00;14:00",
      "TransInterval=1",
      "TransFlag=TransData AttLog OpLog",
      "Realtime=1",
      "Encrypt=0",
      "TimeZone=0",
      "",
    ].join("\n");
  },

  /**
   * Record a batch of punches.
   *
   * Answers with a count rather than throwing on a bad line: one unparseable
   * row in a batch of fifty should not make the device resend all fifty, and it
   * certainly should not lose the other forty-nine.
   */
  async recordPunches(
    device: { id: string; tenantId: string; timezone: string },
    punches: Punch[],
  ) {
    let marked = 0;
    let unmapped = 0;
    let unreadable = 0;

    // One lookup for the batch rather than one per punch: a busy morning
    // arrives as a single upload of many rows.
    const pins = [...new Set(punches.map((punch) => Number(punch.pin)))].filter(
      (pin) => Number.isInteger(pin),
    );

    const members = pins.length
      ? await prisma.tenantMembership.findMany({
          where: { tenantId: device.tenantId, deviceUserPin: { in: pins } },
          select: { id: true, deviceUserPin: true },
        })
      : [];

    const byPin = new Map(members.map((member) => [member.deviceUserPin, member.id]));

    for (const punch of punches) {
      const membershipId = byPin.get(Number(punch.pin));
      if (!membershipId) {
        // A card the gym has not mapped to anybody. Counted so the desk can see
        // that the machine is working and the enrolment is not.
        unmapped += 1;
        continue;
      }

      const day = localDay(punch.timestamp);
      if (!day) {
        unreadable += 1;
        continue;
      }

      // `markedById` stays null: nobody at the desk marked this, the member
      // presented a card. That is the same shape a self check-in takes.
      await attendanceRepository.markAttendance(
        device.tenantId,
        membershipId,
        day,
        null,
        `RFID · ${device.timezone === "Asia/Kolkata" ? punch.timestamp : `${punch.timestamp} ${device.timezone}`}`,
      );
      marked += 1;
    }

    await this.touch(device.id, marked > 0);

    return { marked, unmapped, unreadable, received: punches.length };
  },
};
