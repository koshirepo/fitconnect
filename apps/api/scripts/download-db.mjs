/**
 * Documentation: Download a remote D1 database to a SQL file.
 *
 * - Shells out to `wrangler d1 export` so the exact database id / environment
 *   wiring from `wrangler.toml` is reused and nothing needs to be remembered.
 * - Targets the production database (`fit-db`), the only remote environment.
 * - Writes next to the repo root by default so the file lands beside the
 *   project, e.g. `fit-db-export.sql`.
 * - Usage: `node scripts/download-db.mjs [production] [outputPath]` (or `npm run db:download`).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
// scripts/ → apps/api → apps → repo root.
const repoRoot = path.resolve(rootDir, "..", "..");

/**
 * Resolve the wrangler CLI entry so we can run it under `node` directly —
 * `.cmd` shims cannot be spawned without a shell on Windows.
 */
function resolveWranglerCli() {
  const candidates = [
    path.join(rootDir, "node_modules", "wrangler", "bin", "wrangler.js"),
    path.join(repoRoot, "node_modules", "wrangler", "bin", "wrangler.js"),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

const wranglerCli = resolveWranglerCli();

const DATABASES = {
  production: { name: "fit-db", file: "fit-db-export.sql" },
};

const env = process.argv[2] ?? "production";
const db = DATABASES[env];

if (!db) {
  console.error("Usage: node scripts/download-db.mjs [production] [outputPath]");
  process.exit(1);
}

const outputPath = process.argv[3]
  ? path.resolve(process.cwd(), process.argv[3])
  : path.join(repoRoot, db.file);

if (!wranglerCli) {
  console.error("Wrangler CLI not found. Run `npm install` first.");
  process.exit(1);
}

console.log(`Exporting D1 database "${db.name}" (${env}) to ${outputPath}...`);

const result = spawnSync(
  process.execPath,
  [
    wranglerCli,
    "d1",
    "export",
    db.name,
    // Without this, wrangler only sees the top-level `[[d1_databases]]` block
    // and cannot find the database declared under `[env.production]`.
    "--env",
    env,
    "--remote",
    "--output",
    outputPath,
    "--skip-confirmation",
  ],
  {
    cwd: rootDir,
    stdio: "inherit",
  },
);

if (result.status !== 0) {
  console.error(`\nExport failed (exit ${result.status ?? "unknown"}).`);
  process.exit(result.status ?? 1);
}

console.log(`\nDone. Wrote ${outputPath}`);
