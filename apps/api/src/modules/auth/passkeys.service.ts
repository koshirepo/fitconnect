/**
 * Documentation: Passkeys — signing in with the device instead of a password.
 *
 * - Four calls, two ceremonies. Registration and sign-in each start by asking for options (which mint a single-use challenge) and finish by verifying what the authenticator signed. Nothing here trusts the browser's own account of what happened; every claim is checked against a challenge this server issued and a key this server stored.
 * - The challenge is kept server-side and deleted the moment it is used. Handing it to the browser to give back would defeat the point of having one, and a challenge that survives its ceremony is a replay waiting to happen.
 * - The relying-party id is the registrable domain, not the host: a passkey created on `rudra.fitconnect.co.in` has to work on the apex and on every other gym's subdomain, because it belongs to the person rather than to the gym.
 * - Sign-in ends by handing off to the same token-issuing path a password login uses, so a session from a passkey is indistinguishable from any other — including the gym-subdomain check that stops one gym's member signing in on another's page.
 * - Primary exports: passkeyService.
 */
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";

import { prisma } from "../../lib/prisma";
import { parseRootDomains, rootHostFromHost } from "@fitconnect/shared/tenant-host";

/** A ceremony is abandoned far more often than it is finished. */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * The relying party: which origin this credential belongs to.
 *
 * `rpID` must be the registrable domain rather than the request host. A member
 * registers a passkey while on their gym's subdomain and later opens the apex,
 * or their gym is renamed; a credential scoped to one hostname would stop
 * working in both cases. Scoping it to the root domain keeps the passkey
 * attached to the person.
 */
function relyingParty(host: string) {
  const roots = parseRootDomains(process.env.APP_ROOT_DOMAINS);
  const rpID = rootHostFromHost(host, roots) ?? host.split(":")[0]!;

  // Origins are compared exactly, so the port has to survive: locally the app
  // is served from <slug>.localhost:5173. Only localhost may be insecure —
  // WebAuthn refuses plain HTTP anywhere else, so assuming https for every
  // other host is a fact rather than a guess.
  const hostname = host.split(":")[0]!;
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost");

  return {
    rpID,
    rpName: "FitConnect",
    origin: `${isLocal ? "http" : "https"}://${host}`,
  };
}

/** Base64url, the encoding every value in the WebAuthn payloads already uses. */
function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * Issue a challenge, and clear whatever the same subject left behind.
 *
 * An abandoned ceremony leaves a row nobody will ever answer; starting a new
 * one is the natural moment to sweep it, which keeps the table from needing a
 * cron of its own.
 */
