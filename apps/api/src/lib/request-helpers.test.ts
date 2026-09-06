/**
 * Documentation: Tests for the request-scoped helpers every list and guarded route leans on.
 *
 * - Covers permission checks, pagination clamping, and the date comparison behind platform expiry. All three are small enough to look obviously correct and are load-bearing enough that being wrong is expensive: an unclamped limit is a way to ask the database for everything, and a permission helper that answers true when it should not is an access-control hole.
 * - Only the pure part of platform access is exercised here. The cached, Prisma-backed lookups around it need a database and belong in an integration test, not this file.
 */
import { describe, expect, it } from "vitest";
import type { Context } from "hono";
import { grantedPermissions, can, canAny, canAll } from "./permissions";
import { parsePagination } from "./pagination";
import { isPlatformExpired } from "./platform-access";
import { Permission } from "@fitconnect/shared/types/permissions";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@fitconnect/shared/constants";

/** A context carrying whatever the authorize middleware would have published. */
function contextWith(permissions?: Permission[]) {
  return {
    get: (key: string) => (key === "permissions" ? permissions && new Set(permissions) : undefined),
  } as unknown as Context;
}

/** A context whose query string is whatever a caller sent. */
function contextWithQuery(query: Record<string, string>) {
  return {
    req: { query: (key: string) => query[key] },
  } as unknown as Context;
}

describe("grantedPermissions", () => {
  it("returns what the middleware published", () => {
    const granted = grantedPermissions(contextWith([Permission.ATTENDANCE_READ]) as never);
    expect(granted.has(Permission.ATTENDANCE_READ)).toBe(true);
  });

  /** An unauthenticated request must come back with nothing, never undefined. */
  it("returns an empty set when nothing was published", () => {
    expect(grantedPermissions(contextWith(undefined) as never).size).toBe(0);
  });
});

describe("can", () => {
  it("says yes to a permission that was granted", () => {
    const c = contextWith([Permission.ATTENDANCE_MARK]) as never;
    expect(can(c, Permission.ATTENDANCE_MARK)).toBe(true);
  });

  it("says no to a permission that was not", () => {
    const c = contextWith([Permission.ATTENDANCE_MARK]) as never;
    expect(can(c, Permission.ATTENDANCE_DELETE)).toBe(false);
  });

  it("says no to everything when unauthenticated", () => {
    const c = contextWith(undefined) as never;
    expect(can(c, Permission.ATTENDANCE_READ)).toBe(false);
  });
});

describe("canAny", () => {
  const c = contextWith([Permission.ATTENDANCE_READ_SELF]) as never;

  it("is satisfied by one of several", () => {
    expect(canAny(c, [Permission.ATTENDANCE_READ, Permission.ATTENDANCE_READ_SELF])).toBe(true);
  });

  it("is not satisfied when none are held", () => {
    expect(canAny(c, [Permission.ATTENDANCE_READ, Permission.ATTENDANCE_DELETE])).toBe(false);
  });

  /**
   * An empty list means "none of these", so nothing satisfies it. Worth pinning:
   * the opposite answer would silently open any route that computed its
   * requirement list dynamically and came up empty.
   */
  it("is not satisfied by an empty list", () => {
    expect(canAny(c, [])).toBe(false);
  });
});

describe("canAll", () => {
  const c = contextWith([Permission.ATTENDANCE_READ, Permission.ATTENDANCE_MARK]) as never;

  it("requires every one of them", () => {
    expect(canAll(c, [Permission.ATTENDANCE_READ, Permission.ATTENDANCE_MARK])).toBe(true);
    expect(canAll(c, [Permission.ATTENDANCE_READ, Permission.ATTENDANCE_DELETE])).toBe(false);
  });

  /** Vacuously true, which is the conventional reading — recorded so it is a decision. */
  it("is satisfied by an empty list", () => {
    expect(canAll(c, [])).toBe(true);
  });
});

describe("parsePagination", () => {
  it("defaults to the first page at the shared page size", () => {
    expect(parsePagination(contextWithQuery({}))).toEqual({
      page: 1,
      limit: DEFAULT_PAGE_SIZE,
    });
  });

  it("takes the page and limit a caller asked for", () => {
    expect(parsePagination(contextWithQuery({ page: "3", limit: "10" }))).toEqual({
      page: 3,
      limit: 10,
    });
  });

  /** The reason this helper exists: nobody gets to ask for the whole table. */
  it("clamps a limit above the maximum", () => {
    expect(parsePagination(contextWithQuery({ limit: "100000" })).limit).toBe(MAX_PAGE_SIZE);
  });

  it.each([
    ["zero", "0"],
    ["a negative", "-5"],
  ])("clamps %s page to the first one", (_label, page) => {
    expect(parsePagination(contextWithQuery({ page })).page).toBe(1);
  });

  it.each([
    ["zero", "0"],
    ["a negative", "-5"],
  ])("clamps %s limit up to one row", (_label, limit) => {
    expect(parsePagination(contextWithQuery({ limit })).limit).toBe(1);
  });

  /**
   * Non-numeric input becomes NaN, and NaN loses every comparison — so this
   * documents what a caller sending "abc" actually gets rather than assuming
   * it falls back to the default.
   */
  it("yields NaN for non-numeric input rather than a default", () => {
    const { page, limit } = parsePagination(contextWithQuery({ page: "abc", limit: "abc" }));
    expect(Number.isNaN(page)).toBe(true);
    expect(Number.isNaN(limit)).toBe(true);
  });
});

describe("isPlatformExpired", () => {
  it("is true for a date in the past", () => {
    expect(isPlatformExpired(new Date(Date.now() - 60_000))).toBe(true);
  });

  it("is false for a date in the future", () => {
    expect(isPlatformExpired(new Date(Date.now() + 60_000))).toBe(false);
  });

  /** Never having set an expiry is not the same as having lapsed. */
  it.each([
    ["null", null],
    ["undefined", undefined],
  ])("is false when the expiry is %s", (_label, value) => {
    expect(isPlatformExpired(value)).toBe(false);
  });
});
