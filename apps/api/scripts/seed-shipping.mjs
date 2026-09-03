/**
 * Documentation: Dummy shipping, returns and refunds data.
 *
 * - The deterministic seeder predates courier shipping: it fills products and orders, but every order it makes is PENDING with no parcel, no return and no warehouse behind it. Walking the fulfilment screens then means placing and paying for orders by hand, one state at a time.
 * - This fills that gap on its own rather than growing that script, because these rows are demo dressing and should be droppable without touching members, payments or attendance. Everything it writes carries a `seed-ship-` id, and re-running deletes those rows first, so it replaces rather than stacks.
 * - Warehouses are left unregistered on purpose, and named in plain ASCII because Delhivery matches a pickup location character for character. Dummy data must not be able to manifest a real consignment, and an app that refuses first — naming the screen that fixes it — is more use than a courier refusal nobody expected. Add a real pickup location through Commerce → Warehouses to book anything.
 * - Local only. There is no `--remote`: dummy orders, refunds and returns have no business in a database that serves real buyers.
 * - Usage: `npm run seed:shipping --workspace @fitconnect/api`
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(rootDir, "..", "..");

/** Every seeded row starts with this, which is also how they are cleaned up. */
const PREFIX = "seed-ship-";

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

/** SQL string literal. Nothing here comes from user input, but quoting is free. */
function q(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function iso(date) {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

const now = new Date();
function daysAgo(days, hours = 10) {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  date.setHours(hours, 0, 0, 0);
  return date;
}
function daysAhead(days) {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return date;
}

// ─── Warehouses ───────────────────────────────────────────────────────────────
//
// Two of them, at different pincodes, because a basket drawing on both is where
// per-warehouse pricing stops being theory. Neither is registered with Delhivery:
// dummy data must not be able to manifest a real consignment, and the app saying
// so plainly beats a courier refusal nobody expected.

const WAREHOUSES = [
  {
    id: `${PREFIX}wh-bakhri`,
    name: "FitConnect Bakhri",
    contactPerson: "Seed Operator",
    phone: "9876543210",
    email: "warehouse.bakhri@seed.gym.test",
    address: "Shop 4, Main Road, Bakhri Bazar",
    city: "Bakhri",
    state: "BR",
    pincode: "848201",
    isDefault: 1,
    isActive: 1,
    // Deliberately NOT registered. Claiming otherwise would let "Book courier"
    // fire a real manifest against a name Delhivery has never heard of, and the
    // refusal that came back would read as a bug in the app. Unregistered, the
    // app refuses first and says exactly which screen fixes it.
    registeredAt: null,
    registerError:
      "Seeded for testing — this warehouse was never sent to Delhivery. Add your real pickup location under Commerce → Warehouses to book an actual consignment.",
  },
  {
    id: `${PREFIX}wh-delhi`,
    name: "FitConnect Delhi",
    contactPerson: "Seed Operator",
    phone: "9812345678",
    email: "warehouse.delhi@seed.gym.test",
    address: "Unit 12, Okhla Industrial Estate Phase 3",
    city: "New Delhi",
    state: "DL",
    pincode: "110020",
    isDefault: 0,
    isActive: 1,
    registeredAt: null,
    registerError: "Seeded for testing — this warehouse was never sent to Delhivery.",
  },
];

// ─── Products ─────────────────────────────────────────────────────────────────
//
// Four, so a basket can be built that draws on one warehouse, both, or the
// default. Weights are deliberately uneven: a catalogue where everything weighs
// the same hides the fact that carriage is priced per parcel.

const PHOTO =
  "https://fit-api.koshimicrosystem.workers.dev/uploads/file/products/1f2c2737-42fa-41e7-becf-770775c68e72.jpg";

const PRODUCTS = [
  {
    id: `${PREFIX}prod-shaker`,
    name: "Test Shaker Bottle",
    description: "700ml shaker with a steel mixing ball.",
    category: "Accessories",
    price: 249,
    stock: 120,
    minOrderQty: 1,
    maxOrderQty: 10,
    weightGrams: 250,
    // Small box: mass decides the price.
    lengthCm: 12, widthCm: 12, heightCm: 22,
    warehouseId: `${PREFIX}wh-bakhri`,
  },
  {
    id: `${PREFIX}prod-bands`,
    name: "Test Resistance Band Set",
    description: "Five bands, 5kg to 25kg resistance.",
    category: "Equipment",
    price: 899,
    stock: 60,
    minOrderQty: 1,
    maxOrderQty: 5,
    weightGrams: 400,
    lengthCm: 20, widthCm: 15, heightCm: 8,
    warehouseId: `${PREFIX}wh-bakhri`,
  },
  {
    id: `${PREFIX}prod-mat`,
    name: "Test Yoga Mat",
    description: "6mm TPE mat, 183 x 61 cm.",
    category: "Equipment",
    price: 1299,
    stock: 40,
    minOrderQty: 1,
    maxOrderQty: 3,
    // Heavy and shipped from the other warehouse: a basket with this and a
    // shaker is two parcels, priced from two origins.
    weightGrams: 1200,
    // 61 x 15 x 15 rolled = 13,725 cm3 = 2.75kg volumetric against 1.2kg actual.
    // The case volumetric pricing exists for.
    lengthCm: 61, widthCm: 15, heightCm: 15,
    warehouseId: `${PREFIX}wh-delhi`,
  },
  {
    id: `${PREFIX}prod-whey`,
    name: "Test Whey Protein 1kg",
    description: "Unflavoured concentrate, 1kg pouch.",
    category: "Supplements",
    price: 2199,
    stock: 25,
    minOrderQty: 1,
    maxOrderQty: 4,
    weightGrams: 1050,
    lengthCm: 18, widthCm: 18, heightCm: 26,
    // No warehouse: falls back to the default, which is the path most products
    // in a real catalogue take.
    warehouseId: null,
  },
];

const GST_RATE = 18;

/** An order line, priced the way the API prices one. */
function line(productId, quantity) {
  const product = PRODUCTS.find((entry) => entry.id === productId);
  return {
    productId,
    productName: product.name,
    quantity,
    unitPrice: product.price,
    lineTotal: product.price * quantity,
  };
}

/** A courier scan history, newest first, the way tracking stores it. */
function scans(entries) {
  return JSON.stringify(
    entries.map(([status, detail, location, day]) => ({
      status,
      detail,
      location,
      scannedAt: iso(daysAgo(day, 9)),
    })),
  );
}

// ─── Orders ───────────────────────────────────────────────────────────────────
//
// One per state worth looking at, rather than a hundred of the same. Between
// them they cover every button on the fulfilment screens: an order waiting to be
// booked, one in transit, one delivered inside its return window, a return
// awaiting a decision, a return already refunded, a cancellation, and an order
// that ships as two parcels.

const ORDERS = [
  {
    id: `${PREFIX}ord-1-pending`,
    label: "unpaid, nothing booked",
    buyer: ["Anita Sharma", "anita@seed.gym.test", "9800000001"],
    address: ["12 MG Road, Indiranagar", "Bangalore", "KA", "560001"],
    status: "PENDING",
    paymentStatus: "PENDING",
    items: [line(`${PREFIX}prod-shaker`, 2)],
    shippingAmount: 79,
    createdDaysAgo: 1,
  },
  {
    id: `${PREFIX}ord-2-confirmed`,
    label: "paid, waiting for a courier",
    buyer: ["Rahul Verma", "rahul@seed.gym.test", "9800000002"],
    address: ["44 Park Street", "Kolkata", "WB", "700016"],
    status: "CONFIRMED",
    paymentStatus: "COMPLETED",
    items: [line(`${PREFIX}prod-bands`, 1)],
    shippingAmount: 92,
    createdDaysAgo: 2,
    paidDaysAgo: 2,
    confirmedDaysAgo: 2,
  },
  {
    id: `${PREFIX}ord-3-transit`,
    label: "in transit, one parcel",
    buyer: ["Priya Nair", "priya@seed.gym.test", "9800000003"],
    address: ["7 Marine Drive", "Mumbai", "MH", "400020"],
    status: "IN_TRANSIT",
    paymentStatus: "COMPLETED",
    items: [line(`${PREFIX}prod-shaker`, 3)],
    shippingAmount: 88,
    createdDaysAgo: 5,
    paidDaysAgo: 5,
    confirmedDaysAgo: 5,
    shippedDaysAgo: 4,
    shipments: [
      {
        id: `${PREFIX}shp-3`,
        warehouseId: `${PREFIX}wh-bakhri`,
        waybill: "TEST10000000003",
        status: "IN_TRANSIT",
        statusDetail: "In Transit",
        currentLocation: "Patna_Gateway (Bihar)",
        estimatedDeliveryDaysAhead: 2,
        scans: scans([
          ["UD", "In Transit", "Patna_Gateway (Bihar)", 1],
          ["UD", "Shipment picked up", "Begusarai_DC (Bihar)", 4],
          ["Manifested", "Consignment Manifested", "Begusarai_DC (Bihar)", 4],
        ]),
      },
    ],
  },
  {
    id: `${PREFIX}ord-4-delivered`,
    label: "delivered, return window open",
    buyer: ["Vikram Singh", "vikram@seed.gym.test", "9800000004"],
    address: ["9 Sector 17", "Chandigarh", "CH", "160017"],
    status: "DELIVERED",
    paymentStatus: "COMPLETED",
    items: [line(`${PREFIX}prod-whey`, 1)],
    shippingAmount: 110,
    createdDaysAgo: 9,
    paidDaysAgo: 9,
    confirmedDaysAgo: 9,
    shippedDaysAgo: 8,
    deliveredDaysAgo: 3,
    shipments: [
      {
        id: `${PREFIX}shp-4`,
        warehouseId: `${PREFIX}wh-bakhri`,
        waybill: "TEST10000000004",
        status: "DELIVERED",
        statusDetail: "Delivered",
        currentLocation: "Chandigarh_DC (Chandigarh)",
        scans: scans([
          ["Delivered", "Delivered to consignee", "Chandigarh_DC (Chandigarh)", 3],
          ["UD", "Out for delivery", "Chandigarh_DC (Chandigarh)", 3],
          ["UD", "In Transit", "Delhi_Hub (Delhi)", 6],
          ["Manifested", "Consignment Manifested", "Begusarai_DC (Bihar)", 8],
        ]),
      },
    ],
  },
  {
    id: `${PREFIX}ord-5-return-requested`,
    label: "return awaiting a decision",
    buyer: ["Meera Iyer", "meera@seed.gym.test", "9800000005"],
    address: ["21 Anna Salai", "Chennai", "TN", "600002"],
    status: "DELIVERED",
    paymentStatus: "COMPLETED",
    items: [line(`${PREFIX}prod-mat`, 1)],
    shippingAmount: 165,
    createdDaysAgo: 12,
    paidDaysAgo: 12,
    confirmedDaysAgo: 12,
    shippedDaysAgo: 11,
    deliveredDaysAgo: 4,
    shipments: [
      {
        id: `${PREFIX}shp-5`,
        warehouseId: `${PREFIX}wh-delhi`,
        waybill: "TEST10000000005",
        status: "DELIVERED",
        statusDetail: "Delivered",
        currentLocation: "Chennai_DC (Tamil Nadu)",
        scans: scans([
          ["Delivered", "Delivered to consignee", "Chennai_DC (Tamil Nadu)", 4],
          ["UD", "In Transit", "Chennai_Hub (Tamil Nadu)", 6],
          ["Manifested", "Consignment Manifested", "Delhi_Okhla_DC (Delhi)", 11],
        ]),
      },
    ],
    returns: [
      {
        id: `${PREFIX}ret-5`,
        status: "REQUESTED",
        reason: "DAMAGED",
        comment: "The mat arrived with a tear along one edge.",
        createdDaysAgo: 2,
      },
    ],
  },
  {
    id: `${PREFIX}ord-6-returned`,
    label: "returned and refunded",
    buyer: ["Arjun Das", "arjun@seed.gym.test", "9800000006"],
    address: ["3 Residency Road", "Hyderabad", "TG", "500001"],
    status: "RETURNED",
    paymentStatus: "REFUNDED",
    items: [line(`${PREFIX}prod-bands`, 2)],
    shippingAmount: 96,
    createdDaysAgo: 25,
    paidDaysAgo: 25,
    confirmedDaysAgo: 25,
    shippedDaysAgo: 24,
    deliveredDaysAgo: 18,
    refundedDaysAgo: 9,
    shipments: [
      {
        id: `${PREFIX}shp-6-fwd`,
        warehouseId: `${PREFIX}wh-bakhri`,
        waybill: "TEST10000000006",
        status: "DELIVERED",
        statusDetail: "Delivered",
        currentLocation: "Hyderabad_DC (Telangana)",
        scans: scans([["Delivered", "Delivered to consignee", "Hyderabad_DC (Telangana)", 18]]),
      },
      {
        id: `${PREFIX}shp-6-rev`,
        warehouseId: `${PREFIX}wh-bakhri`,
        kind: "REVERSE",
        waybill: "TEST20000000006",
        status: "DELIVERED",
        statusDetail: "Returned to origin",
        currentLocation: "Begusarai_DC (Bihar)",
        scans: scans([
          ["Delivered", "Return received at origin", "Begusarai_DC (Bihar)", 9],
          ["UD", "Return picked up", "Hyderabad_DC (Telangana)", 13],
        ]),
      },
    ],
    returns: [
      {
        id: `${PREFIX}ret-6`,
        status: "REFUNDED",
        reason: "SIZE_OR_FIT",
        comment: "Bands are lighter than expected.",
        shipmentId: `${PREFIX}shp-6-rev`,
        decisionNote: "Approved — unopened packaging.",
        decidedDaysAgo: 14,
        refundedDaysAgo: 9,
        createdDaysAgo: 15,
      },
    ],
  },
  {
    id: `${PREFIX}ord-7-cancelled`,
    label: "cancelled before dispatch, refunded",
    buyer: ["Neha Gupta", "neha@seed.gym.test", "9800000007"],
    address: ["55 Civil Lines", "Jaipur", "RJ", "302006"],
    status: "CANCELLED",
    paymentStatus: "REFUNDED",
    items: [line(`${PREFIX}prod-whey`, 2)],
    shippingAmount: 130,
    createdDaysAgo: 6,
    paidDaysAgo: 6,
    confirmedDaysAgo: 6,
    cancelledDaysAgo: 5,
    cancelReason: "Cancelled by the buyer",
    refundedDaysAgo: 5,
  },
  {
    id: `${PREFIX}ord-8-split`,
    label: "two parcels, two warehouses",
    buyer: ["Sanjay Rao", "sanjay@seed.gym.test", "9800000008"],
    address: ["18 Brigade Road", "Bangalore", "KA", "560025"],
    status: "SHIPPED",
    paymentStatus: "COMPLETED",
    // One item from each warehouse — the case the whole grouping exists for.
    items: [line(`${PREFIX}prod-shaker`, 1), line(`${PREFIX}prod-mat`, 1)],
    shippingAmount: 246,
    createdDaysAgo: 3,
    paidDaysAgo: 3,
    confirmedDaysAgo: 3,
    shippedDaysAgo: 2,
    shipments: [
      {
        id: `${PREFIX}shp-8-a`,
        warehouseId: `${PREFIX}wh-bakhri`,
        waybill: "TEST10000000008",
        status: "MANIFESTED",
        statusDetail: "Consignment Manifested",
        scans: scans([["Manifested", "Consignment Manifested", "Begusarai_DC (Bihar)", 2]]),
      },
      {
        id: `${PREFIX}shp-8-b`,
        warehouseId: `${PREFIX}wh-delhi`,
        waybill: "TEST10000000009",
        status: "IN_TRANSIT",
        statusDetail: "In Transit",
        currentLocation: "Delhi_Hub (Delhi)",
        estimatedDeliveryDaysAhead: 3,
        scans: scans([
          ["UD", "In Transit", "Delhi_Hub (Delhi)", 1],
          ["Manifested", "Consignment Manifested", "Delhi_Okhla_DC (Delhi)", 2],
        ]),
      },
    ],
  },
];

// ─── SQL ──────────────────────────────────────────────────────────────────────

function buildSql() {
  const statements = [];

  // Cleanup first, children before parents. Everything seeded carries the id
  // prefix, so nothing hand-made or genuinely bought is touched.
  statements.push(
    `DELETE FROM "ReturnRequest" WHERE id LIKE '${PREFIX}%';`,
    `DELETE FROM "Shipment" WHERE id LIKE '${PREFIX}%';`,
    `DELETE FROM "OrderItem" WHERE id LIKE '${PREFIX}%';`,
    `DELETE FROM "Order" WHERE id LIKE '${PREFIX}%';`,
    `UPDATE "Product" SET "warehouseId" = NULL WHERE "warehouseId" LIKE '${PREFIX}%';`,
    `DELETE FROM "Product" WHERE id LIKE '${PREFIX}%';`,
    `DELETE FROM "PickupRequest" WHERE "warehouseId" LIKE '${PREFIX}%';`,
    `DELETE FROM "Warehouse" WHERE id LIKE '${PREFIX}%';`,
  );

  for (const warehouse of WAREHOUSES) {
    statements.push(
      `INSERT INTO "Warehouse" (id, name, "contactPerson", phone, email, address, city, state, pincode, "isDefault", "isActive", "registeredAt", "registerError", "createdAt", "updatedAt") VALUES (${[
        q(warehouse.id),
        q(warehouse.name),
        q(warehouse.contactPerson),
        q(warehouse.phone),
        q(warehouse.email),
        q(warehouse.address),
        q(warehouse.city),
        q(warehouse.state),
        q(warehouse.pincode),
        warehouse.isDefault,
        warehouse.isActive,
        q(warehouse.registeredAt),
        q(warehouse.registerError),
        q(iso(daysAgo(30))),
        q(iso(now)),
      ].join(", ")});`,
    );
  }

  // A seeded default would otherwise sit beside one somebody already set.
  statements.push(
    `UPDATE "Warehouse" SET "isDefault" = 0 WHERE id NOT LIKE '${PREFIX}%' AND "isDefault" = 1;`,
  );

  for (const product of PRODUCTS) {
    statements.push(
      `INSERT INTO "Product" (id, name, description, markdown, photos, category, price, stock, "minOrderQty", "maxOrderQty", "weightGrams", "lengthCm", "widthCm", "heightCm", "warehouseId", "isActive", "createdAt", "updatedAt") VALUES (${[
        q(product.id),
        q(product.name),
        q(product.description),
        "NULL",
        q(JSON.stringify([PHOTO])),
        q(product.category),
        product.price,
        product.stock,
        product.minOrderQty,
        product.maxOrderQty,
        product.weightGrams,
        product.lengthCm,
        product.widthCm,
        product.heightCm,
        q(product.warehouseId),
        1,
        q(iso(daysAgo(30))),
        q(iso(now)),
      ].join(", ")});`,
    );
  }

  for (const order of ORDERS) {
    const [buyerName, buyerEmail, buyerPhone] = order.buyer;
    const [address, city, state, pincode] = order.address;
    const subtotal = order.items.reduce((sum, item) => sum + item.lineTotal, 0);
    const gst = Math.round((subtotal * GST_RATE) / 100);
    const total = subtotal + gst + order.shippingAmount;
    const createdAt = iso(daysAgo(order.createdDaysAgo));

    const stamp = (days) => (days === undefined ? "NULL" : q(iso(daysAgo(days))));

    statements.push(
      `INSERT INTO "Order" (id, "userId", "buyerName", "buyerEmail", "buyerPhone", "buyerAddress", "buyerCity", "buyerState", "buyerPincode", status, "subtotalAmount", "gstRatePct", "gstAmount", "shippingAmount", "totalAmount", "paymentStatus", "gatewayOrderId", "gatewayPaymentId", "paidAt", "gatewayRefundId", "refundAmount", "refundedAt", "confirmedAt", "shippedAt", "deliveredAt", "cancelledAt", "cancelReason", "createdAt", "updatedAt") VALUES (${[
        q(order.id),
        "NULL",
        q(buyerName),
        q(buyerEmail),
        q(buyerPhone),
        q(address),
        q(city),
        q(state),
        q(pincode),
        q(order.status),
        subtotal,
        GST_RATE,
        gst,
        order.shippingAmount,
        total,
        q(order.paymentStatus),
        order.paymentStatus === "PENDING" ? "NULL" : q(`order_TEST${order.id.slice(-6)}`),
        order.paymentStatus === "PENDING" ? "NULL" : q(`pay_TEST${order.id.slice(-6)}`),
        stamp(order.paidDaysAgo),
        order.paymentStatus === "REFUNDED" ? q(`rfnd_TEST${order.id.slice(-6)}`) : "NULL",
        order.paymentStatus === "REFUNDED" ? total : "NULL",
        stamp(order.refundedDaysAgo),
        stamp(order.confirmedDaysAgo),
        stamp(order.shippedDaysAgo),
        stamp(order.deliveredDaysAgo),
        stamp(order.cancelledDaysAgo),
        q(order.cancelReason ?? null),
        q(createdAt),
        q(iso(now)),
      ].join(", ")});`,
    );

    order.items.forEach((item, index) => {
      statements.push(
        `INSERT INTO "OrderItem" (id, "orderId", "productId", "productName", quantity, "unitPrice", "lineTotal", "createdAt") VALUES (${[
          q(`${order.id}-item-${index + 1}`),
          q(order.id),
          q(item.productId),
          q(item.productName),
          item.quantity,
          item.unitPrice,
          item.lineTotal,
          q(createdAt),
        ].join(", ")});`,
      );
    });

    for (const shipment of order.shipments ?? []) {
      statements.push(
        `INSERT INTO "Shipment" (id, "orderId", "warehouseId", provider, kind, waybill, status, "statusDetail", "currentLocation", "pickupLocation", "estimatedDeliveryAt", scans, "lastSyncedAt", "createdAt", "updatedAt") VALUES (${[
          q(shipment.id),
          q(order.id),
          q(shipment.warehouseId),
          q("DELHIVERY"),
          q(shipment.kind ?? "FORWARD"),
          q(shipment.waybill),
          q(shipment.status),
          q(shipment.statusDetail ?? null),
          q(shipment.currentLocation ?? null),
          q(WAREHOUSES.find((entry) => entry.id === shipment.warehouseId)?.name ?? null),
          shipment.estimatedDeliveryDaysAhead
            ? q(iso(daysAhead(shipment.estimatedDeliveryDaysAhead)))
            : "NULL",
          q(shipment.scans ?? "[]"),
          q(iso(now)),
          q(createdAt),
          q(iso(now)),
        ].join(", ")});`,
      );
    }

    for (const entry of order.returns ?? []) {
      statements.push(
        `INSERT INTO "ReturnRequest" (id, "orderId", status, reason, comment, "shipmentId", "decidedById", "decidedAt", "decisionNote", "refundAmount", "refundedAt", "createdAt", "updatedAt") VALUES (${[
          q(entry.id),
          q(order.id),
          q(entry.status),
          q(entry.reason),
          q(entry.comment ?? null),
          q(entry.shipmentId ?? null),
          "NULL",
          stamp(entry.decidedDaysAgo),
          q(entry.decisionNote ?? null),
          entry.status === "REFUNDED" ? total : "NULL",
          stamp(entry.refundedDaysAgo),
          q(iso(daysAgo(entry.createdDaysAgo))),
          q(iso(now)),
        ].join(", ")});`,
      );
    }
  }

  return `${statements.join("\n")}\n`;
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const wranglerCli = resolveWranglerCli();
if (!wranglerCli) {
  console.error("Wrangler CLI not found. Run `npm install` first.");
  process.exit(1);
}

if (process.argv.includes("--remote")) {
  console.error("This seeder is local only. Dummy orders and refunds do not belong in a live database.");
  process.exit(1);
}

const outFile = path.join(rootDir, ".wrangler", "tmp", "seed-shipping.sql");
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, buildSql(), "utf8");

console.log(
  `Seeding ${WAREHOUSES.length} warehouses, ${PRODUCTS.length} products and ${ORDERS.length} orders into the local database…`,
);

const result = spawnSync(
  process.execPath,
  [wranglerCli, "d1", "execute", "fit-db", "--local", "--file", outFile],
  { cwd: rootDir, encoding: "utf8" },
);

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

console.log("\nSeeded orders:");
for (const order of ORDERS) {
  console.log(`  ${order.id}  —  ${order.label}`);
}
console.log(
  "\nWarehouses are not registered with Delhivery, so" +
    "\nbooking a courier is refused with a message pointing at Commerce → Warehouses." +
    "\nAdd your real pickup location there to book an actual consignment.",
);
