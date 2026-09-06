/**
 * Documentation: Tests for gym subdomain host parsing.
 *
 * - Covers the decision that decides which gym a request belongs to, which makes it an access-control boundary as much as a routing one: a host that resolves to the wrong slug shows one gym's data under another gym's address, and a reserved prefix that leaks through would let a gym claim `api` or `admin`.
 * - The API and the PWA both call this with their own configured root domains. These tests pin the shared behaviour so the two cannot drift apart again.
 */
import { describe, expect, it } from "vitest";
import {
  normalizeHostname,
  isIpAddress,
  isLocalHost,
  registrableDomain,
  splitHost,
  tenantSlugFromHost,
  rootHostFromHost,
  parseRootDomains,
  RESERVED_SUBDOMAIN_PREFIXES,
} from "./tenant-host";

const ROOTS = ["fitconnect.co.in"];

describe("normalizeHostname", () => {
  it.each([
    ["a plain host", "fitconnect.co.in", "fitconnect.co.in"],
    ["mixed case", "FitConnect.CO.in", "fitconnect.co.in"],
    ["surrounding space", "  fitconnect.co.in  ", "fitconnect.co.in"],
    ["a scheme", "https://fitconnect.co.in", "fitconnect.co.in"],
    ["a path", "fitconnect.co.in/dashboard", "fitconnect.co.in"],
    ["a scheme and a path", "http://rudra.fitconnect.co.in/login", "rudra.fitconnect.co.in"],
    ["a port", "localhost:5173", "localhost"],
    ["a trailing dot", "fitconnect.co.in.", "fitconnect.co.in"],
    ["an IPv6 literal in brackets", "[::1]", "::1"],
    ["a bracketed IPv6 literal with a port", "[::1]:8080", "::1"],
    ["a bracketed routable IPv6 literal", "[2001:db8::1]", "2001:db8::1"],
    ["a bare IPv6 literal", "::1", "::1"],
  ])("strips %s", (_label, input, expected) => {
    expect(normalizeHostname(input)).toBe(expected);
  });

  it.each([null, undefined, ""])("returns an empty string for %s", (input) => {
    expect(normalizeHostname(input as unknown as string)).toBe("");
  });
});

describe("isIpAddress", () => {
  it.each(["127.0.0.1", "10.0.0.5", "192.168.1.1", "::1"])("recognises %s", (host) => {
    expect(isIpAddress(host)).toBe(true);
  });

  it.each(["fitconnect.co.in", "rudra.fitconnect.co.in", "localhost"])(
    "does not mistake %s for one",
    (host) => {
      expect(isIpAddress(host)).toBe(false);
    },
  );
});

describe("isLocalHost", () => {
  it.each(["localhost", "127.0.0.1", "::1", "0.0.0.0", "mac.local"])("recognises %s", (host) => {
    expect(isLocalHost(host)).toBe(true);
  });

  it("does not treat a deployed host as local", () => {
    expect(isLocalHost("fitconnect.co.in")).toBe(false);
  });
});

describe("registrableDomain", () => {
  /**
   * The case that makes label-counting wrong. `fitconnect.co.in` has three
   * labels but is a root, not the subdomain "fitconnect" of "co.in".
   */
  it("honours a two-label public suffix", () => {
    expect(registrableDomain("rudra.fitconnect.co.in")).toBe("fitconnect.co.in");
    expect(registrableDomain("fitconnect.co.in")).toBe("fitconnect.co.in");
  });

  it("treats an ordinary suffix as one label", () => {
    expect(registrableDomain("gym.fitconnect.app")).toBe("fitconnect.app");
  });

  it("leaves a bare two-label host alone", () => {
    expect(registrableDomain("fitconnect.app")).toBe("fitconnect.app");
  });

  it("handles the deployment platforms the app actually runs on", () => {
    expect(registrableDomain("fit-pwa.pages.dev")).toBe("fit-pwa.pages.dev");
    expect(registrableDomain("api.fit.workers.dev")).toBe("fit.workers.dev");
  });
});

