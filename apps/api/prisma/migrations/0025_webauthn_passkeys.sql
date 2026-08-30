-- Documentation: Passkeys — signing in with a fingerprint instead of a password.
-- - A member added at the desk gets their phone number as a password and, when
--   they gave no email, a synthetic address they will never type correctly. A
--   passkey replaces both with something the phone already holds.
-- - Only the public half of the key pair is stored. The private key never
--   leaves the authenticator, which is the entire security argument: there is
--   nothing here worth stealing.
-- - `counter` is kept because a signature counter that fails to advance is the
--   documented signal of a cloned authenticator. Storing it is what makes that
--   detectable later.
-- - Challenges live server-side and are deleted on use. Handing a challenge to
--   the browser to give back would defeat the purpose of having one.

CREATE TABLE IF NOT EXISTS "WebAuthnCredential" (
  "id"           TEXT PRIMARY KEY,
  "userId"       TEXT NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- Base64url, as the browser reports it.
  "credentialId" TEXT NOT NULL,
  -- The COSE public key, base64url.
  "publicKey"    TEXT NOT NULL,
  "counter"      INTEGER NOT NULL DEFAULT 0,
  -- "usb,nfc,ble,internal", as the browser reported them.
  "transports"   TEXT,
  -- Resident on the device, so it can sign in without the account being named.
  "discoverable" INTEGER NOT NULL DEFAULT 0,
  -- Whatever the owner calls it: "Pixel 8", "MacBook".
  "label"        TEXT,
  "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt"   DATETIME
);

CREATE UNIQUE INDEX "WebAuthnCredential_credentialId_key"
  ON "WebAuthnCredential"("credentialId");
CREATE INDEX "WebAuthnCredential_userId_idx" ON "WebAuthnCredential"("userId");

CREATE TABLE IF NOT EXISTS "WebAuthnChallenge" (
  "id"        TEXT PRIMARY KEY,
  -- Null for a sign-in that has not named an account yet.
  "userId"    TEXT,
  -- Ties the challenge to one browser across the two calls of a ceremony.
  "handle"    TEXT NOT NULL,
  "challenge" TEXT NOT NULL,
  -- "REGISTER" | "LOGIN"
  "purpose"   TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "WebAuthnChallenge_handle_key" ON "WebAuthnChallenge"("handle");
-- The sweep of everything that timed out unanswered.
CREATE INDEX "WebAuthnChallenge_expiresAt_idx" ON "WebAuthnChallenge"("expiresAt");
