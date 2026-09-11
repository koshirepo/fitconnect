/**
 * Documentation: Attendance seeder for the busy-hours and at-risk screens.
 *
 * - The deterministic seeder spreads check-ins evenly across the clock, which is fine for a register and useless for anything that reads the shape of them. A heatmap built on it is flat, and the at-risk list is empty because everybody attended last week. This writes attendance that behaves like a gym instead: a morning rush, an evening rush, quiet middays, lighter weekends, and members who drift away.
 * - Writes SQL and hands it to `wrangler d1 execute`, the same way `seed-store.mjs` does, so the database wiring in `wrangler.toml` is reused and nothing has to be remembered.
 * - Every row it writes is prefixed `attseed_`, and it clears exactly that prefix before writing. Re-running resets its own data and never touches a real check-in or one the main seeder made.
 * - Times are generated in the gym's local zone and stored as UTC, which is the round trip the whole feature depends on — if this script and the API disagreed about the offset, the heatmap would look right and be wrong.
 * - Usage: `pnpm run seed:attendance --workspace @fitconnect/api -- --tenant seed-gym-1` (add `--weeks 12`, or `--remote` for production).
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

/** SQL string literal. */
function q(value) {
  if (value === null || value === undefined) return "NULL";
  return "'" + String(value).replace(/'/g, "''") + "'";
}

// ─── Determinism ──────────────────────────────────────────────────────────────
//
// A seeder that produces different data every run cannot be used to reproduce
// what somebody is looking at. Everything random here comes from this, keyed on
// a string, so the same gym always gets the same gym.

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal-ish deviate from two uniforms. Used to cluster arrivals around a peak. */
function gaussian(random) {
  const u = Math.max(random(), 1e-9);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ─── How a gym actually fills up ──────────────────────────────────────────────
//
// Two rushes with a trough between them. The evening one is bigger and more
// spread out than the morning one, which is the shape most gyms have: the
// before-work crowd is on a schedule and the after-work crowd is not.

const WEEKDAY_SESSIONS = [
  { weight: 0.42, centre: 7.0, spread: 1.0 },
  { weight: 0.13, centre: 12.5, spread: 1.3 },
  { weight: 0.45, centre: 19.0, spread: 1.4 },
];

// Saturday and Sunday: fewer people, and the morning crowd has a lie-in.
const WEEKEND_SESSIONS = [
  { weight: 0.6, centre: 9.5, spread: 1.5 },
  { weight: 0.4, centre: 17.5, spread: 1.8 },
];

/** Hours the doors are open. Anything generated outside this is redrawn. */
const OPENS_AT = 5.0;
const CLOSES_AT = 22.5;

/**
 * A local clock time for one visit, in hours past midnight.
 *
 * Redrawn rather than clamped when it falls outside opening hours: clamping
 * would pile every outlier onto exactly 05:00 and 22:30 and put two spikes on
 * the chart at the times the gym is emptiest.
 */
function drawArrivalHour(random, isWeekend) {
  const sessions = isWeekend ? WEEKEND_SESSIONS : WEEKDAY_SESSIONS;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    let roll = random();
    let chosen = sessions[sessions.length - 1];
    for (const session of sessions) {
      if (roll < session.weight) {
        chosen = session;
        break;
      }
      roll -= session.weight;
    }

    const hour = chosen.centre + gaussian(random) * chosen.spread;
    if (hour >= OPENS_AT && hour < CLOSES_AT) return hour;
  }

  return isWeekend ? 10 : 18.5;
}

/**
 * The cohorts a roster splits into, and roughly how much of it each one is.
 *
 * `fader` is the one the at-risk list exists for: somebody who trained normally
 * and then stopped, while their membership carried on. `ghost` is the other
 * shape it has to catch — joined, never came once.
 */
const COHORTS = [
  { name: "regular", share: 0.3, perWeek: [4, 5] },
  { name: "steady", share: 0.22, perWeek: [2, 3] },
  { name: "casual", share: 0.18, perWeek: [1, 2] },
  { name: "weekender", share: 0.1, perWeek: [1, 2] },
  { name: "fader", share: 0.14, perWeek: [3, 4] },
  { name: "ghost", share: 0.06, perWeek: [0, 0] },
];

function cohortFor(membershipId) {
  let roll = (hashString("cohort:" + membershipId) % 10000) / 10000;
  for (const cohort of COHORTS) {
    if (roll < cohort.share) return cohort;
    roll -= cohort.share;
  }
  return COHORTS[COHORTS.length - 1];
}

// ─── Zone arithmetic ──────────────────────────────────────────────────────────
//
// Deliberately the same two-step the API does. If this script and the API
// disagreed about what "07:00 in Kolkata" is, the heatmap would be built from
// data that does not mean what the chart says it means.

function zoneOffsetMinutes(at, timezone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(at).map((part) => [part.type, part.value]),
  );
  const asZone = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asZone - at.getTime()) / 60000);
}

