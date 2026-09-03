/**
 * Documentation: Prisma CLI configuration.
 *
 * - Resolves the schema path, migration directory, and datasource URL for CLI commands in local and non-local environments.
 * - Where a local Wrangler D1 database exists, that SQLite file is preferred so diffing and generation work against the same data the Worker sees. Everywhere else — CI, a fresh clone, a machine that has never run `wrangler dev` — there is no such file and none is needed.
 * - Nothing here may throw. This module is evaluated by the Prisma CLI before it decides what it was asked to do, so an exception during resolution fails `generate` too — a command that needs no datasource at all. That is exactly how a missing `.wrangler` directory once broke every install: the scan for a local database ran during `npm ci`, found no directory, and threw before Prisma could get as far as generating a client.
 * - So the local lookup is guarded twice: the directory is checked first, and the scan itself is wrapped. A failure to find a local database is an ordinary outcome, not an error.
 * - Primary exports: default export.
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listLocalDatabases } from "@prisma/adapter-d1";
import { defineConfig } from "prisma/config";

/**
 * The local Wrangler D1 file, when there is one.
 *
 * `listLocalDatabases()` scans `<cwd>/.wrangler/state/v3/d1/...` and throws
 * when that directory is missing. Wrangler is never run from the repo root, so
 * during workspace installs the state lives under `apps/api/.wrangler` while
 * `process.cwd()` may be elsewhere — and in CI it does not exist at all.
 *
 * Both the existence check and the scan are defended, because they answer
 * different questions: the first covers "no state here", the second covers a
 * directory that exists but cannot be read, or a scan that resolves relative to
 * a working directory this file cannot see.
 */
function resolveLocalDatabasePath(): string | null {
  try {
    const localD1Directory = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      ".wrangler",
      "state",
      "v3",
      "d1",
      "miniflare-D1DatabaseObject",
    );

    if (!existsSync(localD1Directory)) {
      return null;
    }

    return listLocalDatabases().at(-1) ?? null;
  } catch {
    // No local database is a normal state, not a failure. Falling through to
    // the environment is what every non-developer machine should do.
    return null;
  }
}

/**
 * A URL that is only meaningful to the commands that touch a database.
 *
 * `generate` reads the schema and writes a client; it never connects. Supplying
 * a placeholder rather than demanding `DATABASE_URL` means an install on a
 * machine with neither local state nor that variable still produces a client,
 * which is the whole of what CI needs. A command that genuinely needs a
 * database — `migrate`, `studio` — still fails, and says so about the database
 * rather than about a config file that would not load.
 */
const localDatabasePath = resolveLocalDatabasePath();
const datasourceUrl =
  (localDatabasePath ? `file:${localDatabasePath}` : process.env.DATABASE_URL) ??
  "file:./prisma/.no-local-database.db";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: datasourceUrl,
  },
});
