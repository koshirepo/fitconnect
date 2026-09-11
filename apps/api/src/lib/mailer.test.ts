/**
 * Documentation: Tests for which mailbox a gym's email leaves from.
 *
 * - The fallback is the whole feature, and it is silent by design — a gym that is misconfigured still gets its password resets delivered, from the platform address. Silent means nothing fails loudly when this is wrong, so the branches are pinned here instead.
 * - The half-configured cases matter most. A row with a host and a user but no password, or with a password that no longer unseals because the key rotated, must fall back rather than throw inside somebody's password reset.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./prisma", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

vi.mock("./secret-box", () => ({
  open: vi.fn(),
  seal: vi.fn(),
  credentialsKeyConfigured: () => true,
  isSealed: () => true,
}));

// Nodemailer is never actually reached in these tests — nothing here sends —
// but the module is imported at load, so it needs a transport factory.
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: vi.fn(), verify: vi.fn() })) },
}));

import { mailerService } from "./mailer";
import { prisma } from "./prisma";
import { open } from "./secret-box";

const queryRaw = vi.mocked(prisma.$queryRaw);
const unseal = vi.mocked(open);

/** A saved row, as the raw read hands it back. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    emailHost: "smtp.gym.in",
    emailPort: 587,
    emailSecure: 0,
    emailUser: "hello@gym.in",
    emailPassword: "sealed:abc",
    emailFrom: '"Iron House" <hello@gym.in>',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.EMAIL_USER = "platform@fitconnect.app";
  process.env.EMAIL_PASSWORD = "platform-secret";
  process.env.EMAIL_FROM = '"Fit Connect" <noreply@fitconnect.app>';
  process.env.EMAIL_HOST = "smtp.platform.test";
  process.env.EMAIL_PORT = "587";
  process.env.EMAIL_SECURE = "false";
  unseal.mockResolvedValue("gym-app-password");
});

describe("resolve", () => {
  it("sends from the gym's own mailbox when it has one", async () => {
    queryRaw.mockResolvedValue([row()] as never);

    const mailer = await mailerService.resolve("gym_1");

    expect(mailer).toMatchObject({
      source: "TENANT",
      host: "smtp.gym.in",
      user: "hello@gym.in",
      pass: "gym-app-password",
      from: '"Iron House" <hello@gym.in>',
    });
  });

  it("falls back to the platform when the gym has saved nothing", async () => {
    queryRaw.mockResolvedValue([] as never);

    const mailer = await mailerService.resolve("gym_1");

    expect(mailer).toMatchObject({
      source: "PLATFORM",
      user: "platform@fitconnect.app",
      from: '"Fit Connect" <noreply@fitconnect.app>',
    });
  });

  /**
   * No gym id at all — a password reset, requested by an address before
   * anything knows which gym that person trains at.
   */
  it("uses the platform when no gym is named, without querying", async () => {
    const mailer = await mailerService.resolve(null);

    expect(mailer?.source).toBe("PLATFORM");
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it.each([
    ["no host", { emailHost: null }],
    ["no user", { emailUser: null }],
    ["no password", { emailPassword: null }],
  ])("falls back rather than half-sending when there is %s", async (_label, overrides) => {
    queryRaw.mockResolvedValue([row(overrides)] as never);

    const mailer = await mailerService.resolve("gym_1");

    expect(mailer?.source).toBe("PLATFORM");
  });

  /**
   * The stored password no longer unseals — the credentials key was rotated,
   * say. Falling back delivers the email from the wrong address; throwing
   * delivers nothing at all, inside a password reset.
   */
  it("falls back when the saved password will not unseal", async () => {
    queryRaw.mockResolvedValue([row()] as never);
    unseal.mockResolvedValue(null);

    const mailer = await mailerService.resolve("gym_1");

    expect(mailer?.source).toBe("PLATFORM");
  });

  /** The columns arrive with migration 0051; a database behind that must send. */
  it("falls back when the column does not exist yet", async () => {
    queryRaw.mockRejectedValue(new Error("no such column: emailHost"));

    const mailer = await mailerService.resolve("gym_1");

    expect(mailer?.source).toBe("PLATFORM");
  });

  it("sends as the username when the gym saved no From header", async () => {
    queryRaw.mockResolvedValue([row({ emailFrom: null })] as never);

    const mailer = await mailerService.resolve("gym_1");

    expect(mailer?.from).toBe("hello@gym.in");
  });

  /** SQLite has no boolean; a raw read gives 0 or 1. */
  it("reads the TLS flag back as a boolean", async () => {
    queryRaw.mockResolvedValue([row({ emailSecure: 1, emailPort: 465 })] as never);

    const mailer = await mailerService.resolve("gym_1");

    expect(mailer?.secure).toBe(true);
    expect(mailer?.port).toBe(465);
  });

  /** An integer column can arrive as a bigint, which breaks a port number. */
  it("normalises a port handed back as a bigint", async () => {
    queryRaw.mockResolvedValue([row({ emailPort: 465n })] as never);

    const mailer = await mailerService.resolve("gym_1");

    expect(mailer?.port).toBe(465);
  });

  it("is null when neither the gym nor the deployment can send", async () => {
    queryRaw.mockResolvedValue([] as never);
    // Emptied rather than deleted: the generated env types declare these as
    // required, and an empty string is the same falsy "not configured".
    process.env.EMAIL_USER = "";
    process.env.EMAIL_PASSWORD = "";

    expect(await mailerService.resolve("gym_1")).toBeNull();
  });
});
