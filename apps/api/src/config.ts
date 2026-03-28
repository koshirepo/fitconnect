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
  get vapidEmail() { return process.env.VAPID_EMAIL ?? "mailto:admin@gympro.app"; },
};
