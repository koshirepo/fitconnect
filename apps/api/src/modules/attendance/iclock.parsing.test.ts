/**
 * Documentation: Tests for reading what an RFID attendance machine uploads.
 *
 * - Covers the two pure steps between a device's raw upload and a stored visit: splitting an ATTLOG batch into punches, and turning a device's local wall clock into a UTC instant.
 * - These are here because a mistake in either is silent. A bad parse loses somebody's visit; a bad offset files it on the wrong day, and nobody notices until a month of reports is wrong.
 */
import { describe, expect, it } from "vitest";
import { parseAttendanceLog, toUtc } from "./iclock.service";

/** A batch is tab-separated, one punch per line. */
function line(pin: string, timestamp: string, ...rest: string[]) {
  return [pin, timestamp, ...rest].join("\t");
}

describe("parseAttendanceLog", () => {
  it("reads a punch with every column present", () => {
    expect(parseAttendanceLog(line("7", "2026-09-03 09:15:00", "0", "4"))).toEqual([
      { pin: "7", timestamp: "2026-09-03 09:15:00", status: "0", verifyMode: "4" },
    ]);
  });

  /** The firmware does not always send the same number of columns. */
  it("reads a punch with only the two columns that matter", () => {
    expect(parseAttendanceLog(line("7", "2026-09-03 09:15:00"))).toEqual([
      { pin: "7", timestamp: "2026-09-03 09:15:00", status: null, verifyMode: null },
    ]);
  });

  it("reads a whole batch", () => {
    const body = [
      line("7", "2026-09-03 09:15:00", "0", "4"),
      line("8", "2026-09-03 09:16:12", "0", "1"),
      line("9", "2026-09-03 09:17:40", "1", "15"),
    ].join("\n");

    expect(parseAttendanceLog(body)).toHaveLength(3);
  });

  it("reads a batch the device terminated with CRLF", () => {
    const body = `${line("7", "2026-09-03 09:15:00")}\r\n${line("8", "2026-09-03 09:16:00")}\r\n`;
    expect(parseAttendanceLog(body).map((punch) => punch.pin)).toEqual(["7", "8"]);
  });

  /**
   * One unreadable row must not cost the batch the other forty-nine — the
   * device would resend all of them, or lose them.
   */
  it("keeps the good rows in a batch containing a bad one", () => {
    const body = [
      line("7", "2026-09-03 09:15:00"),
      "garbage",
      line("8", "2026-09-03 09:16:00"),
    ].join("\n");

    expect(parseAttendanceLog(body).map((punch) => punch.pin)).toEqual(["7", "8"]);
  });

  it.each([
    ["an empty body", ""],
    ["blank lines", "\n\n   \n"],
    ["a row with no timestamp", line("7", "")],
    ["a row with no pin", line("", "2026-09-03 09:15:00")],
  ])("returns nothing for %s", (_label, body) => {
    expect(parseAttendanceLog(body)).toEqual([]);
  });
});

describe("toUtc", () => {
  /**
   * The case the implementation comment is about. 09:15 in Kolkata is 03:45
   * UTC; reading the wall clock as UTC would store it five and a half hours
   * early.
   */
  it("subtracts the device's offset rather than trusting the wall clock", () => {
    expect(toUtc("2026-09-03 09:15:00", "Asia/Kolkata")?.toISOString()).toBe(
      "2026-09-03T03:45:00.000Z",
    );
  });

  it("handles a zone with no offset at all", () => {
    expect(toUtc("2026-09-03 09:15:00", "UTC")?.toISOString()).toBe("2026-09-03T09:15:00.000Z");
  });

  it("handles a zone behind UTC", () => {
    expect(toUtc("2026-09-03 09:15:00", "America/New_York")?.toISOString()).toBe(
      "2026-09-03T13:15:00.000Z",
    );
  });

  /**
   * Getting this right in January and wrong in July is the whole reason the
   * offset is computed at the punch's own instant instead of once.
   */
  it("uses the offset in force on that date, not a fixed one", () => {
    const winter = toUtc("2026-01-15 09:00:00", "America/New_York");
    const summer = toUtc("2026-07-15 09:00:00", "America/New_York");

    expect(winter?.toISOString()).toBe("2026-01-15T14:00:00.000Z"); // EST, UTC-5
    expect(summer?.toISOString()).toBe("2026-07-15T13:00:00.000Z"); // EDT, UTC-4
  });

  it("accepts a timestamp with no seconds", () => {
    expect(toUtc("2026-09-03 09:15", "UTC")?.toISOString()).toBe("2026-09-03T09:15:00.000Z");
  });

  it("accepts the ISO-style T separator some firmware sends", () => {
    expect(toUtc("2026-09-03T09:15:00", "UTC")?.toISOString()).toBe("2026-09-03T09:15:00.000Z");
  });

  it.each([
    ["a malformed timestamp", "not-a-date", "UTC"],
    ["a date with no time", "2026-09-03", "UTC"],
    ["an empty string", "", "UTC"],
  ])("returns null for %s", (_label, timestamp, timezone) => {
    expect(toUtc(timestamp, timezone)).toBeNull();
  });

  /** An unknown zone is a configuration error, not something to guess around. */
  it("returns null for a zone it does not recognise", () => {
    expect(toUtc("2026-09-03 09:15:00", "Mars/Olympus_Mons")).toBeNull();
  });
});
