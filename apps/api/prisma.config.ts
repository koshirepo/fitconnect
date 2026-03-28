/**
 * Documentation: Prisma CLI configuration.
 *
 * - Resolves the Prisma schema path, migration directory, and datasource URL used by CLI commands in local and non-local environments.
 * - When a local Wrangler D1 database exists, this file prefers that SQLite path so schema diffing and generation work against the same data source as the Worker.
 * - Primary exports: default export.
 */
import "dotenv/config";
import { listLocalDatabases } from "@prisma/adapter-d1";
import { defineConfig, env } from "prisma/config";

const localDatabasePath = listLocalDatabases().at(-1);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: localDatabasePath ? `file:${localDatabasePath}` : env("DATABASE_URL"),
  },
});
