/**
 * Documentation: Dummy gym-store catalogue seeder.
 *
 * - The deterministic seeder predates the gym store: it fills `Product` (the platform storefront) but never `StoreProduct` / `StoreVariant`, so a freshly seeded gym has an empty shop. This fills that gap on its own rather than growing that script, because store rows are demo dressing and should be droppable without touching members, payments, or attendance.
 * - Writes SQL and hands it to `wrangler d1 execute`, so the database id and environment wiring in `wrangler.toml` is reused and nothing has to be remembered.
 * - Ids are derived from the tenant and a slug of the product name, so running twice replaces the same rows instead of stacking a second catalogue. Re-running is the intended way to reset the shop.
 * - Usage: `pnpm run seed:store --workspace @fitconnect/api -- --tenant rudra-gym` (add `--remote` for production).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(rootDir, "..", "..");

/**
 * Resolve the wrangler CLI entry so we can run it under `node` directly —
 * `.cmd` shims cannot be spawned without a shell on Windows.
 */
function resolveWranglerCli() {
  return [
    path.join(rootDir, "node_modules", "wrangler", "bin", "wrangler.js"),
    path.join(repoRoot, "node_modules", "wrangler", "bin", "wrangler.js"),
  ].find((candidate) => existsSync(candidate));
}

// ─── The catalogue ────────────────────────────────────────────────────────────
//
// Priced in rupees, the way every amount in this codebase is stored. Stock and
// coin grants are deliberately uneven, and two variants are deliberately out of
// stock: a demo where every row reads the same is a demo that hides the columns
// that matter.

