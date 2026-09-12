/**
 * Documentation: Build the exercise library from the clips already in R2.
 *
 * - The bucket holds `exercise/<gender>/<muscle>/<Exercise Name>.mp4`, mirroring the folders the clips were filmed into. This reads that tree from a local copy — the same files, byte for byte — and writes one `Exercise` row per exercise, pointing at the keys that are already in the bucket. Nothing is uploaded.
 * - The two genders are one exercise. Most names appear under both `girl/` and `men/`, and they are the same lift: one row carries both keys, and the player shows whichever suits the viewer. A name filmed only once gets a row with one key.
 * - The muscle group is the folder, title-cased, because the folders disagree about case: `girl/Abs` beside `men/abs`. The exercise name is the file name, with a trailing `(1)` dropped — those are duplicate takes, not different lifts.
 * - Numeric-named clips (`3529914802496381978_10211455878.mp4`) are skipped. They carry no name and no muscle in their path, so there is nothing to file them under; they are also not in the bucket.
 * - Ids are derived from the slug, so running twice updates the same rows rather than stacking a second library. Re-running is how a corrected name or a new clip is applied.
 * - Writes SQL and hands it to `wrangler d1 execute`, like every other seeder here. `--remote` targets production; the default is the local database.
 * - Usage: `pnpm run import:exercises` (add `--remote` for production, `--dir <path>` for a copy of the clips elsewhere).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
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

// ─── Arguments ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const remote = argv.includes("--remote");
const dirArg = argv.indexOf("--dir");
const sourceDir = dirArg >= 0 && argv[dirArg + 1] ? argv[dirArg + 1] : "D:\\exercise";
/** The prefix the clips live under in the bucket. */
const KEY_PREFIX = "exercise";

if (!existsSync(sourceDir)) {
  console.error(`No clips at ${sourceDir}. Pass --dir <path> to a copy of them.`);
  process.exit(1);
}

const wranglerCli = resolveWranglerCli();
if (!wranglerCli) {
  console.error("Wrangler CLI not found. Run `pnpm install` first.");
  process.exit(1);
}

// ─── Reading the tree ─────────────────────────────────────────────────────────

/** `girl` and `men` are the two shoots; anything else is not a gender folder. */
const GENDERS = { girl: "female", men: "male" };

/** A file whose name is only digits and underscores carries no exercise name. */
const UNNAMED = /^[0-9_]+$/;

function titleCase(value) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Lowercase, hyphenated, and stable — the same rule the API's own slugs follow,
 * so a row imported here and one added by hand on the manage screen are named
 * the same way.
 */
function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * The equipment a name implies.
 *
 * Read off the first word, because that is how the library names things:
 * "Barbell Curl", "Cable Twist", "Lever Seated Crunch". A name that starts with
 * none of these has no equipment, which is what "Bodyweight" would mean anyway.
 */
const EQUIPMENT = [
  "Barbell",
  "Dumbbell",
  "Cable",
  "Band",
  "Lever",
  "Smith",
  "Kettlebell",
  "Machine",
  "Sled",
  "Weighted",
  "Suspension",
  "Roller",
];

function equipmentFor(name) {
  const first = name.split(/\s+/)[0] ?? "";
  return EQUIPMENT.find((item) => item.toLowerCase() === first.toLowerCase()) ?? null;
}

/**
 * Every clip in the tree, as `{ gender, muscleGroup, name, key }`.
 *
 * The key is built from the path exactly as it sits on disk, because that is
 * what the bucket holds: `girl/Abs/...` and `men/abs/...` differ in case, and
 * an object key is case-sensitive.
 */
function readClips(dir) {
  const clips = [];

  for (const genderFolder of readdirSync(dir)) {
    const gender = GENDERS[genderFolder];
    const genderPath = path.join(dir, genderFolder);
    if (!gender || !statSync(genderPath).isDirectory()) continue;

    for (const muscleFolder of readdirSync(genderPath)) {
      const musclePath = path.join(genderPath, muscleFolder);
      if (!statSync(musclePath).isDirectory()) continue;

      for (const file of readdirSync(musclePath)) {
        if (!file.toLowerCase().endsWith(".mp4")) continue;

        // A duplicate take — "Air Bike (1).mp4" — is the same exercise.
        const base = file.slice(0, -4).replace(/\s*\(\d+\)$/, "").trim();
        if (!base || UNNAMED.test(base)) continue;

        clips.push({
          gender,
          muscleGroup: titleCase(muscleFolder),
          name: base,
          key: `${KEY_PREFIX}/${genderFolder}/${muscleFolder}/${file}`,
        });
      }
    }
  }

  return clips;
}