/** The UTC instant of a local wall-clock time on a given local day. */
function localToUtc(dayIso, hours, timezone) {
  const asIfUtc = Date.parse(
    dayIso +
      "T" +
      String(Math.floor(hours)).padStart(2, "0") +
      ":" +
      String(Math.floor((hours % 1) * 60)).padStart(2, "0") +
      ":00.000Z",
  );
  const near = zoneOffsetMinutes(new Date(asIfUtc), timezone);
  const candidate = new Date(asIfUtc - near * 60000);
  const exact = zoneOffsetMinutes(candidate, timezone);
  return new Date(asIfUtc - exact * 60000);
}

/** `YYYY-MM-DD` for a local day `offsetDays` before the gym's today. */
function localDayBack(offsetDays, timezone, now = new Date()) {
  const shifted = new Date(now.getTime() + zoneOffsetMinutes(now, timezone) * 60000);
  shifted.setUTCDate(shifted.getUTCDate() - offsetDays);
  return shifted.toISOString().slice(0, 10);
}

// ─── Arguments ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const remote = argv.includes("--remote");
const tenantSlug = argv[argv.indexOf("--tenant") + 1];
const weeksArg = argv.includes("--weeks") ? Number(argv[argv.indexOf("--weeks") + 1]) : 8;
const weeks = Number.isFinite(weeksArg) && weeksArg > 0 && weeksArg <= 26 ? Math.floor(weeksArg) : 8;

if (!argv.includes("--tenant") || !tenantSlug || tenantSlug.startsWith("--")) {
  console.error("Usage: node scripts/seed-attendance.mjs --tenant <slug> [--weeks 8] [--remote]");
  console.error("       The slug is the gym's subdomain, e.g. seed-gym-1.");
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
  console.error(
    'No gym found with slug "' + tenantSlug + '" in the ' + (remote ? "remote" : "local") + " database.",
  );
  process.exit(1);
}

const settings = d1Rows(
  'SELECT "timezone" FROM "TenantSettings" WHERE "tenantId" = ' + q(tenant.id),
)[0];
const timezone = settings?.timezone || "Asia/Kolkata";

// Only real members get visits. Staff hold membership rows too, and a gym that
// does not make its own coaches badge in would otherwise get a roster of
// employees at the top of its at-risk list.
const members = d1Rows(
  'SELECT "id", "memberId" FROM "TenantMembership" WHERE "tenantId" = ' +
    q(tenant.id) +
    " AND \"status\" = 'ACTIVE' AND \"role\" = 'MEMBER' ORDER BY \"memberId\"",
);

if (members.length === 0) {
  console.error('Gym "' + tenantSlug + '" has no active members to seed attendance for.');
  process.exit(1);
}

// One member of staff to attribute the hand-marked visits to. Null is fine —
// the row is then indistinguishable from a self check-in, which is the one
// thing this seeder must not produce for them.
const staff = d1Rows(
  'SELECT "id" FROM "TenantMembership" WHERE "tenantId" = ' +
    q(tenant.id) +
    " AND \"role\" IN ('ADMIN','COACH') LIMIT 1",
)[0];

// ─── Generate ─────────────────────────────────────────────────────────────────

const totalDays = weeks * 7;
const rows = [];
const faderCutoffByMember = new Map();
let selfCount = 0;
let markedCount = 0;

