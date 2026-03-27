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