const CATALOGUE = [
  {
    name: "Whey Protein Isolate",
    category: "SUPPLEMENT",
    description: "27g protein per scoop, low lactose.",
    markdown:
      "## Whey Protein Isolate\n\nFiltered to strip most of the lactose and fat, so it mixes thin and sits light. **27g protein** and 1.2g sugar per 30g scoop.\n\n- One scoop within an hour of training\n- 60 servings in the 2kg tub\n- Third-party tested for banned substances",
    coinsGranted: 60,
    variants: [
      { name: "Chocolate · 1kg", attributes: { flavour: "Chocolate", size: "1kg" }, price: 2899, stock: 24 },
      { name: "Chocolate · 2kg", attributes: { flavour: "Chocolate", size: "2kg" }, price: 5199, stock: 11 },
      { name: "Vanilla · 1kg", attributes: { flavour: "Vanilla", size: "1kg" }, price: 2899, stock: 17 },
      { name: "Mango · 1kg", attributes: { flavour: "Mango", size: "1kg" }, price: 2999, stock: 0 },
    ],
  },
  {
    name: "Mass Gainer",
    category: "SUPPLEMENT",
    description: "Carb-heavy blend for members who cannot hold weight.",
    markdown:
      "## Mass Gainer\n\n**Three scoops** with milk adds roughly 750 calories. For members who train hard and still cannot put weight on.\n\nMix with 300ml milk, once daily, ideally after training.",
    coinsGranted: 75,
    variants: [
      { name: "Chocolate · 3kg", attributes: { flavour: "Chocolate", size: "3kg" }, price: 3499, stock: 8 },
      { name: "Kesar Pista · 3kg", attributes: { flavour: "Kesar Pista", size: "3kg" }, price: 3599, stock: 5 },
    ],
  },
  {
    name: "Creatine Monohydrate",
    category: "SUPPLEMENT",
    description: "Micronised, unflavoured. 5g a day, every day.",
    markdown:
      "## Creatine Monohydrate\n\nThe most studied supplement on this shelf. **5g daily**, timing does not matter. No loading phase needed — the difference shows in three to four weeks either way.",
    coinsGranted: 25,
    variants: [
      { name: "Unflavoured · 250g", attributes: { flavour: "Unflavoured", size: "250g" }, price: 999, stock: 32 },
      { name: "Unflavoured · 500g", attributes: { flavour: "Unflavoured", size: "500g" }, price: 1749, stock: 14 },
    ],
  },
  {
    name: "Pre-Workout",
    category: "SUPPLEMENT",
    description: "Caffeine, beta-alanine, citrulline. Not for evening sessions.",
    markdown:
      "## Pre-Workout\n\n200mg caffeine per scoop. Take 20 minutes before training.\n\n> Skip this after 6pm unless you enjoy staring at the ceiling.",
    coinsGranted: 40,
    variants: [
      { name: "Blue Raspberry · 300g", attributes: { flavour: "Blue Raspberry", size: "300g" }, price: 1899, stock: 12 },
      { name: "Watermelon · 300g", attributes: { flavour: "Watermelon", size: "300g" }, price: 1899, stock: 9 },
    ],
  },
  {
    name: "BCAA Recovery",
    category: "SUPPLEMENT",
    description: "Sip through a long session or on rest days.",
    markdown:
      "## BCAA Recovery\n\n2:1:1 ratio with added electrolytes. One scoop in 500ml water, sipped through the session.",
    coinsGranted: 30,
    variants: [
      { name: "Green Apple · 400g", attributes: { flavour: "Green Apple", size: "400g" }, price: 1599, stock: 15 },
      { name: "Lemon Ice · 400g", attributes: { flavour: "Lemon Ice", size: "400g" }, price: 1599, stock: 3 },
    ],
  },
  {
    name: "Omega-3 Fish Oil",
    category: "SUPPLEMENT",
    description: "1000mg softgels, 60 to a bottle.",
    markdown:
      "## Omega-3 Fish Oil\n\nTwo softgels a day with a meal. Molecularly distilled, so there is no aftertaste.",
    coinsGranted: 15,
    variants: [
      { name: "60 softgels", attributes: { count: "60" }, price: 699, stock: 26 },
      { name: "120 softgels", attributes: { count: "120" }, price: 1249, stock: 18 },
    ],
  },
  {
    name: "Shaker Bottle",
    category: "ACCESSORY",
    description: "700ml, leak-proof lid, steel mixing ball.",
    markdown: "## Shaker Bottle\n\n700ml with a steel mixing ball. Dishwasher safe, and the lid actually seals.",
    coinsGranted: 5,
    variants: [
      { name: "Black", attributes: { colour: "Black" }, price: 349, stock: 40 },
      { name: "Blue", attributes: { colour: "Blue" }, price: 349, stock: 22 },
      { name: "Red", attributes: { colour: "Red" }, price: 349, stock: 0 },
    ],
  },
  {
    name: "Lifting Gloves",
    category: "ACCESSORY",
    description: "Padded palm with an integrated wrist wrap.",
    markdown:
      "## Lifting Gloves\n\nPadded palm, half-finger, integrated wrist wrap. Sized by hand width — ask at the counter if you are unsure.",
    coinsGranted: 10,
    variants: [
      { name: "Small", attributes: { size: "S" }, price: 599, stock: 9 },
      { name: "Medium", attributes: { size: "M" }, price: 599, stock: 16 },
      { name: "Large", attributes: { size: "L" }, price: 649, stock: 11 },
      { name: "Extra Large", attributes: { size: "XL" }, price: 649, stock: 4 },
    ],
  },
  {
    name: "Lever Lifting Belt",
    category: "ACCESSORY",
    description: "10mm leather, for squats and deadlifts above bodyweight.",
    markdown:
      "## Lever Lifting Belt\n\n10mm full-grain leather with a lever buckle. Measure at the navel, not at the trouser waist — belts run one size small.",
    coinsGranted: 50,
    variants: [
      { name: "Medium · 32-36in", attributes: { size: "M" }, price: 2499, stock: 6 },
      { name: "Large · 36-40in", attributes: { size: "L" }, price: 2499, stock: 7 },
      { name: "Extra Large · 40-44in", attributes: { size: "XL" }, price: 2599, stock: 2 },
    ],
  },
  {
    name: "Wrist Straps",
    category: "ACCESSORY",
    description: "Cotton, 60cm. For when grip fails before the back does.",
    markdown: "## Wrist Straps\n\n60cm cotton with a neoprene pad. Sold in pairs.",
    coinsGranted: 5,
    variants: [{ name: "One size", attributes: { size: "One size" }, price: 399, stock: 28 }],
  },
  {
    name: "Resistance Band Set",
    category: "ACCESSORY",
    description: "Five bands, 5kg to 30kg, with a door anchor.",
    markdown:
      "## Resistance Band Set\n\nFive latex loops from 5kg to 30kg, plus handles, ankle straps, and a door anchor. Fits in a kit bag.",
    coinsGranted: 20,
    variants: [{ name: "Set of 5", attributes: { pack: "5" }, price: 1199, stock: 13 }],
  },
  {
    name: "Gym Towel",
    category: "ACCESSORY",
    description: "Microfibre, quick-dry. Wipe the bench down.",
    markdown: "## Gym Towel\n\n80x40cm microfibre. Dries in about an hour.",
    coinsGranted: 5,
    variants: [
      { name: "Grey", attributes: { colour: "Grey" }, price: 299, stock: 35 },
      { name: "Navy", attributes: { colour: "Navy" }, price: 299, stock: 19 },
    ],
  },
];

// ─── Media ────────────────────────────────────────────────────────────────────

/**
 * Three placards per product, so the photo strip in `ProductMedia` has
 * something to page through.
 *
 * Deliberately generated placards rather than stock photography: a random
 * landscape on a tub of protein reads as a broken catalogue, while a labelled
 * card reads as a gym that has not uploaded its photos yet — which is exactly
 * what a seeded shop is. Replace them from the admin screen and the real R2
 * urls take over with no code change.
 */
function photosFor(name) {
  const palette = ["1f2937/f9fafb", "0f766e/ecfdf5", "7c2d12/fff7ed"];
  return ["", " Label", " In use"].map((suffix, index) => {
    const text = encodeURIComponent(name + suffix).replace(/%20/g, "+");
    return "https://placehold.co/800x800/" + palette[index] + "?text=" + text;
  });
}

