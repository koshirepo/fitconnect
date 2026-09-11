/**
 * Documentation: A gym's own outgoing mailbox.
 *
 * - The settings side of `lib/mailer`: what the screen may show, what an admin may change, and proving the credentials work before anybody relies on them. Deliberately shaped like `gateway.service`, because it answers the same question about a different resource.
 * - The password is sealed on the way in and never comes back out. The screen is told whether one is on file, never what it is — the same contract the Razorpay secret has.
 * - Saving verifies first. A gym that mistypes an app password should find out while it is looking at the form, not three weeks later when a member's reset never arrives.
 * - Primary exports: tenantEmailService.
 */
import { prisma } from "../../lib/prisma";
import { credentialsKeyConfigured, seal } from "../../lib/secret-box";
import { mailerService } from "../../lib/mailer";
import type { UpdateTenantEmailInput } from "./settings.schema";

type ServiceError = { error: string; status: 400 | 403 | 409 | 502 | 503 };

/** The saved row, read defensively — these columns arrive with 0051. */
async function savedConfig(tenantId: string) {
  try {
    const rows = await prisma.$queryRaw<
      {
        emailHost: string | null;
        emailPort: number | bigint | null;
        emailSecure: number | boolean | null;
        emailUser: string | null;
        emailPassword: string | null;
        emailFrom: string | null;
      }[]
    >`
      SELECT "emailHost", "emailPort", "emailSecure", "emailUser", "emailPassword", "emailFrom"
      FROM "TenantSettings" WHERE "tenantId" = ${tenantId} LIMIT 1
    `;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export const tenantEmailService = {
  /**
   * What the settings screen shows: which mailbox is in use, the address it
   * sends from, and whether a password is on file — never the password.
   */
  async getConfig(tenantId: string) {
    const [saved, resolved] = await Promise.all([
      savedConfig(tenantId),
      mailerService.resolve(tenantId),
    ]);

    return {
      data: {
        email: {
          /** Whether this gym can send at all right now. */
          enabled: Boolean(resolved),
          /** TENANT when the gym sends from its own mailbox. */
          source: resolved?.source ?? null,
          /** The address members would see. Safe to show — it is public by nature. */
          sendingFrom: resolved?.from ?? null,
          host: saved?.emailHost ?? null,
          port: saved?.emailPort === null || saved?.emailPort === undefined
            ? null
            : Number(saved.emailPort),
          secure: saved?.emailSecure === null || saved?.emailSecure === undefined
            ? null
            : Boolean(saved.emailSecure),
          user: saved?.emailUser ?? null,
          from: saved?.emailFrom ?? null,
          /** Never the password itself. */
          passwordSet: Boolean(saved?.emailPassword),
          /**
           * Whether this deployment can seal a gym-owned secret at all. False
           * means the form should say so rather than failing on save.
           */
          canStoreSecrets: credentialsKeyConfigured(),
        },
      },
    };
  },

  /**
   * Save a gym's own mailbox, or clear it back to the platform's.
   *
   * An empty host is the clear signal, matching how an empty `keyId` clears the
   * gateway. Clearing is always allowed even on a deployment that cannot seal
   * secrets — a gym must be able to stop using credentials it can no longer
   * manage.
   */
  async updateConfig(
    tenantId: string,
    input: UpdateTenantEmailInput,
  ): Promise<{ data: { cleared: boolean; verified: boolean } } | ServiceError> {
    const clearing = input.host !== undefined && input.host.trim() === "";

    if (clearing) {
      await prisma.tenantSettings.upsert({
        where: { tenantId },
        update: {
          emailHost: null,
          emailPort: null,
          emailSecure: null,
          emailUser: null,
          emailPassword: null,
          emailFrom: null,
        },
        create: { tenantId, emailHost: null },
      });
      return { data: { cleared: true, verified: false } };
    }

    if (!credentialsKeyConfigured()) {
      return {
        error:
          "This deployment cannot store gym-owned mail passwords yet: CREDENTIALS_KEY is not set on the API. Set it and try again.",
        status: 503,
      };
    }

    const saved = await savedConfig(tenantId);

    // Everything needed to send has to be present once, on the row or in this
    // request. A half-saved mailbox is exactly the state that falls back
    // silently, which is the confusing outcome this refuses up front.
    const host = input.host ?? saved?.emailHost ?? null;
    const user = input.user ?? saved?.emailUser ?? null;
    const port = input.port ?? (saved?.emailPort == null ? 587 : Number(saved.emailPort));
    const secure = input.secure ?? Boolean(saved?.emailSecure);

    if (!host || !user) {
      return { error: "A mail server and a username are both required.", status: 400 };
    }

    // The password is only ever known here when this request carries it: what
    // is stored is sealed, and unsealing it to re-verify an unchanged password
    // would be reading a secret back for no reason.
    if (!input.password && !saved?.emailPassword) {
      return { error: "A password is required the first time.", status: 400 };
    }

    let verified = false;
    if (input.password) {
      const check = await mailerService.verify({
        host,
        port,
        secure,
        user,
        pass: input.password,
        from: input.from ?? saved?.emailFrom ?? user,
      });

      if (!check.ok) {
        return {
          error: `Those details were refused by the mail server: ${check.reason}`,
          status: 502,
        };
      }
      verified = true;
    }

    await prisma.tenantSettings.upsert({
      where: { tenantId },
      update: {
        emailHost: host,
        emailPort: port,
        emailSecure: secure,
        emailUser: user,
        ...(input.password ? { emailPassword: await seal(input.password) } : {}),
        ...(input.from !== undefined ? { emailFrom: input.from.trim() || null } : {}),
      },
      create: {
        tenantId,
        emailHost: host,
        emailPort: port,
        emailSecure: secure,
        emailUser: user,
        ...(input.password ? { emailPassword: await seal(input.password) } : {}),
        ...(input.from ? { emailFrom: input.from.trim() || null } : {}),
      },
    });

    return { data: { cleared: false, verified } };
  },

  /**
   * Prove the mailbox currently in use actually works.
   *
   * Uses whatever `resolve` would use for a real send, so a gym testing its
   * own credentials tests those, and a gym on the fallback learns that the
   * platform mailbox is reachable — which is the honest answer to "will my
   * members get their email".
   */
  async testConnection(tenantId: string): Promise<
    { data: { ok: true; source: string; sendingFrom: string } } | ServiceError
  > {
    const mailer = await mailerService.resolve(tenantId);
    if (!mailer) {
      return { error: "No mailbox is configured for this gym or the platform.", status: 409 };
    }

    const check = await mailerService.verify(mailer);
    if (!check.ok) {
      return { error: `The mail server refused the connection: ${check.reason}`, status: 502 };
    }

    return { data: { ok: true, source: mailer.source, sendingFrom: mailer.from } };
  },
};