async function issueChallenge(input: {
  userId: string | null;
  challenge: string;
  purpose: "REGISTER" | "LOGIN";
}) {
  const handle = crypto.randomUUID();

  await prisma.webAuthnChallenge.deleteMany({
    where: {
      OR: [
        ...(input.userId ? [{ userId: input.userId, purpose: input.purpose }] : []),
        { expiresAt: { lt: new Date() } },
      ],
    },
  });

  await prisma.webAuthnChallenge.create({
    data: {
      userId: input.userId,
      handle,
      challenge: input.challenge,
      purpose: input.purpose,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });

  return handle;
}

/** Take a challenge: read it and destroy it, so it can only answer once. */
async function consumeChallenge(handle: string, purpose: "REGISTER" | "LOGIN") {
  const row = await prisma.webAuthnChallenge.findUnique({ where: { handle } });
  if (!row) return null;

  await prisma.webAuthnChallenge.delete({ where: { handle } }).catch(() => {
    // Already gone: two tabs answering the same ceremony. The verification
    // below still fails on the second, which is the outcome we want.
  });

  if (row.purpose !== purpose) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;

  return row;
}

export const passkeyService = {
  /** What the browser needs to create a passkey for the signed-in user. */
  async registrationOptions(userId: string, host: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    if (!user) return { error: "Account not found.", status: 404 as const };

    const existing = await prisma.webAuthnCredential.findMany({
      where: { userId },
      select: { credentialId: true, transports: true },
    });

    const { rpID, rpName } = relyingParty(host);

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: fromBase64Url(toBase64Url(new TextEncoder().encode(user.id))),
      userName: user.email,
      userDisplayName: user.name,
      // Nothing is gained by collecting attestation statements this app will
      // never inspect, and asking for them shows the user an extra prompt.
      attestationType: "none",
      // Naming what is already registered is how the browser stops somebody
      // enrolling the same device twice and being puzzled by the result.
      excludeCredentials: existing.map((credential) => ({
        id: credential.credentialId,
        ...(credential.transports
          ? { transports: credential.transports.split(",") as never }
          : {}),
      })),
      authenticatorSelection: {
        // Resident, so the member can sign in without typing an email first —
        // the whole reason this is better than the password it replaces.
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    const handle = await issueChallenge({
      userId,
      challenge: options.challenge,
      purpose: "REGISTER",
    });

    return { data: { options, handle } };
  },

  /** Check what the authenticator signed, and keep the public half. */
  async verifyRegistration(
    userId: string,
    host: string,
    input: { handle: string; response: RegistrationResponseJSON; label?: string },
  ) {
    const challenge = await consumeChallenge(input.handle, "REGISTER");
    if (!challenge || challenge.userId !== userId) {
      return { error: "That registration expired. Try again.", status: 400 as const };
    }

    const { rpID, origin } = relyingParty(host);

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: input.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: false,
      });
    } catch {
      return { error: "That passkey could not be verified.", status: 400 as const };
    }

    if (!verification.verified || !verification.registrationInfo) {
      return { error: "That passkey could not be verified.", status: 400 as const };
    }

    const { credential, credentialDeviceType } = verification.registrationInfo;

    await prisma.webAuthnCredential.create({
      data: {
        userId,
        credentialId: credential.id,
        publicKey: toBase64Url(credential.publicKey),
        counter: credential.counter,
        ...(credential.transports?.length
          ? { transports: credential.transports.join(",") }
          : {}),
        // "multiDevice" means the key syncs through a password manager, so it
        // is usable on hardware this browser has never seen.
        discoverable: credentialDeviceType === "multiDevice",
        ...(input.label?.trim() ? { label: input.label.trim() } : {}),
      },
    });

    return { data: { registered: true } };
  },

  /**
   * What the browser needs to sign in.
   *
   * No email is required. With a resident key the authenticator already knows
   * which account it holds, and asking for one first would put back the field
   * this feature exists to remove.
   */
  async authenticationOptions(host: string) {
    const { rpID } = relyingParty(host);

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
      // Deliberately empty: let the authenticator offer whatever it holds for
      // this domain rather than this server naming accounts to an anonymous
      // caller, which would leak which addresses are registered.
      allowCredentials: [],
    });

    const handle = await issueChallenge({
      userId: null,
      challenge: options.challenge,
      purpose: "LOGIN",
    });

    return { data: { options, handle } };
  },

  /**
   * Verify an assertion and say whose it was.
   *
   * Returns the user id only; the caller mints the session, so a passkey login
   * goes through exactly the same account-status, tenant-host, and permission
   * checks a password login does.
   */
  async verifyAuthentication(
    host: string,
    input: { handle: string; response: AuthenticationResponseJSON },
  ) {
    const challenge = await consumeChallenge(input.handle, "LOGIN");
    if (!challenge) {
      return { error: "That sign-in expired. Try again.", status: 400 as const };
    }

    const credential = await prisma.webAuthnCredential.findUnique({
      where: { credentialId: input.response.id },
      select: {
        id: true,
        userId: true,
        credentialId: true,
        publicKey: true,
        counter: true,
        transports: true,
      },
    });
    if (!credential) {
      return { error: "That passkey is not registered here.", status: 401 as const };
    }

    const { rpID, origin } = relyingParty(host);

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: input.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: false,
        credential: {
          id: credential.credentialId,
          publicKey: fromBase64Url(credential.publicKey),
          counter: credential.counter,
          ...(credential.transports
            ? { transports: credential.transports.split(",") as never }
            : {}),
        },
      });
    } catch {
      return { error: "That passkey could not be verified.", status: 401 as const };
    }

    if (!verification.verified) {
      return { error: "That passkey could not be verified.", status: 401 as const };
    }

    // The counter is the clone check: a real authenticator only ever counts up.
    // Many modern ones report zero permanently, which is allowed, so only a
    // genuine regression is treated as evidence.
    const { newCounter } = verification.authenticationInfo;
    if (credential.counter > 0 && newCounter <= credential.counter) {
      return {
        error: "That passkey looks like a copy and has been refused.",
        status: 401 as const,
      };
    }

    await prisma.webAuthnCredential.update({
      where: { id: credential.id },
      data: { counter: newCounter, lastUsedAt: new Date() },
    });

    return { data: { userId: credential.userId } };
  },

  /** The passkeys an account holds, for the screen that manages them. */
  async list(userId: string) {
    const passkeys = await prisma.webAuthnCredential.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        label: true,
        transports: true,
        discoverable: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });

    return { data: { passkeys } };
  },

  /**
   * Forget one passkey.
   *
   * Scoped to the owner, so an id from somebody else's account matches nothing
   * rather than deleting it.
   */
  async remove(userId: string, id: string) {
    const removed = await prisma.webAuthnCredential.deleteMany({
      where: { id, userId },
    });

    if (removed.count === 0) {
      return { error: "That passkey was not found.", status: 404 as const };
    }

    return { data: { removed: true } };
  },
};