/**
 * Demo videos.
 *
 * These ids are placeholders. Swap them for the gym's own footage — or clear
 * them — before showing this to anyone: nothing here checks that a video still
 * exists, and a dead embed looks worse than no video at all.
 */
const DEMO_VIDEO = {
  "Whey Protein Isolate": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "Creatine Monohydrate": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "Lever Lifting Belt": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "Resistance Band Set": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
};

// ─── SQL generation ───────────────────────────────────────────────────────────

/** Doubling the single quote is the only escape a SQLite string literal needs. */
function q(value) {
  if (value === null || value === undefined) return "NULL";
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildSql(tenantId) {
  const now = new Date().toISOString();
  const idPrefix = "seedstore_" + tenantId + "_";

  const statements = [
    "-- Generated by scripts/seed-store.mjs. Safe to re-run: it replaces its own rows.",
    // Variants first. Deleting the products would cascade to them anyway, but
    // being explicit keeps this readable when someone runs the file by hand.
    'DELETE FROM "StoreVariant" WHERE "productId" IN (SELECT "id" FROM "StoreProduct" WHERE "tenantId" = ' +
      q(tenantId) +
      ' AND "id" LIKE ' +
      q(idPrefix + "%") +
      ");",
    'DELETE FROM "StoreProduct" WHERE "tenantId" = ' +
      q(tenantId) +
      ' AND "id" LIKE ' +
      q(idPrefix + "%") +
      ";",
  ];

  for (const product of CATALOGUE) {
    const productId = idPrefix + slug(product.name);

    statements.push(
      'INSERT INTO "StoreProduct" ("id","tenantId","name","description","markdown","category","photos","videoUrl","coinsGranted","isActive","createdAt","updatedAt") VALUES (' +
        [
          q(productId),
          q(tenantId),
          q(product.name),
          q(product.description),
          q(product.markdown),
          q(product.category),
          q(JSON.stringify(photosFor(product.name))),
          q(DEMO_VIDEO[product.name] ?? null),
          product.coinsGranted,
          1,
          q(now),
          q(now),
        ].join(",") +
        ");",
    );

    for (const variant of product.variants) {
      const sku = slug(product.name).toUpperCase().slice(0, 8) + "-" + slug(variant.name).toUpperCase();

      statements.push(
        'INSERT INTO "StoreVariant" ("id","productId","name","attributes","sku","price","stock","isActive","createdAt","updatedAt") VALUES (' +
          [
            q(productId + "_" + slug(variant.name)),
            q(productId),
            q(variant.name),
            q(JSON.stringify(variant.attributes)),
            q(sku),
            variant.price,
            variant.stock,
            1,
            q(now),
            q(now),
          ].join(",") +
          ");",
      );
    }
  }

  return statements.join("\n") + "\n";
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const tenantArgIndex = args.findIndex((arg) => arg === "--tenant" || arg === "-t");
const tenantSlug = tenantArgIndex >= 0 ? args[tenantArgIndex + 1] : null;

if (!tenantSlug) {
  console.error("Usage: node scripts/seed-store.mjs --tenant <slug> [--remote]");
  console.error("       The slug is the gym's subdomain, e.g. rudra-gym.");
  process.exit(1);
}

const wranglerCli = resolveWranglerCli();
if (!wranglerCli) {
  console.error("Wrangler CLI not found. Run `pnpm install` first.");
  process.exit(1);
}

/** Run one d1 execute and hand back whatever wrangler printed. */
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
    { cwd: rootDir, encoding: "utf8" },
  );

  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }

  return result.stdout;
}

// Every row hangs off the tenant id, and that is not the slug — look it up
// rather than making the caller go and find it.
const lookup = d1(["--command", 'SELECT id FROM "Tenant" WHERE slug = ' + q(tenantSlug)]);
const tenantId = (() => {
  try {
    const parsed = JSON.parse(lookup.slice(lookup.indexOf("[")));
    return parsed?.[0]?.results?.[0]?.id ?? null;
  } catch {
    return null;
  }
})();

if (!tenantId) {
  console.error(
    'No gym found with slug "' + tenantSlug + '" in the ' + (remote ? "remote" : "local") + " database.",
  );
  process.exit(1);
}

const outFile = path.join(rootDir, ".wrangler", "tmp", "seed-store.sql");
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, buildSql(tenantId), "utf8");

const variantCount = CATALOGUE.reduce((sum, product) => sum + product.variants.length, 0);
console.log(
  "Seeding " +
    CATALOGUE.length +
    " products (" +
    variantCount +
    ' variants) into "' +
    tenantSlug +
    '" (' +
    tenantId +
    "), " +
    (remote ? "remote" : "local") +
    "...",
);

d1(["--file", outFile], { json: false });

console.log("Done. Re-run this command any time to reset the shop to this catalogue.");
