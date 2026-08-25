/**
 * Documentation: Authenticated encryption for credentials held at rest.
 *
 * - Gym-owned payment gateway secrets live in the same D1 database as everything else, so they are sealed with AES-GCM before they are written and opened only in the request that needs to call the gateway.
 * - The key comes from `CREDENTIALS_KEY`. It is deliberately separate from `JWT_SECRET`: rotating a token-signing key should never render stored gateway secrets unreadable.
 * - Ciphertext is self-describing (`v1.<iv>.<payload>`) so a future scheme can be introduced without a migration that has to guess how existing rows were sealed.
 * - Primary exports: seal, open, isSealed, credentialsKeyConfigured.
 */

const VERSION = "v1";
const IV_BYTES = 12;

/** Cached per key material, since importKey is not free and the key is stable. */
let cached: { material: string; key: CryptoKey } | null = null;

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Whether the deployment can store tenant-owned secrets at all. */
export function credentialsKeyConfigured() {
  return Boolean(process.env.CREDENTIALS_KEY);
}

async function getKey() {
  const material = process.env.CREDENTIALS_KEY;
  if (!material) {
    throw new Error(
      "CREDENTIALS_KEY is not set. Gateway secrets cannot be stored until it is configured.",
    );
  }

  if (cached?.material === material) return cached.key;

  // The env value is an arbitrary passphrase, so hash it to the 256 bits AES-GCM
  // wants rather than requiring operators to supply exactly 32 bytes.
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(material),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );

  cached = { material, key };
  return key;
}

/** True for a value produced by `seal`, so callers can detect legacy plaintext. */
export function isSealed(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith(`${VERSION}.`);
}

export async function seal(plaintext: string) {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  return `${VERSION}.${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(ciphertext))}`;
}

/**
 * Unseal a stored secret. Returns null when the value cannot be opened — a
 * wrong key, a truncated row, or a value written before sealing existed — so
 * callers can fall back rather than crash a payment mid-flight.
 */
export async function open(sealed: string | null | undefined) {
  if (!isSealed(sealed)) return null;

  const [, ivPart, payloadPart] = sealed.split(".");
  if (!ivPart || !payloadPart) return null;

  try {
    const key = await getKey();
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlDecode(ivPart) },
      key,
      base64UrlDecode(payloadPart),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}