for (const member of members) {
  const cohort = cohortFor(member.id);
  if (cohort.name === "ghost") continue;

  const random = makeRandom(hashString("visits:" + member.id));

  // A fader trains for the first stretch of the window and then stops. The
  // cutoff is staggered across the cohort so the at-risk list has a spread of
  // absences rather than everybody vanishing on the same Tuesday.
  const fadesAfterDay =
    cohort.name === "fader"
      ? Math.floor(totalDays * (0.3 + random() * 0.35))
      : Number.POSITIVE_INFINITY;
  if (cohort.name === "fader") faderCutoffByMember.set(member.id, fadesAfterDay);

  for (let week = 0; week < weeks; week += 1) {
    const [minPerWeek, maxPerWeek] = cohort.perWeek;
    const target = minPerWeek + Math.floor(random() * (maxPerWeek - minPerWeek + 1));

    // The seven days of this week, each resolved to the real calendar day it
    // is — the window does not start on a Monday, so a slot's position in it
    // says nothing about which weekday it is. Getting this wrong is invisible
    // in the row count and obvious on the chart: the weekend cohort would train
    // on whichever two days the window happened to end on.
    const dayPool = [0, 1, 2, 3, 4, 5, 6]
      .map((slot) => {
        const dayIndex = week * 7 + slot;
        if (dayIndex >= totalDays) return null;
        const dayIso = localDayBack(totalDays - 1 - dayIndex, timezone);
        const weekday = new Date(dayIso + "T12:00:00.000Z").getUTCDay();
        return { dayIndex, dayIso, isWeekend: weekday === 0 || weekday === 6 };
      })
      .filter(Boolean);

    // Shuffled without replacement so one member never gets two visits on one
    // day — the table forbids it, and a seeder that leaned on the constraint to
    // dedupe would drop rows silently.
    for (let i = dayPool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [dayPool[i], dayPool[j]] = [dayPool[j], dayPool[i]];
    }

    const preferred = dayPool.sort((a, b) => {
      const aWeekend = a.isWeekend ? 1 : 0;
      const bWeekend = b.isWeekend ? 1 : 0;
      return cohort.name === "weekender" ? bWeekend - aWeekend : aWeekend - bWeekend;
    });

    for (const { dayIndex, dayIso, isWeekend } of preferred.slice(0, target)) {
      if (dayIndex > fadesAfterDay) continue;

      // Roughly one visit in seven is recorded by staff rather than by the
      // member. Those carry the time the desk did its paperwork, which is what
      // makes them useless to the heatmap and worth excluding from it — this
      // seeder exists partly to make that difference visible.
      const handMarked = staff && random() < 0.15;

      let checkInAt;
      if (handMarked) {
        // The desk clears its backlog near closing.
        checkInAt = localToUtc(dayIso, 21.5 + random() * 0.9, timezone);
        markedCount += 1;
      } else {
        checkInAt = localToUtc(dayIso, drawArrivalHour(random, isWeekend), timezone);
        selfCount += 1;
      }

      rows.push({
        id: "attseed_" + member.id + "_" + dayIso.replace(/-/g, ""),
        membershipId: member.id,
        date: dayIso + "T00:00:00.000Z",
        checkInAt: checkInAt.toISOString(),
        markedById: handMarked ? staff.id : null,
      });
    }
  }
}

// ─── Renewal dates, so "renewing soon" is not always zero ─────────────────────
//
// `dueDate` is normally derived from payments; this writes it directly, which
// is demo dressing rather than a real membership term. It is confined to the
// faders — the members this list is about — and to two of them, so the urgent
// tier on the screen has something in it without the roster reading as though
// half the gym is about to lapse.

const fadersDueSoon = [...faderCutoffByMember.keys()].slice(0, 2);

const statements = [
  // Clear only what this script wrote. Genuine check-ins and the main seeder's
  // rows share the table and must survive a re-run.
  'DELETE FROM "Attendance" WHERE "tenantId" = ' + q(tenant.id) + " AND \"id\" LIKE 'attseed_%';",
];

for (const row of rows) {
  statements.push(
    'INSERT INTO "Attendance" ("id","tenantId","membershipId","markedById","date","checkInAt","note","createdAt") VALUES (' +
      [
        q(row.id),
        q(tenant.id),
        q(row.membershipId),
        row.markedById ? q(row.markedById) : "NULL",
        q(row.date),
        q(row.checkInAt),
        "NULL",
        q(row.checkInAt),
      ].join(",") +
      ');',
  );
}

fadersDueSoon.forEach((membershipId, index) => {
  const dueOn = localDayBack(index === 0 ? -5 : 9, timezone); // one upcoming, one lapsed
  statements.push(
    'UPDATE "TenantMembership" SET "dueDate" = ' +
      q(dueOn + "T00:00:00.000Z") +
      ' WHERE "id" = ' +
      q(membershipId) +
      ";",
  );
});

const outFile = path.join(rootDir, ".wrangler", "tmp", "seed-attendance.sql");
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, statements.join("\n"), "utf8");

console.log(
  "Seeding " +
    rows.length +
    " check-ins (" +
    selfCount +
    " self, " +
    markedCount +
    " hand-marked) across " +
    weeks +
    " weeks for " +
    members.length +
    ' members of "' +
    tenant.name +
    '" [' +
    timezone +
    "], " +
    (remote ? "remote" : "local") +
    "...",
);

d1(["--file", outFile], { json: false });

console.log("Done. Re-run to regenerate exactly this data; it replaces only its own rows.");
