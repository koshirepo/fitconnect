/**
 * Documentation: Prisma client freshness and seed orchestration script.
 *
 * - Ensures the generated Prisma client stays in sync with `prisma/schema.prisma` and also hosts the deterministic seed workflows used for local and remote databases.
 * - This script sits on the critical path for install, build, dev, deploy, typecheck, and seeding commands, so keep changes backwards-compatible with package scripts.
 */
import { spawnSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.basename(scriptDir).toLowerCase() === "scripts" ? path.resolve(scriptDir, "..") : scriptDir;
const schemaPath = path.join(rootDir, "prisma", "schema.prisma");
const clientPath = path.join(rootDir, "src", "generated", "prisma", "client.ts");
/**
 * Where a workspace dependency actually landed.
 *
 * npm hoists shared dependencies to the repo root, so `apps/api/node_modules`
 * holds only what could not be hoisted. Looking in one place finds the CLIs on
 * a fresh clone and reports them missing on an ordinary hoisted install, which
 * is the more common of the two. Each candidate is walked from the app upwards,
 * so a locally installed copy still wins over the hoisted one.
 */
function resolveFromWorkspace(...segments) {
  const candidates = [
    path.join(rootDir, "node_modules", ...segments),
    path.resolve(rootDir, "..", "..", "node_modules", ...segments),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

const binName = (name) => (process.platform === "win32" ? `${name}.cmd` : name);

const prismaBin = resolveFromWorkspace(".bin", binName("prisma"));
const prismaCliPath = resolveFromWorkspace("prisma", "build", "index.js");
const wranglerConfigPath = path.join(rootDir, "wrangler.toml");
const wranglerBin = resolveFromWorkspace(".bin", binName("wrangler"));
const wranglerCliPath = resolveFromWorkspace("wrangler", "bin", "wrangler.js");
const localD1Path = path.join(
  rootDir,
  ".wrangler",
  "state",
  "v3",
  "d1",
  "miniflare-D1DatabaseObject"
);
const MINIFLARE_D1_UNIQUE_KEY = "miniflare-D1DatabaseObject";
const DEFAULT_SEED_OPTIONS = {
  seed: 20260327,
  tenants: 6,
  coachesPerTenant: 2,
  membersPerTenant: 24,
  products: 32,
  orders: 140,
  attendanceDays: 45,
  password: "Test@1234",
  database: null,
  outFile: path.join(rootDir, ".wrangler", "tmp", "seed-remote.sql"),
  noExecute: false,
};
const ID_COUNTERS = new Map();
const TABLE_DUMP_ORDER = [
  "User",
  "Tenant",
  "TenantSettings",
  "TenantCharge",
  "TenantMembership",
  "Subscription",
  "Shift",
  "Payment",
  "Product",
  "Order",
  "OrderItem",
  "WorkoutPlan",
  "WorkoutPlanAssignment",
  "Attendance",
  "AuditLog",
  "PlatformPayment",
];
const TABLE_DUMP_PRIORITY = new Map(TABLE_DUMP_ORDER.map((tableName, index) => [tableName, index]));
let phoneCounter = 9000000000;

/**
 * Support the `should generate` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function shouldGenerate() {
  if (!existsSync(clientPath)) {
    return true;
  }

  return statSync(schemaPath).mtimeMs > statSync(clientPath).mtimeMs;
}

/**
 * Support the `ensure prisma client` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function ensurePrismaClient() {
  if (!shouldGenerate()) {
    console.log("Prisma client is up to date.");
    process.exit(0);
  }

  if (!existsSync(prismaBin)) {
    console.error("Prisma CLI not found. Run npm install first.");
    process.exit(1);
  }

  console.log("Generating Prisma client...");

  const result = runCli(prismaCliPath, prismaBin, ["generate"]);

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

/**
 * Support the `parse seed options` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function parseSeedOptions(argv) {
  const options = { ...DEFAULT_SEED_OPTIONS };
  const numericKeys = {
    seed: "seed",
    tenants: "tenants",
    "coaches-per-tenant": "coachesPerTenant",
    "members-per-tenant": "membersPerTenant",
    products: "products",
    orders: "orders",
    "attendance-days": "attendanceDays",
  };
  const stringKeys = {
    password: "password",
    database: "database",
    "out-file": "outFile",
  };

  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      throw new Error(`Unsupported argument: ${arg}`);
    }

    const trimmed = arg.slice(2);
    const separatorIndex = trimmed.indexOf("=");
    const rawKey = separatorIndex === -1 ? trimmed : trimmed.slice(0, separatorIndex);
    const rawValue = separatorIndex === -1 ? undefined : trimmed.slice(separatorIndex + 1);

    if (rawKey === "no-execute") {
      options.noExecute = rawValue === undefined ? true : rawValue === "true";
      continue;
    }

    const stringKey = stringKeys[rawKey];
    if (stringKey) {
      if (stringKey === "password") {
        options.password = rawValue ?? DEFAULT_SEED_OPTIONS.password;
        continue;
      }
      if (!rawValue) {
        throw new Error(`Expected a value for --${rawKey}`);
      }
      options[stringKey] = stringKey === "outFile" ? path.resolve(rootDir, rawValue) : rawValue;
      continue;
    }

    const numericKey = numericKeys[rawKey];
    if (!numericKey) {
      throw new Error(`Unknown option: --${rawKey}`);
    }

    const value = Number.parseInt(rawValue ?? "", 10);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Expected a positive integer for --${rawKey}`);
    }

    options[numericKey] = value;
  }

  return options;
}

/**
 * Support the `create rng` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Support the `reset seed state` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function resetSeedState() {
  ID_COUNTERS.clear();
  phoneCounter = 9000000000;
}

/**
 * Support the `next id` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function nextId(prefix) {
  const value = (ID_COUNTERS.get(prefix) ?? 0) + 1;
  ID_COUNTERS.set(prefix, value);
  return `${prefix}_${String(value).padStart(4, "0")}`;
}

/**
 * Support the `next phone` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function nextPhone() {
  phoneCounter += 1;
  return String(phoneCounter);
}

/**
 * Support the `random int` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function randomInt(min, max, random) {
  return Math.floor(random() * (max - min + 1)) + min;
}

/**
 * Support the `pick` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function pick(values, random) {
  return values[Math.floor(random() * values.length)];
}

/**
 * Support the `sample` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function sample(values, count, random) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

/**
 * Support the `days ago` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function daysAgo(baseDate, days, hour, minute) {
  const value = new Date(baseDate);
  value.setUTCDate(value.getUTCDate() - days);
  value.setUTCHours(hour, minute, 0, 0);
  return value;
}

/**
 * Support the `add days` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function addDays(date, days) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

/**
 * Support the `iso` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function iso(date) {
  return date.toISOString();
}

/**
 * Support the `slugify` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Support the `list migration files` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function listMigrationFiles() {
  const migrationsDir = path.join(rootDir, "prisma", "migrations");
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => ({
      name: entry.name,
      path: path.join(migrationsDir, entry.name),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Support the `reset database` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function resetDatabase(db, migrations) {
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS "d1_migrations" (
      "id" INTEGER PRIMARY KEY,
      "name" TEXT,
      "applied_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const tables = db
    .prepare(`
      SELECT "name"
      FROM "sqlite_master"
      WHERE "type" = 'table'
        AND "name" NOT LIKE 'sqlite_%'
        AND "name" NOT IN ('_cf_METADATA', 'd1_migrations')
    `)
    .all();

  for (const { name } of tables) {
    db.exec(`DROP TABLE IF EXISTS "${name.replace(/"/g, '""')}";`);
  }

  db.prepare('DELETE FROM "d1_migrations"').run();
  db.exec('PRAGMA foreign_keys = ON;');

  const recordMigration = db.prepare('INSERT INTO "d1_migrations" ("name") VALUES (?)');
  for (const migration of migrations) {
    db.exec(readFileSync(migration.path, "utf8"));
    recordMigration.run(migration.name);
  }
}

/**
 * Support the `seed database` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function seedDatabase(db, options) {
  resetSeedState();
  const random = createRng(options.seed);

  const insertUser = db.prepare(`
    INSERT INTO "User" (
      "id", "name", "email", "phone", "passwordHash", "avatarUrl",
      "platformRole", "status", "createdAt", "updatedAt"
    ) VALUES (
      $id, $name, $email, $phone, $passwordHash, $avatarUrl,
      $platformRole, $status, $createdAt, $updatedAt
    )
  `);
  const insertTenant = db.prepare(`
    INSERT INTO "Tenant" (
      "id", "name", "slug", "email", "phone", "logoUrl", "address",
      "estd", "status", "createdAt", "updatedAt", "markdown", "description", "platformExpiresAt"
    ) VALUES (
      $id, $name, $slug, $email, $phone, $logoUrl, $address,
      $estd, $status, $createdAt, $updatedAt, $markdown, $description, $platformExpiresAt
    )
  `);
  const insertTenantSettings = db.prepare(`
    INSERT INTO "TenantSettings" ("id", "tenantId", "overdueDays", "createdAt", "updatedAt")
    VALUES ($id, $tenantId, $overdueDays, $createdAt, $updatedAt)
  `);
  const insertTenantCharge = db.prepare(`
    INSERT INTO "TenantCharge" ("id", "tenantId", "name", "amount", "isMandatory", "isActive", "createdAt", "updatedAt")
    VALUES ($id, $tenantId, $name, $amount, $isMandatory, $isActive, $createdAt, $updatedAt)
  `);
  const insertTenantMembership = db.prepare(`
    INSERT INTO "TenantMembership" (
      "id", "tenantId", "userId", "memberId", "role", "status", "dueDate", "joinedAt", "createdAt", "updatedAt"
    ) VALUES (
      $id, $tenantId, $userId, $memberId, $role, $status, $dueDate, $joinedAt, $createdAt, $updatedAt
    )
  `);
  const insertSubscription = db.prepare(`
    INSERT INTO "Subscription" ("id", "tenantId", "title", "description", "amount", "durationDays", "isActive", "createdAt", "updatedAt")
    VALUES ($id, $tenantId, $title, $description, $amount, $durationDays, $isActive, $createdAt, $updatedAt)
  `);
  const insertShift = db.prepare(`
    INSERT INTO "Shift" ("id", "tenantId", "name", "description", "startTime", "endTime", "isActive", "createdAt", "updatedAt")
    VALUES ($id, $tenantId, $name, $description, $startTime, $endTime, $isActive, $createdAt, $updatedAt)
  `);
  const insertPayment = db.prepare(`
    INSERT INTO "Payment" (
      "id", "amount", "status", "tenantId", "membershipId", "collectorId", "subscriptionId",
      "chargeId", "description", "note", "paidAt", "validFrom", "validUntil", "createdAt", "updatedAt"
    ) VALUES (
      $id, $amount, $status, $tenantId, $membershipId, $collectorId, $subscriptionId,
      $chargeId, $description, $note, $paidAt, $validFrom, $validUntil, $createdAt, $updatedAt
    )
  `);
  const insertProduct = db.prepare(`
    INSERT INTO "Product" (
      "id", "name", "description", "markdown", "photos", "category", "price",
      "stock", "minOrderQty", "maxOrderQty", "isActive", "createdAt", "updatedAt"
    ) VALUES (
      $id, $name, $description, $markdown, $photos, $category, $price,
      $stock, $minOrderQty, $maxOrderQty, $isActive, $createdAt, $updatedAt
    )
  `);
  const updateProductStock = db.prepare(
    'UPDATE "Product" SET "stock" = $stock, "updatedAt" = $updatedAt WHERE "id" = $id'
  );
  const insertOrder = db.prepare(`
    INSERT INTO "Order" (
      "id", "userId", "buyerName", "buyerEmail", "buyerPhone", "buyerAddress",
      "status", "subtotalAmount", "gstRatePct", "gstAmount", "totalAmount", "createdAt", "updatedAt"
    ) VALUES (
      $id, $userId, $buyerName, $buyerEmail, $buyerPhone, $buyerAddress,
      $status, $subtotalAmount, $gstRatePct, $gstAmount, $totalAmount, $createdAt, $updatedAt
    )
  `);
  const insertOrderItem = db.prepare(`
    INSERT INTO "OrderItem" ("id", "orderId", "productId", "productName", "quantity", "unitPrice", "lineTotal", "createdAt")
    VALUES ($id, $orderId, $productId, $productName, $quantity, $unitPrice, $lineTotal, $createdAt)
  `);
  const insertWorkoutPlan = db.prepare(`
    INSERT INTO "WorkoutPlan" ("id", "tenantId", "creatorId", "title", "description", "exercises", "createdAt", "updatedAt")
    VALUES ($id, $tenantId, $creatorId, $title, $description, $exercises, $createdAt, $updatedAt)
  `);
  const insertWorkoutPlanAssignment = db.prepare(`
    INSERT INTO "WorkoutPlanAssignment" ("id", "planId", "membershipId", "assignedAt")
    VALUES ($id, $planId, $membershipId, $assignedAt)
  `);
  const insertBadge = db.prepare(`
    INSERT INTO "Badge" ("id", "tenantId", "name", "description", "color", "icon", "isActive", "createdAt", "updatedAt")
    VALUES ($id, $tenantId, $name, $description, $color, $icon, $isActive, $createdAt, $updatedAt)
  `);
  const insertBadgeAssignment = db.prepare(`
    INSERT INTO "_BadgeToTenantMembership" ("A", "B")
    VALUES ($badgeId, $membershipId)
  `);
  const insertAttendance = db.prepare(`
    INSERT INTO "Attendance" ("id", "tenantId", "membershipId", "markedById", "date", "checkInAt", "note", "createdAt")
    VALUES ($id, $tenantId, $membershipId, $markedById, $date, $checkInAt, $note, $createdAt)
  `);
  const insertAuditLog = db.prepare(`
    INSERT INTO "AuditLog" ("id", "action", "entity", "entityId", "actorId", "tenantId", "metadata", "ipAddress", "createdAt")
    VALUES ($id, $action, $entity, $entityId, $actorId, $tenantId, $metadata, $ipAddress, $createdAt)
  `);
  const insertPlatformPayment = db.prepare(`
    INSERT INTO "PlatformPayment" ("id", "tenantId", "amount", "note", "extendsUntil", "recordedBy", "createdAt")
    VALUES ($id, $tenantId, $amount, $note, $extendsUntil, $recordedBy, $createdAt)
  `);

  const now = new Date();
  const passwordHash = bcrypt.hashSync(options.password, 10);
  const counts = {
    users: 0,
    tenants: 0,
    shifts: 0,
    memberships: 0,
    badges: 0,
    badgeAssignments: 0,
    payments: 0,
    products: 0,
    orders: 0,
    orderItems: 0,
    workoutPlans: 0,
    assignments: 0,
    attendance: 0,
    auditLogs: 0,
  };
  const users = [];
  const products = [];
  const tenantAdmins = [];
  const normalizeSqlValue = (value) => (typeof value === "boolean" ? Number(value) : value);
  const run = (statement, params, key) => {
    const normalized = Array.isArray(params)
      ? params.map(normalizeSqlValue)
      : Object.fromEntries(
        Object.entries(params).map(([entryKey, entryValue]) => [entryKey, normalizeSqlValue(entryValue)])
      );
    statement.run(normalized);
    if (key) {
      counts[key] += 1;
    }
  };

  function createUser(name, email, platformRole = "USER") {
    const createdAt = iso(daysAgo(now, randomInt(3, 320, random), randomInt(8, 18, random), 0));
    const user = {
      id: nextId("user"),
      name,
      email,
      phone: nextPhone(),
      passwordHash,
      avatarUrl: null,
      platformRole,
      status: "ACTIVE",
      createdAt,
      updatedAt: createdAt,
    };
    run(insertUser, user, "users");
    users.push(user);
    return user;
  }

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  let superAdmin;
  let supportUser;
  try {
    superAdmin = createUser("Seed Super Admin", "superadmin@seed.gym.test", "SUPER_ADMIN");
    supportUser = createUser("Seed Support User", "support@seed.gym.test", "SUPPORT");

    for (let tenantIndex = 1; tenantIndex <= options.tenants; tenantIndex += 1) {
      const tenantName = `Seed Gym ${tenantIndex}`;
      const slug = slugify(tenantName);
      const tenantId = nextId("tenant");
      const createdAt = iso(daysAgo(now, randomInt(90, 540, random), 9, 0));

      run(
        insertTenant,
        {
          id: tenantId,
          name: tenantName,
          slug,
          email: `${slug}@seed.gym.test`,
          phone: nextPhone(),
          logoUrl: null,
          address: `${100 + tenantIndex} Test Street, City ${tenantIndex}`,
          estd: iso(daysAgo(now, 1200 + tenantIndex * 30, 0, 0)),
          status: "ACTIVE",
          createdAt,
          updatedAt: createdAt,
          markdown: `# ${tenantName}\n\nSeeded tenant.`,
          description: `Seeded tenant ${tenantIndex}`,
          platformExpiresAt: iso(addDays(now, 180 + tenantIndex * 15)),
        },
        "tenants"
      );
      run(insertTenantSettings, {
        id: nextId("tenant_settings"),
        tenantId,
        overdueDays: 30,
        createdAt,
        updatedAt: createdAt,
      });

      const adminUser = createUser(`Seed Admin ${tenantIndex}`, `admin.${slug}@seed.gym.test`);
      tenantAdmins.push(adminUser);
      const adminMembership = {
        id: nextId("membership"),
        tenantId,
        userId: adminUser.id,
        memberId: 1,
        role: "ADMIN",
        status: "ACTIVE",
        dueDate: null,
        joinedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      };
      run(insertTenantMembership, adminMembership, "memberships");

      const charges = [
        ["Admission Fee", 999, true],
        ["Security Deposit", 500, true],
        ["Locker Rental", 299, false],
      ].map(([name, amount, isMandatory]) => {
        const charge = {
          id: nextId("charge"),
          tenantId,
          name,
          amount,
          isMandatory,
          isActive: true,
          createdAt,
          updatedAt: createdAt,
        };
        run(insertTenantCharge, charge);
        return charge;
      });

      const subscriptions = [
        ["Monthly", 1499, 30],
        ["Quarterly", 3899, 90],
        ["Annual", 13999, 365],
      ].map(([title, amount, durationDays]) => {
        const subscription = {
          id: nextId("subscription"),
          tenantId,
          title,
          description: `${title} seeded plan`,
          amount,
          durationDays,
          isActive: true,
          createdAt,
          updatedAt: createdAt,
        };
        run(insertSubscription, subscription);
        return subscription;
      });

      for (const [name, description, startTime, endTime, isActive] of [
        ["Morning Shift", "Early training window for before-work members.", "06:00", "10:00", true],
        ["Afternoon Shift", "Midday slot with lighter floor traffic.", "12:00", "16:00", tenantIndex % 2 === 0],
        ["Evening Shift", "Peak post-work training slot.", "17:00", "22:00", true],
      ]) {
        run(
          insertShift,
          {
            id: nextId("shift"),
            tenantId,
            name,
            description,
            startTime,
            endTime,
            isActive,
            createdAt,
            updatedAt: createdAt,
          },
          "shifts"
        );
      }

      const coachMemberships = [];
      let nextMemberId = 2;
      for (let coachIndex = 1; coachIndex <= options.coachesPerTenant; coachIndex += 1) {
        const coachUser = createUser(
          `Seed Coach ${tenantIndex}-${coachIndex}`,
          `coach.${coachIndex}.${slug}@seed.gym.test`
        );
        const coachCreatedAt = iso(daysAgo(now, randomInt(20, 220, random), 7, 30));
        const membership = {
          id: nextId("membership"),
          tenantId,
          userId: coachUser.id,
          memberId: nextMemberId,
          role: "COACH",
          status: "ACTIVE",
          dueDate: null,
          joinedAt: coachCreatedAt,
          createdAt: coachCreatedAt,
          updatedAt: coachCreatedAt,
        };
        run(insertTenantMembership, membership, "memberships");
        coachMemberships.push(membership);
        nextMemberId += 1;
      }

      run(insertPlatformPayment, {
        id: nextId("platform_payment"),
        tenantId,
        amount: 9999,
        note: "Seeded platform billing",
        extendsUntil: iso(addDays(now, 180)),
        recordedBy: superAdmin.id,
        createdAt: iso(daysAgo(now, randomInt(10, 120, random), 10, 0)),
      });

      const activeMembers = [];
      for (let memberIndex = 1; memberIndex <= options.membersPerTenant; memberIndex += 1) {
        const memberUser = createUser(
          `Seed Member ${tenantIndex}-${memberIndex}`,
          `member.${memberIndex}.${slug}@seed.gym.test`
        );
        const joinedAt = daysAgo(now, randomInt(5, 360, random), 7, 15);
        const subscription = pick(subscriptions, random);
        const startAt =
          random() < 0.25
            ? daysAgo(now, randomInt(subscription.durationDays + 20, 220, random), 8, 0)
            : daysAgo(now, randomInt(0, Math.max(subscription.durationDays - 3, 1), random), 8, 0);
        const dueDate = addDays(startAt, subscription.durationDays);
        const status = dueDate < now && random() < 0.65 ? "SUSPENDED" : "ACTIVE";
        const membership = {
          id: nextId("membership"),
          tenantId,
          userId: memberUser.id,
          memberId: nextMemberId,
          role: "MEMBER",
          status,
          dueDate: iso(dueDate),
          joinedAt: iso(joinedAt),
          createdAt: iso(joinedAt),
          updatedAt: iso(joinedAt),
        };
        run(insertTenantMembership, membership, "memberships");
        if (status === "ACTIVE") {
          activeMembers.push(membership);
        }
        nextMemberId += 1;

        const collectorId = pick(
          [adminMembership.id, ...coachMemberships.map((membership) => membership.id)],
          random
        );
        run(
          insertPayment,
          {
            id: nextId("payment"),
            amount: charges[0].amount,
            status: "COMPLETED",
            tenantId,
            membershipId: membership.id,
            collectorId,
            subscriptionId: null,
            chargeId: charges[0].id,
            description: charges[0].name,
            note: "Seeded joining charge",
            paidAt: iso(joinedAt),
            validFrom: null,
            validUntil: null,
            createdAt: iso(joinedAt),
            updatedAt: iso(joinedAt),
          },
          "payments"
        );
        run(
          insertPayment,
          {
            id: nextId("payment"),
            amount: subscription.amount,
            status: "COMPLETED",
            tenantId,
            membershipId: membership.id,
            collectorId,
            subscriptionId: subscription.id,
            chargeId: null,
            description: `${subscription.title} plan`,
            note: "Seeded membership cycle",
            paidAt: iso(startAt),
            validFrom: iso(startAt),
            validUntil: iso(dueDate),
            createdAt: iso(startAt),
            updatedAt: iso(startAt),
          },
          "payments"
        );
        if (status !== "ACTIVE" || random() < 0.18) {
          const renewalAt = addDays(dueDate, 1);
          run(
            insertPayment,
            {
              id: nextId("payment"),
              amount: subscription.amount,
              status: random() < 0.2 ? "FAILED" : "PENDING",
              tenantId,
              membershipId: membership.id,
              collectorId,
              subscriptionId: subscription.id,
              chargeId: null,
              description: `${subscription.title} renewal`,
              note: "Seeded renewal pipeline",
              paidAt: null,
              validFrom: iso(renewalAt),
              validUntil: iso(addDays(renewalAt, subscription.durationDays)),
              createdAt: iso(renewalAt),
              updatedAt: iso(renewalAt),
            },
            "payments"
          );
        }
      }

      const badgeCatalog = [
        {
          name: "Consistency Streak",
          description: "Recognizes members who keep showing up week after week.",
          color: "#0f766e",
          icon: "calendar-check",
          isActive: true,
        },
        {
          name: "Early Bird",
          description: "Awarded to members who own the morning shift.",
          color: "#f59e0b",
          icon: "sunrise",
          isActive: true,
        },
        {
          name: "Strength PR",
          description: "Celebrates a major personal record or lifting milestone.",
          color: "#dc2626",
          icon: "dumbbell",
          isActive: true,
        },
        {
          name: "Transformation",
          description: "Highlights visible progress built through long-term discipline.",
          color: "#7c3aed",
          icon: "sparkles",
          isActive: true,
        },
        {
          name: "Coach's Choice",
          description: "Given to members who bring exceptional effort and attitude.",
          color: "#2563eb",
          icon: "star",
          isActive: true,
        },
      ].map((definition) => {
        const badgeCreatedAt = iso(daysAgo(now, randomInt(0, 120, random), 9, 30));
        const badge = {
          id: nextId("badge"),
          tenantId,
          ...definition,
          createdAt: badgeCreatedAt,
          updatedAt: badgeCreatedAt,
        };
        run(insertBadge, badge, "badges");
        return badge;
      });

      const badgeRecipients = [
        { badgeId: badgeCatalog[0].id, members: sample(activeMembers, Math.min(6, activeMembers.length), random) },
        {
          badgeId: badgeCatalog[1].id,
          members: sample(activeMembers.filter((membership) => membership.memberId % 2 === 0), 4, random),
        },
        {
          badgeId: badgeCatalog[2].id,
          members: sample([...coachMemberships, ...activeMembers], Math.min(4, coachMemberships.length + activeMembers.length), random),
        },
        { badgeId: badgeCatalog[3].id, members: sample(activeMembers.slice().reverse(), Math.min(3, activeMembers.length), random) },
        {
          badgeId: badgeCatalog[4].id,
          members: sample([adminMembership, ...activeMembers], Math.min(3, activeMembers.length + 1), random),
        },
      ];
      const badgeAssignmentPairs = new Set();
      for (const badgeAssignment of badgeRecipients) {
        for (const membership of badgeAssignment.members) {
          const key = `${badgeAssignment.badgeId}:${membership.id}`;
          if (badgeAssignmentPairs.has(key)) {
            continue;
          }
          badgeAssignmentPairs.add(key);
          run(
            insertBadgeAssignment,
            {
              badgeId: badgeAssignment.badgeId,
              membershipId: membership.id,
            },
            "badgeAssignments"
          );
        }
      }

      for (let planIndex = 1; planIndex <= 4; planIndex += 1) {
        const planId = nextId("workout_plan");
        const planCreatedAt = iso(daysAgo(now, randomInt(0, 120, random), 6, 45));
        run(
          insertWorkoutPlan,
          {
            id: planId,
            tenantId,
            creatorId: pick(
              [adminMembership.id, ...coachMemberships.map((membership) => membership.id)],
              random
            ),
            title: `Seed Plan ${tenantIndex}-${planIndex}`,
            description: `Seeded workout plan ${planIndex}`,
            exercises: JSON.stringify([
              { exercise: "Back Squat", sets: 5, reps: "5" },
              { exercise: "Bench Press", sets: 4, reps: "8" },
              { exercise: "Lat Pulldown", sets: 4, reps: "12" },
            ]),
            createdAt: planCreatedAt,
            updatedAt: planCreatedAt,
          },
          "workoutPlans"
        );

        for (const membership of sample(activeMembers, Math.min(8, activeMembers.length), random)) {
          run(
            insertWorkoutPlanAssignment,
            {
              id: nextId("workout_assignment"),
              planId,
              membershipId: membership.id,
              assignedAt: iso(daysAgo(now, randomInt(0, 45, random), 8, 0)),
            },
            "assignments"
          );
        }
      }

      const attendanceOffsets = Array.from({ length: options.attendanceDays }, (_, index) => index);
      for (const membership of activeMembers) {
        for (const offset of sample(attendanceOffsets, Math.min(16, attendanceOffsets.length), random)) {
          const date = daysAgo(now, offset, 0, 0);
          const checkInAt = daysAgo(now, offset, randomInt(5, 20, random), randomInt(0, 59, random));
          run(
            insertAttendance,
            {
              id: nextId("attendance"),
              tenantId,
              membershipId: membership.id,
              markedById: random() < 0.55 ? null : adminMembership.id,
              date: iso(date),
              checkInAt: iso(checkInAt),
              note: null,
              createdAt: iso(checkInAt),
            },
            "attendance"
          );
        }
      }

      for (let logIndex = 1; logIndex <= 10; logIndex += 1) {
        run(
          insertAuditLog,
          {
            id: nextId("audit"),
            action: pick(["CREATE", "UPDATE", "LOGIN", "SETTINGS_CHANGE", "ROLE_CHANGE"], random),
            entity: pick(["Tenant", "TenantMembership", "Payment", "WorkoutPlan"], random),
            entityId: nextId("entity"),
            actorId: adminUser.id,
            tenantId,
            metadata: JSON.stringify({ seeded: true, tenantIndex, logIndex }),
            ipAddress: `10.${tenantIndex}.${logIndex}.1`,
            createdAt: iso(daysAgo(now, randomInt(0, 60, random), randomInt(8, 20, random), 0)),
          },
          "auditLogs"
        );
      }
    }

    const categories = ["Supplements", "Apparel", "Accessories", "Equipment"];
    for (let index = 1; index <= options.products; index += 1) {
      const category = categories[(index - 1) % categories.length];
      const product = {
        id: nextId("product"),
        name: `${category} Product ${index}`,
        description: `Seeded ${category.toLowerCase()} item ${index}`,
        markdown: `## Seed Product ${index}`,
        photos: JSON.stringify([`https://placehold.co/800x800/png?text=Product+${index}`]),
        category,
        price: 299 + index * 25,
        stock: 40 + (index % 15) * 5,
        minOrderQty: 1,
        maxOrderQty: 4,
        isActive: true,
        createdAt: iso(daysAgo(now, randomInt(5, 180, random), 10, 0)),
        updatedAt: iso(daysAgo(now, randomInt(0, 10, random), 10, 0)),
      };
      run(insertProduct, product, "products");
      products.push(product);
    }

    for (let orderIndex = 1; orderIndex <= options.orders; orderIndex += 1) {
      const orderProducts = sample(
        products.filter((product) => product.stock > 0),
        randomInt(1, 3, random),
        random
      );
      if (orderProducts.length === 0) {
        break;
      }
      const items = [];
      let subtotalAmount = 0;
      for (const product of orderProducts) {
        const quantity = Math.min(product.stock, randomInt(1, product.maxOrderQty, random));
        if (quantity <= 0) {
          continue;
        }
        product.stock -= quantity;
        items.push({
          id: nextId("order_item"),
          productId: product.id,
          productName: product.name,
          quantity,
          unitPrice: product.price,
          lineTotal: quantity * product.price,
        });
        subtotalAmount += quantity * product.price;
      }
      if (items.length === 0) {
        continue;
      }
      const customer = pick(users, random);
      const createdAt = daysAgo(now, randomInt(0, 120, random), randomInt(9, 20, random), 0);
      const orderId = nextId("order");
      const gstAmount = Math.round(subtotalAmount * 0.18);
      run(
        insertOrder,
        {
          id: orderId,
          userId: customer.id,
          buyerName: customer.name,
          buyerEmail: customer.email,
          buyerPhone: customer.phone,
          buyerAddress: `${randomInt(10, 400, random)} Seed Lane`,
          status: pick(["PENDING", "SHIPPED", "DELIVERED"], random),
          subtotalAmount,
          gstRatePct: 18,
          gstAmount,
          totalAmount: subtotalAmount + gstAmount,
          createdAt: iso(createdAt),
          updatedAt: iso(createdAt),
        },
        "orders"
      );
      for (const item of items) {
        run(insertOrderItem, { ...item, orderId, createdAt: iso(createdAt) }, "orderItems");
      }
    }

    for (const product of products) {
      updateProductStock.run({ id: product.id, stock: product.stock, updatedAt: iso(now) });
    }

    for (let index = 1; index <= 12; index += 1) {
      run(
        insertAuditLog,
        {
          id: nextId("audit"),
          action: pick(["CREATE", "UPDATE", "LOGIN", "SETTINGS_CHANGE", "ROLE_CHANGE"], random),
          entity: pick(["Tenant", "User", "Product", "Order"], random),
          entityId: nextId("platform_entity"),
          actorId: index % 2 === 0 ? supportUser.id : superAdmin.id,
          tenantId: null,
          metadata: JSON.stringify({ seeded: true, platform: true }),
          ipAddress: `172.16.0.${index}`,
          createdAt: iso(daysAgo(now, randomInt(0, 30, random), randomInt(8, 19, random), 0)),
        },
        "auditLogs"
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    counts,
    tenantAdmins,
    superAdmin,
    supportUser,
    password: options.password,
  };
}

/**
 * Support the `escape identifier` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function escapeIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/**
 * Support the `sql literal` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function sqlLiteral(value) {
  if (value === null) {
    return "NULL";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Support the `dump table inserts` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function dumpTableInserts(db, tableName) {
  const columns = db
    .prepare(`PRAGMA table_info(${sqlLiteral(tableName)})`)
    .all()
    .map((column) => column.name);
  if (columns.length === 0) {
    return [];
  }

  const rows = db.prepare(`SELECT * FROM ${escapeIdentifier(tableName)}`).all();
  if (rows.length === 0) {
    return [];
  }

  const columnList = columns.map(escapeIdentifier).join(", ");
  return rows.map((row) => {
    const values = columns.map((column) => sqlLiteral(row[column])).join(", ");
    return `INSERT INTO ${escapeIdentifier(tableName)} (${columnList}) VALUES (${values});`;
  });
}

/**
 * Support the `compare table names` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function compareTableNames(left, right) {
  const leftPriority = TABLE_DUMP_PRIORITY.get(left) ?? Number.MAX_SAFE_INTEGER;
  const rightPriority = TABLE_DUMP_PRIORITY.get(right) ?? Number.MAX_SAFE_INTEGER;

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return left.localeCompare(right);
}

/**
 * Support the `order tables for dump` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function orderTablesForDump(db, tableNames) {
  const tables = new Set(tableNames);
  const remaining = new Set(tableNames);
  const dependencies = new Map(
    tableNames.map((tableName) => [
      tableName,
      new Set(
        db
          .prepare(`PRAGMA foreign_key_list(${sqlLiteral(tableName)})`)
          .all()
          .map((row) => row.table)
          .filter((dependencyName) => dependencyName !== tableName && tables.has(dependencyName))
      ),
    ])
  );
  const orderedTables = [];

  while (remaining.size > 0) {
    const readyTables = [...remaining]
      .filter((tableName) => {
        for (const dependencyName of dependencies.get(tableName) ?? []) {
          if (remaining.has(dependencyName)) {
            return false;
          }
        }

        return true;
      })
      .sort(compareTableNames);

    if (readyTables.length === 0) {
      orderedTables.push(...[...remaining].sort(compareTableNames));
      break;
    }

    const [nextTable] = readyTables;
    orderedTables.push(nextTable);
    remaining.delete(nextTable);
  }

  return orderedTables;
}

/**
 * Support the `build seed sql` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function buildSeedSql(db) {
  const tables = new Set(
    db
      .prepare(`
        SELECT "name"
        FROM "sqlite_master"
        WHERE "type" = 'table'
          AND "name" NOT LIKE 'sqlite_%'
          AND "name" NOT IN ('_cf_METADATA', 'd1_migrations')
      `)
      .all()
      .map((row) => row.name)
  );
  const orderedTables = orderTablesForDump(db, [...tables]);
  const deleteStatements = [...orderedTables]
    .reverse()
    .map((tableName) => `DELETE FROM ${escapeIdentifier(tableName)};`);
  const insertStatements = [];

  for (const tableName of orderedTables) {
    insertStatements.push(...dumpTableInserts(db, tableName));
  }

  return [
    "-- Generated by ensure-prisma-client.mjs",
    ...deleteStatements,
    ...insertStatements,
    "",
  ].join("\n");
}

/**
 * Support the `parse wrangler d1 config` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function parseWranglerD1Config() {
  if (!existsSync(wranglerConfigPath)) {
    throw new Error("wrangler.toml was not found. Local D1 seeding requires Wrangler config.");
  }

  const lines = readFileSync(wranglerConfigPath, "utf8").split(/\r?\n/);
  const entries = [];
  let current = null;

  const flushCurrent = () => {
    if (current) {
      entries.push(current);
      current = null;
    }
  };

  for (const line of lines) {
    if (/^\s*\[\[d1_databases\]\]\s*$/.test(line)) {
      flushCurrent();
      current = {
        binding: undefined,
        databaseName: undefined,
        databaseId: undefined,
        previewDatabaseId: undefined,
      };
      continue;
    }

    if (/^\s*\[\[.+\]\]\s*$/.test(line)) {
      flushCurrent();
      continue;
    }

    if (!current) {
      continue;
    }

    const bindingMatch = line.match(/^\s*binding\s*=\s*"([^"]+)"/);
    if (bindingMatch) {
      current.binding = bindingMatch[1];
      continue;
    }

    const databaseNameMatch = line.match(/^\s*database_name\s*=\s*"([^"]+)"/);
    if (databaseNameMatch) {
      current.databaseName = databaseNameMatch[1];
      continue;
    }

    const databaseIdMatch = line.match(/^\s*database_id\s*=\s*"([^"]+)"/);
    if (databaseIdMatch) {
      current.databaseId = databaseIdMatch[1];
      continue;
    }

    const previewDatabaseIdMatch = line.match(/^\s*preview_database_id\s*=\s*"([^"]+)"/);
    if (previewDatabaseIdMatch) {
      current.previewDatabaseId = previewDatabaseIdMatch[1];
    }
  }

  flushCurrent();
  return entries.filter((entry) => entry.binding);
}

/**
 * Support the `durable object namespace id from name` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function durableObjectNamespaceIdFromName(uniqueKey, name) {
  const key = createHash("sha256").update(uniqueKey).digest();
  const nameHmac = createHmac("sha256", key).update(name).digest().subarray(0, 16);
  const hmac = createHmac("sha256", key).update(nameHmac).digest().subarray(0, 16);
  return Buffer.concat([nameHmac, hmac]).toString("hex");
}

/**
 * Support the `resolve local database targets` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function resolveLocalDatabaseTargets(cliValue) {
  const entries = parseWranglerD1Config();
  if (entries.length === 0) {
    throw new Error("No [[d1_databases]] entries were found in wrangler.toml.");
  }

  const matches = cliValue
    ? entries.filter((entry) => entry.databaseName === cliValue || entry.binding === cliValue)
    : entries;

  if (matches.length === 0) {
    throw new Error(
      `Could not find a local D1 binding matching "${cliValue}" in wrangler.toml.`
    );
  }

  return matches.map((entry) => {
    const namespace = entry.previewDatabaseId ?? entry.databaseId ?? entry.binding;
    const durableObjectId = durableObjectNamespaceIdFromName(MINIFLARE_D1_UNIQUE_KEY, namespace);
    return {
      binding: entry.binding,
      databaseName: entry.databaseName ?? entry.binding,
      namespace,
      path: path.join(localD1Path, `${durableObjectId}.sqlite`),
    };
  });
}

/**
 * Support the `resolve remote database name` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function resolveRemoteDatabaseName(cliValue) {
  if (cliValue) {
    return cliValue;
  }

  const config = readFileSync(wranglerConfigPath, "utf8");
  const match = config.match(/^\s*database_name\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error('Could not find `database_name` in wrangler.toml. Pass `--database=<name>`.');
  }
  return match[1];
}

/**
 * Support the `ensure wrangler installed` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function ensureWranglerInstalled() {
  if (!existsSync(wranglerBin) || !existsSync(wranglerCliPath)) {
    throw new Error("Wrangler CLI not found. Run `npm install` first.");
  }
}

/**
 * Support the `run cli` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function runCli(cliPath, fallbackBinPath, args) {
  const command = existsSync(cliPath) ? process.execPath : fallbackBinPath;
  const commandArgs = existsSync(cliPath) ? [cliPath, ...args] : args;

  return spawnSync(command, commandArgs, {
    cwd: rootDir,
    stdio: "inherit",
  });
}

/**
 * Support the `print summary` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function printSummary(summary, metadata = {}) {
  console.log(
    JSON.stringify(
      {
        ...metadata,
        ...summary.counts,
      },
      null,
      2
    )
  );
  console.log("");
  console.log("Seeded credentials:");
  console.log(`- Super admin: ${summary.superAdmin.email}`);
  console.log(`- Support: ${summary.supportUser.email}`);
  if (summary.tenantAdmins[0]) {
    console.log(`- First tenant admin: ${summary.tenantAdmins[0].email}`);
  }
  console.log(`- Shared password: ${summary.password}`);
}

/**
 * Support the `seed local` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function seedLocal(argv) {
  const options = parseSeedOptions(argv);
  const migrations = listMigrationFiles();
  if (migrations.length === 0) {
    throw new Error("No SQL migrations were found in prisma/migrations.");
  }

  const targets = resolveLocalDatabaseTargets(options.database);
  mkdirSync(localD1Path, { recursive: true });

  let summary;
  for (const target of targets) {
    const db = new DatabaseSync(target.path);
    resetDatabase(db, migrations);
    summary = seedDatabase(db, options);
  }

  console.log("Local D1 database rebuilt and seeded.");
  printSummary(summary, {
    databases: targets.map((target) => ({
      binding: target.binding,
      databaseName: target.databaseName,
      namespace: target.namespace,
      path: target.path,
    })),
    migrations: migrations.map((item) => item.name),
  });
}

/**
 * Support the `seed remote` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function seedRemote(argv) {
  const options = parseSeedOptions(argv);
  const migrations = listMigrationFiles();
  if (migrations.length === 0) {
    throw new Error("No SQL migrations were found in prisma/migrations.");
  }

  const db = new DatabaseSync(":memory:");
  resetDatabase(db, migrations);
  const summary = seedDatabase(db, options);
  const sql = buildSeedSql(db);

  mkdirSync(path.dirname(options.outFile), { recursive: true });
  writeFileSync(options.outFile, sql, "utf8");

  const metadata = {
    sqlFile: options.outFile,
    migrations: migrations.map((item) => item.name),
  };

  if (options.noExecute) {
    console.log(`Remote seed SQL written to ${options.outFile}`);
    printSummary(summary, metadata);
    return;
  }

  ensureWranglerInstalled();
  const databaseName = resolveRemoteDatabaseName(options.database);
  console.log(`Executing remote seed against D1 database "${databaseName}"...`);

  const result = runCli(wranglerCliPath, wranglerBin, [
    "d1",
    "execute",
    databaseName,
    "--remote",
    "--file",
    options.outFile,
  ]);

  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }

  printSummary(summary, {
    ...metadata,
    database: databaseName,
  });
}

/**
 * Support the `main` step in the Prisma maintenance script.
 * Breaking the CLI workflow into helpers keeps client generation and deterministic seeding easier to maintain.
 */
function main() {
  const command = process.argv[2];

  if (command === "seed-local") {
    seedLocal(process.argv.slice(3));
    return;
  }

  if (command === "seed-remote") {
    seedRemote(process.argv.slice(3));
    return;
  }

  ensurePrismaClient();
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
