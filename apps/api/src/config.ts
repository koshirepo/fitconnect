/**
 * Documentation: Runtime configuration helpers.
 *
 * - Centralizes validated environment-variable access for JWT secrets, token TTLs, bcrypt settings, and optional push-notification configuration.
 * - Read configuration through these getters so startup and request-time failures remain explicit and consistent across modules.
 * - Primary exports: config.
 */
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing ${key} in environment variables.`);
  return value;
}

/**
 * Utility helper for the config that owns the `parse positive number` step.
 * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
 */
function parsePositiveNumber(key: string, fallback: string): number {
  const val = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(val) || val <= 0) throw new Error(`${key} must be a positive number.`);
  return val;
}

export const config = {
  get jwtSecret() { return requireEnv("JWT_SECRET"); },
  /** Access token TTL – default 1 hour */
  get jwtAccessTtlSeconds() { return parsePositiveNumber("JWT_ACCESS_TTL_SECONDS", "3600"); },
  /** Refresh token TTL – default 7 days */
  get jwtRefreshTtlSeconds() { return parsePositiveNumber("JWT_REFRESH_TTL_SECONDS", "604800"); },
  /** Bcrypt salt rounds */
  bcryptSaltRounds: 12,
  /** VAPID keys for Web Push (optional – push disabled when absent) */
  get vapidPublicKey() { return process.env.VAPID_PUBLIC_KEY ?? ""; },
  get vapidPrivateKey() { return process.env.VAPID_PRIVATE_KEY ?? ""; },
  get vapidEmail() { return process.env.VAPID_EMAIL ?? "mailto:admin@FitConnect.app"; },
  /**
   * Delhivery shipping. Absent token means the shop still sells, still takes
   * money, and simply cannot quote or book a courier — the checkout says so
   * rather than failing at the payment step.
   */
  get delhiveryToken() { return process.env.DELHIVERY_API_TOKEN ?? ""; },
  get delhiveryBaseUrl() { return process.env.DELHIVERY_BASE_URL ?? "https://track.delhivery.com"; },
  /** Warehouse name exactly as registered in the Delhivery panel. */
  get delhiveryPickupLocation() { return process.env.DELHIVERY_PICKUP_LOCATION ?? ""; },
  /**
   * The account name Delhivery knows us by, as shown on the client panel.
   * Only the waybill-reservation calls ask for it; everything else identifies
   * the account from the token alone.
   */
  get delhiveryClientName() { return process.env.DELHIVERY_CLIENT_NAME ?? ""; },
  /** Pincode parcels leave from, used for rate quotes. */
  get delhiveryOriginPincode() { return process.env.DELHIVERY_ORIGIN_PINCODE ?? ""; },
  /**
   * Volumetric divisor: cubic centimetres per kilogram of billable weight.
   * 5000 is Delhivery surface freight. Air is often 4000, which prices bulk
   * higher — a courier or service change is this setting, not a code change.
   */
  get volumetricDivisor() { return parsePositiveNumber("VOLUMETRIC_DIVISOR", "5000"); },
  /** Days after delivery a buyer may still ask to return an order. */
  /**
   * Shared secret for Delhivery's tracking push.
   *
   * Delhivery signs nothing — their webhook carries whatever Authorization
   * header the client asks them to send, and that is the only thing separating
   * a real scan from anyone who knows a waybill. Empty means the endpoint
   * refuses every delivery: a public route that can mark orders delivered, and
   * so open return windows, must not run unauthenticated.
   */
  get delhiveryWebhookToken() { return process.env.DELHIVERY_WEBHOOK_TOKEN ?? ""; },

  get returnWindowDays() { return parsePositiveNumber("RETURN_WINDOW_DAYS", "7"); },
};