/**
 * One row per exercise, with both clips where both were filmed.
 *
 * Keyed by name and muscle group together: "Barbell Curl" under Biceps and the
 * same name under Forearms are two exercises, and the library does file a few
 * that way.
 */
function buildLibrary(clips) {
  const byExercise = new Map();

  for (const clip of clips) {
    const slug = slugify(`${clip.name} ${clip.muscleGroup}`);
    const entry = byExercise.get(slug) ?? {
      slug: slugify(clip.name),
      name: clip.name,
      muscleGroup: clip.muscleGroup,
      equipment: equipmentFor(clip.name),
      maleVideoKey: null,
      femaleVideoKey: null,
    };

    // The first take wins where a name was filmed twice for one gender.
    if (clip.gender === "male") entry.maleVideoKey ??= clip.key;
    else entry.femaleVideoKey ??= clip.key;

    byExercise.set(slug, entry);
  }

  // Two muscle groups can hold the same name, and a slug has to be unique.
  const bySlug = new Map();
  for (const entry of byExercise.values()) {
    let slug = entry.slug;
    for (let suffix = 2; bySlug.has(slug); suffix++) slug = `${entry.slug}-${suffix}`;
    bySlug.set(slug, { ...entry, slug });
  }

  return [...bySlug.values()].sort(
    (a, b) => a.muscleGroup.localeCompare(b.muscleGroup) || a.name.localeCompare(b.name),
  );
}

// ─── SQL ──────────────────────────────────────────────────────────────────────

const now = new Date().toISOString().replace("Z", "+00:00");

function buildSql(library) {
  const statements = [
    "-- Generated by scripts/import-exercises.mjs. Safe to re-run: it replaces its own rows.",
  ];

  for (const exercise of library) {
    // The id is derived from the slug, so a re-run updates the row it wrote
    // last time rather than adding a second copy of the same lift.
    const id = `exlib_${exercise.slug}`;

    statements.push(
      'INSERT INTO "Exercise" ("id","name","slug","muscleGroup","secondaryMuscles","equipment","description","maleVideoKey","femaleVideoKey","isActive","createdAt","updatedAt") VALUES (' +
        [
          q(id),
          q(exercise.name),
          q(exercise.slug),
          q(exercise.muscleGroup),
          q("[]"),
          q(exercise.equipment),
          "NULL",
          q(exercise.maleVideoKey),
          q(exercise.femaleVideoKey),
          1,
          q(now),
          q(now),
        ].join(",") +
        ') ON CONFLICT("id") DO UPDATE SET ' +
        [
          '"name" = excluded."name"',
          '"muscleGroup" = excluded."muscleGroup"',
          '"equipment" = excluded."equipment"',
          // Only ever filled in, never cleared: a clip added to the bucket
          // later should appear, and one missing from this run should not
          // wipe a key somebody set by hand on the manage screen.
          '"maleVideoKey" = COALESCE(excluded."maleVideoKey", "Exercise"."maleVideoKey")',
          '"femaleVideoKey" = COALESCE(excluded."femaleVideoKey", "Exercise"."femaleVideoKey")',
          '"updatedAt" = excluded."updatedAt"',
        ].join(", ") +
        ";",
    );
  }

  return statements.join("\n") + "\n";
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const clips = readClips(sourceDir);
const library = buildLibrary(clips);

if (library.length === 0) {
  console.error(`No named clips found under ${sourceDir}.`);
  process.exit(1);
}

const outFile = path.join(rootDir, ".wrangler", "tmp", "import-exercises.sql");
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, buildSql(library), "utf8");

const byMuscle = new Map();
for (const exercise of library) {
  byMuscle.set(exercise.muscleGroup, (byMuscle.get(exercise.muscleGroup) ?? 0) + 1);
}
const both = library.filter((e) => e.maleVideoKey && e.femaleVideoKey).length;

console.log(`Read ${clips.length} clips from ${sourceDir}`);
console.log(`Importing ${library.length} exercises (${both} with both clips), ${remote ? "remote" : "local"}:`);
for (const [muscle, count] of [...byMuscle.entries()].sort()) {
  console.log(`  ${muscle.padEnd(12)} ${count}`);
}

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
    "--file",
    outFile,
  ],
  { cwd: rootDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

console.log("Done. Re-run any time; it updates the rows it wrote rather than duplicating them.");
