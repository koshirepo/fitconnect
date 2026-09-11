/**
 * Documentation: Store sales, purchase prices and membership renewals, for the books.
 *
 * - The finance screens split income by what paid for it and report what the store made. A seeded gym has a catalogue with no purchase prices and no sales — and, when its data was copied down part-way through a month, no membership payments this month either — so both cards read as empty. This fills all three.
 * - Purchase prices are written only onto variants that have none. A gym's own figures are never overwritten, and a re-run keeps whatever the first run chose.
 * - Every order line carries the selling and purchase price it had on the day, exactly as the app writes them. Supplements are written cheaper to sell and to buy in earlier months, so the catalogue's price today and the price on an older order visibly differ — which is precisely what the books must not confuse.
 * - Rows are the ones the app itself would have written. A member's sale has a payment and coin ledger entries; a walk-in's has neither; a reservation takes no money; a renewal stacks its window on the cover the member still holds, and the due date is recomputed from payments the way `refreshDueDate` does it. Stock is left alone: today's counts are what remains after these sales, not before them.
 * - Ids start `seedsales_` and exactly those rows are cleared first — due dates recomputed without them — so re-running resets its own data and leaves real sales and payments alone. The same gym gets the same sales on every run.
 * - Usage: `pnpm run seed:store-sales -- --tenant rudra-gym` (add `--remote` for production). Run `seed:store` first if the gym sells nothing yet.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(rootDir, "..", "..");

function resolveWranglerCli() {
  return [
    path.join(rootDir, "node_modules", "wrangler", "bin", "wrangler.js"),
    path.join(repoRoot, "node_modules", "wrangler", "bin", "wrangler.js"),
  ].find((candidate) => existsSync(candidate));
}

/** Doubling the single quote is the only escape a SQLite string literal needs. */
function q(value) {
  if (value === null || value === undefined) return "NULL";
  return "'" + String(value).replace(/'/g, "''") + "'";
}

/** Every row this script writes starts with this, and only those are ever cleared. */
const PREFIX = "seedsales_";

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Arguments ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const remote = argv.includes("--remote");
const tenantSlug = argv[argv.indexOf("--tenant") + 1];

if (!argv.includes("--tenant") || !tenantSlug || tenantSlug.startsWith("--")) {
  console.error("Usage: node scripts/seed-store-sales.mjs --tenant <slug> [--remote]");
  process.exit(1);
}

const wranglerCli = resolveWranglerCli();
if (!wranglerCli) {
  console.error("Wrangler CLI not found. Run `pnpm install` first.");
  process.exit(1);
}

function d1(command, { json = true } = {}) {
  const result = spawnSync(
    process.execPath,
    [
      wranglerCli,
      "d1",
      "execute",
      "fit-db",
      // Without this, wrangler only sees the top-level `[[d1_databases]]` block
      // and cannot find the database declared under `[env.production]`.
      "--env",
      "production",
      remote ? "--remote" : "--local",
      ...(json ? ["--json"] : []),
      ...command,
    ],
    { cwd: rootDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );

  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

function d1Rows(sql) {
  const out = d1(["--command", sql.replace(/\s+/g, " ")]);
  try {
    return JSON.parse(out.slice(out.indexOf("[")))?.[0]?.results ?? [];
  } catch {
    return [];
  }
}

// ─── Deterministic randomness ─────────────────────────────────────────────────

/**
 * A small seeded generator: mulberry32 over an FNV hash of the text.
 *
 * The same gym gets the same sales on every run, so "the whey sold fourteen
 * tubs in July" stays true between runs and can be checked against the screen.
 */
function seededRandom(seedText) {
  let hash = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The format Prisma's D1 adapter writes, so the app's date comparisons line up. */
function stamp(date) {
  return date.toISOString().replace("Z", "+00:00");
}

/**
 * Walk-ins. Deliberately unreal phone numbers: a seeded demo should never put a
 * stranger's actual number on a receipt.
 */
const GUESTS = [
  ["Arjun Mehta", "9000000101"],
  ["Priya Nair", "9000000102"],
  ["Rohan Gupta", "9000000103"],
  ["Sneha Patil", "9000000104"],
  ["Vikram Singh", "9000000105"],
  ["Ananya Rao", "9000000106"],
  ["Karan Malhotra", "9000000107"],
  ["Meera Iyer", "9000000108"],
  ["Aditya Joshi", "9000000109"],
  ["Pooja Sharma", "9000000110"],
];

// ─── What we are seeding into ─────────────────────────────────────────────────

const tenant = d1Rows(`SELECT "id", "name" FROM "Tenant" WHERE "slug" = ${q(tenantSlug)}`)[0];
if (!tenant) {
  console.error(
    'No gym found with slug "' + tenantSlug + '" in the ' + (remote ? "remote" : "local") + " database.",
  );
  process.exit(1);
}

const variants = d1Rows(
  `SELECT v."id", v."name", v."attributes", v."price", v."costPrice",
          p."name" AS "productName", p."category", p."coinsGranted"
   FROM "ProductVariant" v
   JOIN "Product" p ON p."id" = v."productId"
   WHERE p."tenantId" = ${q(tenant.id)} AND p."isActive" = 1 AND v."isActive" = 1
   ORDER BY p."name", v."createdAt"`,
);

if (variants.length === 0) {
  console.error(
    `"${tenantSlug}" sells nothing yet. Run \`pnpm run seed:store -- --tenant ${tenantSlug}\` first.`,
  );
  process.exit(1);
}

/** Who rings sales up. A gym with no staff still sells; the seller is simply unnamed. */
const staff = d1Rows(
  `SELECT "id", "userId" FROM "TenantMembership"
   WHERE "tenantId" = ${q(tenant.id)} AND "status" = 'ACTIVE' AND "role" IN ('ADMIN', 'COACH')
   ORDER BY "role", "memberId"`,
);

/**
 * Members who can buy, with the cover they held before anything this script
 * wrote.
 *
 * Read from payments rather than `dueDate`, which a previous run moved: stacking
 * a renewal on a date the last run invented would push members a month further
 * out every time the seeder ran.
 */
const members = d1Rows(
  `SELECT m."id", m."memberId",
     (SELECT MAX(p."validUntil") FROM "Payment" p
      WHERE p."membershipId" = m."id" AND p."status" = 'COMPLETED'
        AND p."validUntil" IS NOT NULL AND p."id" NOT LIKE '${PREFIX}%') AS "coverUntil",
     (SELECT p."subscriptionId" FROM "Payment" p
      WHERE p."membershipId" = m."id" AND p."status" = 'COMPLETED'
        AND p."subscriptionId" IS NOT NULL AND p."id" NOT LIKE '${PREFIX}%'
      ORDER BY p."validUntil" DESC LIMIT 1) AS "lastPlanId"
   FROM "TenantMembership" m
   WHERE m."tenantId" = ${q(tenant.id)} AND m."status" = 'ACTIVE' AND m."role" = 'MEMBER'
   ORDER BY m."memberId"`,
);

const plans = d1Rows(
  `SELECT "id", "title", "amount", "durationDays", "isActive" FROM "Subscription"
   WHERE "tenantId" = ${q(tenant.id)}`,
);

const rand = seededRandom("store-sales:" + tenant.id);
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pick = (list) => list[Math.floor(rand() * list.length)];

/** A Razorpay-shaped reference, recognisably fake. */
const gatewayRef = (kind) => `${kind}_seed${Math.floor(rand() * 1e12).toString(36)}`;

function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ─── Prices, then and now ─────────────────────────────────────────────────────

const now = new Date();

/**
 * A purchase price for a variant that has none: a believable share of what it
 * sells for, fixed per variant so every run lands on the same figure.
 *
 * Supplements run thin margins and accessories fat ones, which is roughly how a
 * gym's shelf works and is what makes the per-product table worth reading.
 */
function costFor(variant) {
  const spread = seededRandom("cost:" + variant.id)();
  const share =
    variant.category === "Supplements"
      ? 0.66 + spread * 0.08
      : variant.category === "Accessories"
        ? 0.4 + spread * 0.15
        : 0.55 + spread * 0.1;

  return Math.max(10, Math.round((Number(variant.price) * share) / 10) * 10);
}

/**
 * What supplements sold for and cost, as a share of today's figures, by months
 * back. The supplier put their rate up twice and the gym passed some of it on,
 * so older order lines carry lower numbers than the catalogue shows now.
 * Accessories held their price throughout.
 */
const SUPPLEMENT_HISTORY = [
  { price: 1, cost: 1 },
  { price: 0.97, cost: 0.95 },
  { price: 0.94, cost: 0.9 },
];

function pricesAt(variant, monthsAgo) {
  const price = Number(variant.price);
  const cost = costs.get(variant.id);
  if (variant.category !== "Supplements" || monthsAgo === 0) {
    return { unitPrice: price, unitCost: cost };
  }

  const step = SUPPLEMENT_HISTORY[monthsAgo];
  // Keep the shelf's ₹…9 endings, so an old price reads like one a gym charged.
  const unitPrice = String(price).endsWith("9")
    ? Math.max(9, Math.round((price * step.price) / 10) * 10 - 1)
    : Math.round(price * step.price);

  return { unitPrice, unitCost: Math.max(10, Math.round((cost * step.cost) / 10) * 10) };
}

/**
 * Two full months and this one so far. The counts are a small gym's counter,
 * and this month's is in proportion to the days gone.
 */
const MONTHS = [2, 1, 0].map((monthsAgo) => {
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const daysInMonth = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const lastDay = monthsAgo === 0 ? now.getUTCDate() : daysInMonth;

  return {
    monthsAgo,
    first,
    lastDay,
    key: stamp(first).slice(0, 7),
    orders:
      monthsAgo === 0
        ? Math.max(4, Math.round((30 * lastDay) / daysInMonth))
        : monthsAgo === 1
          ? 30
          : 24,
  };
});

/** A moment during opening hours in the month, never in the future. */
function momentIn(month) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const at = new Date(
      Date.UTC(
        month.first.getUTCFullYear(),
        month.first.getUTCMonth(),
        between(1, month.lastDay),
        // 01:00–16:59 UTC is roughly 06:30–22:30 in India, when a desk is open.
        between(1, 16),
        between(0, 59),
        between(0, 59),
      ),
    );
    if (at < now) return at;
  }
  return new Date(now.getTime() - 60 * 1000);
}

/** One to three different things, priced as they stood that month. */
function basket(monthsAgo) {
  const size = rand() < 0.6 ? 1 : rand() < 0.75 ? 2 : 3;
  const lines = [];
  const taken = new Set();

  while (lines.length < Math.min(size, variants.length)) {
    const variant = pick(variants);
    if (taken.has(variant.id)) continue;
    taken.add(variant.id);

    const { unitPrice, unitCost } = pricesAt(variant, monthsAgo);
    // Shakers and towels go in twos and threes; a tub of protein rarely does.
    const quantity = unitPrice < 700 ? between(1, 3) : rand() < 0.15 ? 2 : 1;
    lines.push({ variant, quantity, unitPrice, unitCost });
  }

  return lines;
}

const sum = (lines, of) => lines.reduce((total, line) => total + of(line), 0);

// ─── SQL ──────────────────────────────────────────────────────────────────────

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return q(value);
}

function insert(table, row) {
  const columns = Object.keys(row);
  return (
    `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES (` +
    columns.map((column) => sqlValue(row[column])).join(", ") +
    ");"
  );
}

/** Order lines exactly as `orderLines` in the sale service builds them. */
function itemRows(orderId, lines, at) {
  return lines.map((line, index) =>
    insert("StoreOrderItem", {
      id: `${orderId}_item${index + 1}`,
      orderId,
      variantId: line.variant.id,
      productName: line.variant.productName,
      variantName: line.variant.name,
      attributes:
        typeof line.variant.attributes === "string"
          ? line.variant.attributes
          : JSON.stringify(line.variant.attributes ?? {}),
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.unitPrice * line.quantity,
      unitCost: line.unitCost,
      lineCost: line.unitCost * line.quantity,
      createdAt: stamp(at),
    }),
  );
}

const statements = [
  "-- Generated by scripts/seed-store-sales.mjs. Safe to re-run: it replaces its own rows.",
  // Due dates go back first, while the renewals that moved them are still there
  // to say whose — recomputed from what remains, the way `refreshDueDate` does.
  `UPDATE "TenantMembership" SET "dueDate" = (
     SELECT MAX(p."validUntil") FROM "Payment" p
     WHERE p."membershipId" = "TenantMembership"."id" AND p."status" = 'COMPLETED'
       AND p."validUntil" IS NOT NULL AND p."id" NOT LIKE '${PREFIX}%'
   )
   WHERE "id" IN (
     SELECT "membershipId" FROM "Payment"
     WHERE "tenantId" = ${q(tenant.id)} AND "id" LIKE '${PREFIX}renew%'
   );`,
  `DELETE FROM "CoinLedgerEntry" WHERE "tenantId" = ${q(tenant.id)} AND "id" LIKE '${PREFIX}%';`,
  `DELETE FROM "StoreOrderItem" WHERE "orderId" IN (
     SELECT "id" FROM "StoreOrder" WHERE "tenantId" = ${q(tenant.id)} AND "id" LIKE '${PREFIX}%'
   );`,
  `DELETE FROM "StoreOrder" WHERE "tenantId" = ${q(tenant.id)} AND "id" LIKE '${PREFIX}%';`,
  `DELETE FROM "Payment" WHERE "tenantId" = ${q(tenant.id)} AND "id" LIKE '${PREFIX}%';`,
];

// Purchase prices, only where the gym has not recorded one of its own.
const costs = new Map();
let costsWritten = 0;
for (const variant of variants) {
  if (variant.costPrice !== null && variant.costPrice !== undefined) {
    costs.set(variant.id, Number(variant.costPrice));
    continue;
  }

  const cost = costFor(variant);
  costs.set(variant.id, cost);
  costsWritten++;
  statements.push(
    `UPDATE "ProductVariant" SET "costPrice" = ${cost}, "updatedAt" = ${q(stamp(now))} WHERE "id" = ${q(variant.id)} AND "costPrice" IS NULL;`,
  );
}

/** Coins each member has earned from this seed and not yet spent. */
const coinsHeld = new Map();
const report = [];

for (const month of MONTHS) {
  const tally = {
    month: month.key,
    members: 0,
    guests: 0,
    collected: 0,
    cost: 0,
    reserved: 0,
    renewals: 0,
    renewalAmount: 0,
  };

  // In time order, so a member only ever spends coins they had already earned.
  const moments = Array.from({ length: month.orders }, () => momentIn(month)).sort(
    (a, b) => a - b,
  );

  moments.forEach((at, index) => {
    const ref = `${month.key}_${String(index + 1).padStart(2, "0")}`;
    const orderId = `${PREFIX}order_${ref}`;
    const lines = basket(month.monthsAgo);
    const subtotal = sum(lines, (line) => line.unitPrice * line.quantity);
    const cost = sum(lines, (line) => line.unitCost * line.quantity);
    const seller = staff.length > 0 ? pick(staff) : null;
    const roll = rand();

    tally.cost += cost;

    // Roughly half to members at the desk, a fifth to members online, and the
    // rest to walk-ins.
    if (members.length === 0 || roll >= 0.7) {
      const [buyerName, buyerPhone] = pick(GUESTS);

      statements.push(
        insert("StoreOrder", {
          id: orderId,
          tenantId: tenant.id,
          membershipId: null,
          buyerName,
          buyerPhone,
          soldById: seller?.id ?? null,
          status: "COMPLETED",
          channel: "COUNTER",
          subtotalAmount: subtotal,
          discountAmount: 0,
          coinsRedeemed: 0,
          totalAmount: subtotal,
          // A walk-in has no membership for coins to land in.
          coinsEarned: 0,
          createdAt: stamp(at),
          updatedAt: stamp(at),
        }),
        ...itemRows(orderId, lines, at),
      );

      tally.guests++;
      tally.collected += subtotal;
      return;
    }

    const online = roll >= 0.5;
    const member = pick(members);
    const collector = online ? null : seller;
    const coinsEarned = sum(lines, (line) => Number(line.variant.coinsGranted) * line.quantity);
    const held = coinsHeld.get(member.id) ?? 0;

    // Now and then a member spends what earlier purchases gave them. Only coins
    // this seed granted, so no balance is taken below what the gym's own ledger
    // already holds.
    const coinsRedeemed =
      held >= 50 && rand() < 0.4
        ? Math.min(held, subtotal, Math.max(20, Math.floor((held * (0.5 + rand() * 0.5)) / 10) * 10))
        : 0;
    const total = subtotal - coinsRedeemed;
    const paymentId = `${PREFIX}pay_${ref}`;

    statements.push(
      insert("Payment", {
        id: paymentId,
        amount: total,
        status: "COMPLETED",
        tenantId: tenant.id,
        membershipId: member.id,
        collectorId: collector?.id ?? null,
        description: "Gym store purchase",
        discountAmount: 0,
        coinsRedeemed: 0,
        extendsValidity: 1,
        paidAt: stamp(at),
        gateway: online ? "RAZORPAY" : null,
        gatewayOrderId: online ? gatewayRef("order") : null,
        gatewayPaymentId: online ? gatewayRef("pay") : null,
        gatewayAccount: online ? "TENANT" : null,
        createdAt: stamp(at),
        updatedAt: stamp(at),
      }),
      insert("StoreOrder", {
        id: orderId,
        tenantId: tenant.id,
        membershipId: member.id,
        soldById: collector?.id ?? null,
        status: "COMPLETED",
        channel: online ? "ONLINE" : "COUNTER",
        subtotalAmount: subtotal,
        discountAmount: 0,
        coinsRedeemed,
        totalAmount: total,
        coinsEarned,
        paymentId,
        createdAt: stamp(at),
        updatedAt: stamp(at),
      }),
      ...itemRows(orderId, lines, at),
    );

    // The two ledger entries a completed member sale writes.
    if (coinsRedeemed > 0) {
      statements.push(
        insert("CoinLedgerEntry", {
          id: `${PREFIX}coin_${ref}_spend`,
          tenantId: tenant.id,
          membershipId: member.id,
          amount: -coinsRedeemed,
          reason: "REDEEMED",
          note: "Spent on a gym store purchase",
          paymentId,
          createdById: collector?.userId ?? null,
          createdAt: stamp(at),
        }),
      );
    }
    if (coinsEarned > 0) {
      statements.push(
        insert("CoinLedgerEntry", {
          id: `${PREFIX}coin_${ref}_earn`,
          tenantId: tenant.id,
          membershipId: member.id,
          amount: coinsEarned,
          reason: "STORE_PURCHASE",
          note: "Earned on a gym store purchase",
          paymentId,
          createdById: collector?.userId ?? null,
          createdAt: stamp(at),
        }),
      );
    }

    coinsHeld.set(member.id, held - coinsRedeemed + coinsEarned);
    tally.members++;
    tally.collected += total;
  });

  // Last month: a walk-in who started paying online and closed the window.
  // Cancelled, so it is not income — the books should not count it.
  if (month.monthsAgo === 1) {
    const at = momentIn(month);
    const orderId = `${PREFIX}order_${month.key}_cancelled`;
    const lines = basket(1);
    const subtotal = sum(lines, (line) => line.unitPrice * line.quantity);
    const [buyerName, buyerPhone] = pick(GUESTS);

    statements.push(
      insert("StoreOrder", {
        id: orderId,
        tenantId: tenant.id,
        membershipId: null,
        buyerName,
        buyerPhone,
        soldById: null,
        status: "CANCELLED",
        channel: "ONLINE",
        subtotalAmount: subtotal,
        discountAmount: 0,
        coinsRedeemed: 0,
        totalAmount: subtotal,
        coinsEarned: 0,
        gateway: "RAZORPAY",
        gatewayOrderId: gatewayRef("order"),
        createdAt: stamp(at),
        updatedAt: stamp(at),
      }),
      ...itemRows(orderId, lines, at),
    );
  }

  if (month.monthsAgo === 0) {
    // Waiting at the desk: two walk-ins and a member who chose to pay at the
    // counter. A reservation takes no money, so none of it is income yet.
    const reservers = [null, null, members.length > 0 ? pick(members) : null];

    reservers.forEach((member, index) => {
      const at = new Date(
        Math.max(now.getTime() - between(1, 36) * 60 * 60 * 1000, month.first.getTime()),
      );
      const orderId = `${PREFIX}order_${month.key}_reserved${index + 1}`;
      const lines = basket(0);
      const subtotal = sum(lines, (line) => line.unitPrice * line.quantity);
      const [buyerName, buyerPhone] = pick(GUESTS);

      statements.push(
        insert("StoreOrder", {
          id: orderId,
          tenantId: tenant.id,
          membershipId: member?.id ?? null,
          // Contact details belong to a guest order only, as `place` writes it.
          buyerName: member ? null : buyerName,
          buyerPhone: member ? null : buyerPhone,
          soldById: null,
          status: "PENDING",
          channel: "PICKUP",
          subtotalAmount: subtotal,
          discountAmount: 0,
          coinsRedeemed: 0,
          totalAmount: subtotal,
          // Frozen at reservation and granted at handover, as `place` does it.
          coinsEarned: sum(lines, (line) => Number(line.variant.coinsGranted) * line.quantity),
          createdAt: stamp(at),
          updatedAt: stamp(at),
        }),
        ...itemRows(orderId, lines, at),
      );
      tally.reserved++;
    });

    // ─── Membership renewals ───────────────────────────────────────────────
    //
    // So this month's split has memberships on one side and the shop on the
    // other. Only plans a member actually renews onto: admission is a one-off,
    // and a retired plan cannot be sold.
    const renewable = plans.filter(
      (plan) =>
        Number(plan.isActive) === 1 &&
        Number(plan.durationDays) >= 28 &&
        !/admission/i.test(plan.title),
    );
    const fallbackPlan =
      renewable.find((plan) => Number(plan.durationDays) <= 31) ?? renewable[0] ?? null;
    const nextMonth = new Date(
      Date.UTC(month.first.getUTCFullYear(), month.first.getUTCMonth() + 1, 1),
    );

    // Members whose cover ran out, or runs out, this month — the ones a desk
    // would actually be renewing.
    const due = members.filter(
      (member) => member.coverUntil && new Date(member.coverUntil) < nextMonth,
    );
    const renewed = [];

    shuffled(due)
      .slice(0, Math.min(20, Math.ceil(due.length * 0.4)))
      .forEach((member, index) => {
        const plan = renewable.find((candidate) => candidate.id === member.lastPlanId) ?? fallbackPlan;
        if (!plan) return;

        // Paid a few days before the term ran out, or some days after it had.
        const cover = new Date(member.coverUntil);
        const earliest = Math.max(month.first.getTime(), cover.getTime() - 5 * DAY_MS);
        if (earliest >= now.getTime()) return;
        const paidAt = new Date(earliest + rand() * (now.getTime() - earliest));

        // Stacked on cover still held; a lapsed member starts again from the day
        // they paid. Days are the plan's own, because the whole price was paid.
        const validFrom = cover > paidAt ? cover : paidAt;
        const validUntil = new Date(validFrom.getTime() + Number(plan.durationDays) * DAY_MS);
        const online = rand() < 0.3;
        const collector = online || staff.length === 0 ? null : pick(staff);

        statements.push(
          insert("Payment", {
            id: `${PREFIX}renew_${String(index + 1).padStart(2, "0")}`,
            amount: Number(plan.amount),
            status: "COMPLETED",
            tenantId: tenant.id,
            membershipId: member.id,
            collectorId: collector?.id ?? null,
            subscriptionId: plan.id,
            discountAmount: 0,
            coinsRedeemed: 0,
            extendsValidity: 1,
            validityBasisAmount: Number(plan.amount),
            paidAt: stamp(paidAt),
            validFrom: stamp(validFrom),
            validUntil: stamp(validUntil),
            gateway: online ? "RAZORPAY" : null,
            gatewayOrderId: online ? gatewayRef("order") : null,
            gatewayPaymentId: online ? gatewayRef("pay") : null,
            gatewayAccount: online ? "TENANT" : null,
            createdAt: stamp(paidAt),
            updatedAt: stamp(paidAt),
          }),
        );

        renewed.push(member.id);
        tally.renewals++;
        tally.renewalAmount += Number(plan.amount);
      });

    if (renewed.length > 0) {
      statements.push(
        `UPDATE "TenantMembership" SET "dueDate" = (
           SELECT MAX(p."validUntil") FROM "Payment" p
           WHERE p."membershipId" = "TenantMembership"."id" AND p."status" = 'COMPLETED'
             AND p."validUntil" IS NOT NULL
         )
         WHERE "id" IN (${renewed.map(q).join(", ")});`,
      );
    }
  }

  report.push(tally);
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const outFile = path.join(rootDir, ".wrangler", "tmp", "seed-store-sales.sql");
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, statements.join("\n") + "\n", "utf8");

const rupees = (amount) => "₹" + amount.toLocaleString("en-IN");

console.log(`Seeding "${tenant.name}", ${remote ? "remote" : "local"}:`);
console.log(`  purchase prices set on ${costsWritten} of ${variants.length} variants`);
for (const tally of report) {
  console.log(
    `  ${tally.month}  ${tally.members + tally.guests} store sales ` +
      `(${tally.members} members, ${tally.guests} walk-ins): ` +
      `${rupees(tally.collected)} collected, ${rupees(tally.cost)} cost, ` +
      `${rupees(tally.collected - tally.cost)} profit` +
      (tally.reserved ? `; ${tally.reserved} reservations waiting` : "") +
      (tally.renewals ? `; ${tally.renewals} renewals, ${rupees(tally.renewalAmount)}` : ""),
  );
}

d1(["--file", outFile], { json: false });

console.log("Done. Re-run to reset; it replaces only its own rows.");
