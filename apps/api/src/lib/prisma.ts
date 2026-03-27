import { PrismaClient } from "../generated/prisma/client";

type PrismaState = {
  client?: PrismaClient;
  db?: D1Database;
};

type GlobalPrismaState = typeof globalThis & {
  __gmsPrismaState?: PrismaState;
};

const state = ((globalThis as GlobalPrismaState).__gmsPrismaState ??= {});

function resetClient() {
  if (state.client) {
    void state.client.$disconnect().catch(() => undefined);
  }
  state.client = undefined;
  state.db = undefined;
}

export async function setD1(db: D1Database) {
  if (state.client && state.db === db) {
    return;
  }

  const { PrismaD1 } = await import("@prisma/adapter-d1");

  resetClient();
  state.db = db;
  state.client = new PrismaClient({
    adapter: new PrismaD1(db),
  });
}

function getPrisma(): PrismaClient {
  if (state.client) {
    return state.client;
  }

  throw new Error("Prisma client not configured. Call setD1(env.DB) before accessing Prisma.");
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    const client = getPrisma();
    const value = (client as any)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