describe("splitHost", () => {
  it("splits a gym subdomain from a configured root", () => {
    expect(splitHost("rudra.fitconnect.co.in", ROOTS)).toEqual({
      root: "fitconnect.co.in",
      prefix: "rudra",
    });
  });

  it("reports no prefix when the host is the root itself", () => {
    expect(splitHost("fitconnect.co.in", ROOTS)).toEqual({
      root: "fitconnect.co.in",
      prefix: null,
    });
  });

  /** A configured root is authoritative, even against the suffix list. */
  it("prefers a configured root over the public-suffix fallback", () => {
    expect(splitHost("rudra.gyms.example.co.in", ["gyms.example.co.in"])).toEqual({
      root: "gyms.example.co.in",
      prefix: "rudra",
    });
  });

  it("falls back to the public-suffix list when nothing is configured", () => {
    expect(splitHost("rudra.fitconnect.co.in")).toEqual({
      root: "fitconnect.co.in",
      prefix: "rudra",
    });
  });

  it("takes only the first label when a host is nested deeper", () => {
    expect(splitHost("a.b.fitconnect.co.in", ROOTS)).toEqual({
      root: "fitconnect.co.in",
      prefix: "a",
    });
  });

  /** The local development equivalent of a gym subdomain. */
  it("understands rudra.localhost", () => {
    expect(splitHost("rudra.localhost")).toEqual({ root: "localhost", prefix: "rudra" });
  });

  it("understands bare localhost, port and all", () => {
    expect(splitHost("localhost:5173")).toEqual({ root: "localhost", prefix: null });
  });

  it("never reads a prefix out of an IP address", () => {
    expect(splitHost("127.0.0.1")).toEqual({ root: "127.0.0.1", prefix: null });
  });

  it("returns an empty root for an empty host", () => {
    expect(splitHost("")).toEqual({ root: "", prefix: null });
  });
});

describe("tenantSlugFromHost", () => {
  it("reads the gym slug off a subdomain", () => {
    expect(tenantSlugFromHost("rudra.fitconnect.co.in", ROOTS)).toBe("rudra");
  });

  it("returns null on the app's own root", () => {
    expect(tenantSlugFromHost("fitconnect.co.in", ROOTS)).toBeNull();
  });

  /**
   * The security-relevant case: none of these may ever resolve to a gym, or a
   * gym could claim the platform's own addresses.
   */
  it.each([...RESERVED_SUBDOMAIN_PREFIXES])("refuses the reserved prefix %s", (prefix) => {
    expect(tenantSlugFromHost(`${prefix}.fitconnect.co.in`, ROOTS)).toBeNull();
  });

  it("reads a slug in local development", () => {
    expect(tenantSlugFromHost("rudra.localhost:5173")).toBe("rudra");
  });

  it("returns null for an IP address", () => {
    expect(tenantSlugFromHost("127.0.0.1")).toBeNull();
  });

  it("is not fooled by case or a scheme", () => {
    expect(tenantSlugFromHost("HTTPS://Rudra.FitConnect.co.in", ROOTS)).toBe("rudra");
  });
});

describe("rootHostFromHost", () => {
  it("strips a gym prefix", () => {
    expect(rootHostFromHost("rudra.fitconnect.co.in", ROOTS)).toBe("fitconnect.co.in");
  });

  it("leaves the root alone", () => {
    expect(rootHostFromHost("fitconnect.co.in", ROOTS)).toBe("fitconnect.co.in");
  });

  it("keeps localhost as the root in development", () => {
    expect(rootHostFromHost("rudra.localhost")).toBe("localhost");
  });
});

describe("parseRootDomains", () => {
  it("splits and normalizes a comma-separated setting", () => {
    expect(parseRootDomains("fitconnect.co.in, https://FIT.example.com/ ")).toEqual([
      "fitconnect.co.in",
      "fit.example.com",
    ]);
  });

  it.each([null, undefined, "", "  ", ",,"])("returns an empty list for %s", (value) => {
    expect(parseRootDomains(value)).toEqual([]);
  });
});
