/**
 * Documentation: Freeze seeder for the membership-pause screens.
 *
 * - Every seeded plan ships with `freezeDays = 0`, which switches freezing off: the freeze card renders nothing, on the member's profile and on the staff member page alike. So the feature looks unimplemented until somebody edits a plan. This turns the budget on and then writes freezes in each state the UI distinguishes, so all four branches can be seen without arranging them by hand.
 * - The states are the point. "Frozen today" and "booked for later" are different screens — the card had a bug where a break booked for next month reported the member as paused — and "ended early" is the only one that shows days coming back.
 * - Term arithmetic mirrors `freezes.service.ts` exactly: `plannedEndsOn` is inclusive (`startsOn + days - 1`), the days are charged to `Payment.validUntil`, and `TenantMembership.dueDate` is recomputed from the payments rather than written directly — the app recomputes it from payment rows and would wipe anything set here. Getting this wrong would leave rows the app itself could never have produced.
 * - Writes SQL and hands it to `wrangler d1 execute`, like the other seeders. Rows are prefixed `frzseed_` and exactly that prefix is cleared first, so re-running resets its own data and leaves real freezes alone. Plan budgets are set, not restored — a gym that had its own allowances keeps whichever this last wrote.
 * - `--reset` additionally clears freezes this script did not write, reversing their term charges too, for putting a demo gym into a known state. Off by default, because on a real gym those rows are members' actual arranged breaks and the days are already reflected in their end dates.
 * - Usage: `pnpm run seed:freezes -- --tenant seed-gym-1` (add `--reset` to clear foreign freezes, `--remote` for production).
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

function q(value) {
  if (value === null || value === undefined) return "NULL";
  return "'" + String(value).replace(/'/g, "''") + "'";
}

/** `YYYY-MM-DD` shifted by whole days. */
function dayShift(iso, days) {
  const at = new Date(iso.slice(0, 10) + "T00:00:00.000Z");
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** The service refuses anything shorter, so the seeder must not write one. */
const MIN_FREEZE_DAYS = 3;

const TODAY = new Date().toISOString().slice(0, 10);

/**
 * Freeze budgets, scaled to how long the term is.
 *
 * A month-long plan that allowed thirty freeze days would be a plan that can be
 * paused for its whole life, so the allowance is roughly a quarter of the term
 * and the count rises with it: longer terms are the ones a member actually
 * needs to break up.
 */
function budgetFor(durationDays) {
  if (durationDays >= 300) return { freezeDays: 30, freezeCount: 3 };
  if (durationDays >= 60) return { freezeDays: 14, freezeCount: 2 };
  return { freezeDays: 7, freezeCount: 1 };
}

/**
 * The states the card has to tell apart, one member each.
 *
 * `daysUsed` is what the term was actually charged. For a freeze still running
 * or still booked that is the whole booking, charged optimistically the way the
 * service does it; for one ended early it is only the days taken, and the
 * difference is what the member got back.
 */
const SCENARIOS = [
  {
    key: "running",
    label: "frozen today",
    startsOn: dayShift(TODAY, -3),
    days: 8,
    endedOn: null,
    daysUsed: 8,
    reason: "Away with family",
  },
  {
    key: "scheduled",
    label: "booked for later",
    startsOn: dayShift(TODAY, 10),
    days: 7,
    endedOn: null,
    daysUsed: 7,
    reason: "Exams",
  },
  {
    key: "endedearly",
    label: "ended early, days returned",
    startsOn: dayShift(TODAY, -40),
    days: 10,
    endedOn: dayShift(TODAY, -35),
    daysUsed: 6,
    reason: "Minor injury",
    endedBy: "ENDED_EARLY",
  },
  {
    key: "completed",
    label: "ran its full course",
    startsOn: dayShift(TODAY, -70),
    days: 10,
    endedOn: dayShift(TODAY, -61),
    daysUsed: 10,
    reason: "Travelling",
    endedBy: "ENDED_EARLY",
  },
];

// ─── Arguments ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const remote = argv.includes("--remote");
const tenantSlug = argv[argv.indexOf("--tenant") + 1];

if (!argv.includes("--tenant") || !tenantSlug || tenantSlug.startsWith("--")) {
  console.error("Usage: node scripts/seed-freezes.mjs --tenant <slug> [--remote]");
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
  const out = d1(["--command", sql]);
  try {
    return JSON.parse(out.slice(out.indexOf("[")))?.[0]?.results ?? [];
  } catch {
    return [];
  }
}

// ─── What we are seeding into ─────────────────────────────────────────────────

const tenant = d1Rows('SELECT id, name FROM "Tenant" WHERE slug = ' + q(tenantSlug))[0];
if (!tenant) {
  console.error('No gym found with slug "' + tenantSlug + '".');
  process.exit(1);
}

const plans = d1Rows(
  'SELECT "id", "title", "durationDays" FROM "Subscription" WHERE "tenantId" = ' + q(tenant.id),
);
if (plans.length === 0) {
  console.error('Gym "' + tenantSlug + '" has no plans, so there is no freeze budget to grant.');
  process.exit(1);
}

/**
 * Members who could actually be frozen: active, on a plan, with time left.
 *
 * The service refuses everybody else, so seeding a freeze onto one of them
 * would produce a row the app would never have written — and the card would
 * then show a state that cannot be reached by using the product.
 */
const candidates = d1Rows(
  `SELECT m."id" AS membershipId, m."memberId", u."name",
          p."id" AS paymentId, p."validUntil",
          s."id" AS planId, s."title" AS planTitle, s."durationDays"
   FROM "TenantMembership" m
   JOIN "User" u ON u."id" = m."userId"
   JOIN "Payment" p ON p."membershipId" = m."id"
   JOIN "Subscription" s ON s."id" = p."subscriptionId"
   WHERE m."tenantId" = ${q(tenant.id)}
     AND m."status" = 'ACTIVE'
     AND m."role" = 'MEMBER'
     AND p."status" = 'COMPLETED'
     AND p."validUntil" > ${q(new Date().toISOString())}
   GROUP BY m."id"
   ORDER BY m."memberId"`,
);

if (candidates.length === 0) {
  console.error(
    'Gym "' + tenantSlug + '" has no active member on a live plan, so no freeze can be seeded.',
  );
  process.exit(1);
}

// ─── Build ────────────────────────────────────────────────────────────────────

const statements = [
  /**
   * Give back what the last run charged, before deleting the rows that charged
   * it.
   *
   * A freeze is not just a row: it moved the member's end date. Deleting the
   * row alone would strand those days on the term, and every re-run would add
   * another week to somebody's membership until a seeded demo gym had members
   * paid up into 2029. The subtraction has to happen while the rows are still
   * there to be summed.
   */
  `UPDATE "Payment" SET "validUntil" = date("validUntil", '-' || (
     SELECT COALESCE(SUM(f."daysUsed"), 0) FROM "MembershipFreeze" f
     WHERE f."paymentId" = "Payment"."id" AND f."id" LIKE 'frzseed_%'
   ) || ' day')
   WHERE EXISTS (
     SELECT 1 FROM "MembershipFreeze" f
     WHERE f."paymentId" = "Payment"."id" AND f."id" LIKE 'frzseed_%'
   );`,
  'DELETE FROM "MembershipFreeze" WHERE "tenantId" = ' +
    q(tenant.id) +
    " AND \"id\" LIKE 'frzseed_%';",
];

/**
 * Clear freezes this script did not write, for a gym being reset to a known
 * demo state.
 *
 * Off by default and deliberately so: on a real gym these are members' actual
 * arranged breaks, and the days are already reflected in their end dates. The
 * same term arithmetic is reversed first, for the same reason as above.
 */
if (argv.includes("--reset")) {
  statements.unshift(
    `UPDATE "Payment" SET "validUntil" = date("validUntil", '-' || (
       SELECT COALESCE(SUM(f."daysUsed"), 0) FROM "MembershipFreeze" f
       WHERE f."paymentId" = "Payment"."id" AND f."id" NOT LIKE 'frzseed_%'
     ) || ' day')
     WHERE "tenantId" = ${q(tenant.id)} AND EXISTS (
       SELECT 1 FROM "MembershipFreeze" f
       WHERE f."paymentId" = "Payment"."id" AND f."id" NOT LIKE 'frzseed_%'
     );`,
    `DELETE FROM "MembershipFreeze" WHERE "tenantId" = ${q(tenant.id)} AND "id" NOT LIKE 'frzseed_%';`,
  );
}

// Budgets first: without these the card renders nothing at all.
const budgets = [];
for (const plan of plans) {
  const { freezeDays, freezeCount } = budgetFor(Number(plan.durationDays));
  budgets.push(`${plan.title} ${freezeDays}d/${freezeCount}`);
  statements.push(
    `UPDATE "Subscription" SET "freezeDays" = ${freezeDays}, "freezeCount" = ${freezeCount}, "updatedAt" = ${q(new Date().toISOString())} WHERE "id" = ${q(plan.id)};`,
  );
}

const placed = [];
SCENARIOS.forEach((scenario, index) => {
  const member = candidates[index % candidates.length];
  if (!member) return;
  // Two scenarios landing on one member would stack freezes on the same term
  // and break the overlap rule the app enforces.
  if (placed.some((row) => row.membershipId === member.membershipId)) return;

  /**
   * Fit the scenario to the plan this member is actually on.
   *
   * The scenarios name a shape, not a length, and gyms carry plans from a
   * monthly with a week of freeze to an annual with a month of it. Writing a
   * fixed ten-day freeze against a seven-day allowance produces a row the app
   * would have refused — a member showing 10 of 7 days used, and a card whose
   * arithmetic cannot be reproduced by using the product. Below the three-day
   * minimum there is no freeze worth writing, so that member is skipped.
   */
  const budget = budgetFor(Number(member.durationDays)).freezeDays;
  const days = Math.min(scenario.days, budget);
  if (days < MIN_FREEZE_DAYS) return;
  const daysUsed = Math.min(scenario.daysUsed, days);

  const plannedEndsOn = dayShift(scenario.startsOn, days - 1);
  const id = "frzseed_" + scenario.key + "_" + member.membershipId;

  statements.push(
    'INSERT INTO "MembershipFreeze" ("id","tenantId","membershipId","paymentId","startsOn","plannedEndsOn","endedOn","daysUsed","reason","endedBy","createdById","createdAt","updatedAt") VALUES (' +
      [
        q(id),
        q(tenant.id),
        q(member.membershipId),
        q(member.paymentId),
        q(scenario.startsOn + "T00:00:00.000Z"),
        q(plannedEndsOn + "T00:00:00.000Z"),
        scenario.endedOn ? q(scenario.endedOn + "T00:00:00.000Z") : "NULL",
        daysUsed,
        q(scenario.reason),
        scenario.endedBy ? q(scenario.endedBy) : "NULL",
        "NULL",
        q(new Date().toISOString()),
        q(new Date().toISOString()),
      ].join(",") +
      ");",
  );

  // The term is charged the days actually used, onto the payment's own window
  // — never onto dueDate, which the app recomputes from payment rows.
  statements.push(
    `UPDATE "Payment" SET "validUntil" = date("validUntil", '+${daysUsed} day') WHERE "id" = ${q(member.paymentId)};`,
  );

  placed.push({ ...scenario, ...member, days, daysUsed });
});

// dueDate recomputed from the payments, the way `refreshDueDate` does it, so
// the roster and the at-risk list agree with the freeze card.
for (const row of placed) {
  statements.push(
    `UPDATE "TenantMembership" SET "dueDate" = (
       SELECT MAX(p."validUntil") FROM "Payment" p
       WHERE p."membershipId" = ${q(row.membershipId)} AND p."status" = 'COMPLETED'
     ) WHERE "id" = ${q(row.membershipId)};`,
  );
}

const outFile = path.join(rootDir, ".wrangler", "tmp", "seed-freezes.sql");
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, statements.join("\n"), "utf8");

console.log('Freeze budgets for "' + tenant.name + '": ' + budgets.join(", "));
console.log("Seeding " + placed.length + " freezes, " + (remote ? "remote" : "local") + ":");
for (const row of placed) {
  console.log(
    "  #" + String(row.memberId).padEnd(4) + String(row.name).slice(0, 22).padEnd(23) + row.label,
  );
}

d1(["--file", outFile], { json: false });

console.log("Done. Re-run to reset; it replaces only its own rows.");
