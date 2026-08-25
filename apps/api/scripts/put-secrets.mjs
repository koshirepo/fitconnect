/**
 * Documentation: Interactive secret uploader.
 *
 * - Walks the Worker secrets an environment needs and shells out to `wrangler secret put` for each one, so nobody has to remember the list.
 * - Values are typed into wrangler's own prompt and never pass through this script, a file, or the shell history.
 * - Usage: `node scripts/put-secrets.mjs <test|production>` (or `npm run secrets:test`).
 */
import { spawnSync } from "node:child_process";

const REQUIRED_SECRETS = [
  { key: "JWT_SECRET", hint: "Long random string used to sign access tokens." },
  { key: "EMAIL_USER", hint: "SMTP username for outgoing mail." },
  { key: "EMAIL_PASSWORD", hint: "SMTP app password." },
  { key: "VAPID_PRIVATE_KEY", hint: "Web Push private key; pairs with VAPID_PUBLIC_KEY in wrangler.toml." },
  { key: "RAZORPAY_KEY_ID", hint: "Platform default Razorpay key id (rzp_live_… in production)." },
  { key: "RAZORPAY_KEY_SECRET", hint: "Platform default Razorpay key secret." },
  {
    key: "RAZORPAY_WEBHOOK_SECRET",
    hint: "Signing secret for the platform account's Razorpay webhook.",
  },
  {
    key: "CREDENTIALS_KEY",
    hint: "Encrypts gym-owned gateway secrets at rest. Generate with: openssl rand -base64 32",
  },
];

const env = process.argv[2];

if (!env || !["test", "production"].includes(env)) {
  console.error("Usage: node scripts/put-secrets.mjs <test|production>");
  process.exit(1);
}

console.log(`Setting Worker secrets for the "${env}" environment.`);
console.log("Wrangler prompts for each value; nothing is echoed or stored here.\n");

for (const { key, hint } of REQUIRED_SECRETS) {
  console.log(`→ ${key} — ${hint}`);

  const result = spawnSync("npx", ["wrangler", "secret", "put", key, "--env", env], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    console.error(`\nFailed to set ${key}. Fix the error above and re-run.`);
    process.exit(result.status ?? 1);
  }

  console.log("");
}

console.log(`All secrets set for "${env}".`);
