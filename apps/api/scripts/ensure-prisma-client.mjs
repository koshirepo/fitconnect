import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import bcrypt from "bcryptjs";
import { listLocalDatabases } from "@prisma/adapter-d1";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const schemaPath = path.join(rootDir, "prisma", "schema.prisma");
const clientPath = path.join(rootDir, "src", "generated", "prisma", "client.ts");
const prismaBin = path.join(
  rootDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma"
);
const DEFAULT_SEED_OPTIONS = {
  seed: 20260327,
  tenants: 6,
  coachesPerTenant: 2,
  membersPerTenant: 24,
  products: 32,
  orders: 140,
  attendanceDays: 45,
  password: "Test@1234",
};
const ID_COUNTERS = new Map();
let phoneCounter = 9000000000;

function shouldGenerate() {
  if (!existsSync(clientPath)) {
    return true;
  }

  return statSync(schemaPath).mtimeMs > statSync(clientPath).mtimeMs;
}

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

  const result = spawnSync(prismaBin, ["generate"], {
    cwd: rootDir,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

function parseSeedOptions(argv) {
  const options = { ...DEFAULT_SEED_OPTIONS };
  const keys = {
    seed: "seed",
    tenants: "tenants",
    "coaches-per-tenant": "coachesPerTenant",
    "members-per-tenant": "membersPerTenant",
    products: "products",
    orders: "orders",
    "attendance-days": "attendanceDays",
    password: "password",
  };

  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      throw new Error(`Unsupported argument: ${arg}`);
    }

    const [rawKey, rawValue] = arg.slice(2).split("=");
    const key = keys[rawKey];
    if (!key) {
      throw new Error(`Unknown option: --${rawKey}`);
    }

    if (key === "password") {
      options.password = rawValue ?? DEFAULT_SEED_OPTIONS.password;
      continue;
    }

    const value = Number.parseInt(rawValue ?? "", 10);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Expected a positive integer for --${rawKey}`);
    }

    options[key] = value;
  }

  return options;
}

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

function nextId(prefix) {
  const value = (ID_COUNTERS.get(prefix) ?? 0) + 1;
  ID_COUNTERS.set(prefix, value);
  return `${prefix}_${String(value).padStart(4, "0")}`;
}

function nextPhone() {
  phoneCounter += 1;
  return String(phoneCounter);
}

function randomInt(min, max, random) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pick(values, random) {
  return values[Math.floor(random() * values.length)];
}

function sample(values, count, random) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

function daysAgo(baseDate, days, hour, minute) {
  const value = new Date(baseDate);
  value.setUTCDate(value.getUTCDate() - days);
  value.setUTCHours(hour, minute, 0, 0);
  return value;
}

function addDays(date, days) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

function iso(date) {
  return date.toISOString();
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

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

function seedLocal(argv) {
  const options = parseSeedOptions(argv);
  const random = createRng(options.seed);
  const dbPath = listLocalDatabases().at(-1);
  if (!dbPath) {
    throw new Error(
      "No local D1 database was found. Run `npm run dev` once so Wrangler creates `.wrangler/state` first.",
    );
  }

  const migrations = listMigrationFiles();
  if (migrations.length === 0) {
    throw new Error("No SQL migrations were found in prisma/migrations.");
  }

  const db = new DatabaseSync(dbPath);
  resetDatabase(db, migrations);

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
    memberships: 0,
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

  const superAdmin = createUser("Seed Super Admin", "superadmin@seed.gym.test", "SUPER_ADMIN");
  const supportUser = createUser("Seed Support User", "support@seed.gym.test", "SUPPORT");

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
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
        ["Admission Fee", 99900, true],
        ["Security Deposit", 50000, true],
        ["Locker Rental", 29900, false],
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
        ["Monthly", 149900, 30],
        ["Quarterly", 389900, 90],
        ["Annual", 1399900, 365],
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
        amount: 999900,
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
        price: 29900 + index * 2500,
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

  console.log("Local D1 database rebuilt and seeded.");
  console.log(
    JSON.stringify(
      {
        database: dbPath,
        migrations: migrations.map((item) => item.name),
        ...counts,
      },
      null,
      2
    )
  );
  console.log("");
  console.log("Seeded credentials:");
  console.log(`- Super admin: ${superAdmin.email}`);
  console.log(`- Support: ${supportUser.email}`);
  if (tenantAdmins[0]) {
    console.log(`- First tenant admin: ${tenantAdmins[0].email}`);
  }
  console.log(`- Shared password: ${options.password}`);
}

const command = process.argv[2];
if (command === "seed-local") {
  seedLocal(process.argv.slice(3));
} else {
  ensurePrismaClient();
}

