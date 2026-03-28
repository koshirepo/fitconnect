/**
 * Documentation: Legacy tenant CSV importer.
 *
 * - Imports one tenant, members, operator accounts, shifts, subscriptions, and payments
 *   into the local Wrangler D1 sqlite database from legacy CSV exports.
 * - Designed for one-off migrations from older gym-management systems where members and
 *   payments are available as separate CSV files keyed by legacy admission number.
 * - Primary usage:
 *   `node scripts/import-legacy-tenant.mjs --members-file=... --payments-file=...`
 */
import bcrypt from "bcryptjs";
import { createHash, createHmac } from "node:crypto";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.basename(scriptDir).toLowerCase() === "scripts" ? path.resolve(scriptDir, "..") : scriptDir;
const wranglerConfigPath = path.join(rootDir, "wrangler.toml");
const localD1Path = path.join(
  rootDir,
  ".wrangler",
  "state",
  "v3",
  "d1",
  "miniflare-D1DatabaseObject",
);
const MINIFLARE_D1_UNIQUE_KEY = "miniflare-D1DatabaseObject";
const DEFAULT_PASSWORD = "Test@1234";
const DEFAULTS = {
  tenantName: "Rudra Gym",
  tenantSlug: "rudra-gym",
  database: null,
  membersFile: null,
  paymentsFile: null,
  replace: false,
  password: DEFAULT_PASSWORD,
};

function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      throw new Error(`Unsupported argument: ${arg}`);
    }

    const trimmed = arg.slice(2);
    const separatorIndex = trimmed.indexOf("=");
    const rawKey = separatorIndex === -1 ? trimmed : trimmed.slice(0, separatorIndex);
    const rawValue = separatorIndex === -1 ? undefined : trimmed.slice(separatorIndex + 1);

    if (rawKey === "replace") {
      options.replace = rawValue === undefined ? true : rawValue === "true";
      continue;
    }

    if (!rawValue) {
      throw new Error(`Expected a value for --${rawKey}`);
    }

    switch (rawKey) {
      case "members-file":
        options.membersFile = rawValue;
        break;
      case "payments-file":
        options.paymentsFile = rawValue;
        break;
      case "tenant-name":
        options.tenantName = rawValue;
        break;
      case "tenant-slug":
        options.tenantSlug = rawValue;
        break;
      case "database":
        options.database = rawValue;
        break;
      case "password":
        options.password = rawValue;
        break;
      default:
        throw new Error(`Unknown option: --${rawKey}`);
    }
  }

  if (!options.membersFile) {
    throw new Error("Pass --members-file=<path to members csv>.");
  }
  if (!options.paymentsFile) {
    throw new Error("Pass --payments-file=<path to payments csv>.");
  }

  return {
    ...options,
    membersFile: path.resolve(options.membersFile),
    paymentsFile: path.resolve(options.paymentsFile),
  };
}

function parseWranglerD1Config() {
  if (!existsSync(wranglerConfigPath)) {
    throw new Error("wrangler.toml was not found.");
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

    if (!current) continue;

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

function durableObjectNamespaceIdFromName(uniqueKey, name) {
  const key = createHash("sha256").update(uniqueKey).digest();
  const nameHmac = createHmac("sha256", key).update(name).digest().subarray(0, 16);
  const hmac = createHmac("sha256", key).update(nameHmac).digest().subarray(0, 16);
  return Buffer.concat([nameHmac, hmac]).toString("hex");
}

function resolveLocalDatabasePath(cliValue) {
  const entries = parseWranglerD1Config();
  if (entries.length === 0) {
    throw new Error("No [[d1_databases]] entries were found in wrangler.toml.");
  }

  const match = cliValue
    ? entries.find((entry) => entry.databaseName === cliValue || entry.binding === cliValue)
    : entries[0];

  if (!match) {
    throw new Error(`Could not find a local D1 binding matching "${cliValue}" in wrangler.toml.`);
  }

  const namespace = match.previewDatabaseId ?? match.databaseId ?? match.binding;
  const durableObjectId = durableObjectNamespaceIdFromName(MINIFLARE_D1_UNIQUE_KEY, namespace);
  const dbPath = path.join(localD1Path, `${durableObjectId}.sqlite`);

  if (!existsSync(dbPath)) {
    throw new Error(`Local D1 sqlite file not found: ${dbPath}`);
  }

  return dbPath;
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const [headerRow, ...dataRows] = rows.filter((item) => item.some((value) => value.trim() !== ""));
  if (!headerRow) return [];

  return dataRows.map((dataRow) => {
    const record = {};
    headerRow.forEach((header, index) => {
      record[header.trim()] = (dataRow[index] ?? "").trim();
    });
    return record;
  });
}

function parseLegacyDate(value) {
  if (!value?.trim()) return null;

  const match = value.trim().match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!match) return null;

  const [, monthText, dayText, yearText, hourText = "0", minuteText = "0", secondText = "0"] = match;
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  const rawYear = Number.parseInt(yearText, 10);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);
  const second = Number.parseInt(secondText, 10);

  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

function iso(value) {
  return value ? value.toISOString() : null;
}

function normalizePhone(rawValue) {
  const digits = (rawValue ?? "").replace(/\D/g, "");
  if (!digits || digits === "0") return null;
  if (digits.length >= 10) return digits.slice(-10);
  return null;
}

function normalizeEmail(rawValue) {
  const value = (rawValue ?? "").trim().toLowerCase();
  if (!value) return null;
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) {
    return null;
  }
  return value;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function titleFromEmail(email) {
  const localPart = email.split("@")[0] ?? "staff";
  return localPart
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function chooseModalAmount(values) {
  const counts = new Map();
  for (const amount of values) {
    counts.set(amount, (counts.get(amount) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return right[0] - left[0];
    })[0]?.[0] ?? 0;
}

function subscriptionMeta(label) {
  switch (label) {
    case "1 Month":
      return { title: "1 Month", durationDays: 30, isActive: true };
    case "1 Month_old":
      return { title: "1 Month (Legacy)", durationDays: 30, isActive: false };
    case "3 Month":
      return { title: "3 Month", durationDays: 90, isActive: true };
    case "3 Month independence day offer":
      return { title: "3 Month Independence Day Offer", durationDays: 90, isActive: false };
    case "12 months":
      return { title: "12 Months", durationDays: 365, isActive: true };
    case "Admission and 1 Month":
      return { title: "Admission + 1 Month", durationDays: 30, isActive: false };
    case "Admission":
      return { title: "Admission", durationDays: 0, isActive: false };
    case "0.1 Admission":
      return { title: "0.1 Admission", durationDays: 0, isActive: false };
    default:
      return { title: label, durationDays: 30, isActive: false };
  }
}

function normalizeMemberStatus(rawStatus, latestDueDate, now) {
  const value = (rawStatus ?? "").trim().toLowerCase();
  if (value === "active" || value === "trail" || value === "trial") return "ACTIVE";
  if (value === "inactive" || value === "banned") return "SUSPENDED";
  if (latestDueDate && latestDueDate >= now) return "ACTIVE";
  return "SUSPENDED";
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const dbPath = resolveLocalDatabasePath(options.database);
  const backupPath = `${dbPath}.bak-${Date.now()}-rudra-import`;

  copyFileSync(dbPath, backupPath);

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON");

  const membersRows = parseCsv(readFileSync(options.membersFile, "utf8")).filter(
    (row) => Number.isFinite(Number.parseInt(row["Admission Number"], 10)) && row.Name?.trim(),
  );
  const paymentRows = parseCsv(readFileSync(options.paymentsFile, "utf8")).filter(
    (row) => row["A. No"]?.trim() && row["amount paid"]?.trim(),
  );

  const now = new Date();
  const tenantId = `tenant_${slugify(options.tenantSlug)}`;
  const tenantSlug = slugify(options.tenantSlug);
  const memberPrefix = tenantSlug.replace(/-/g, "_");
  const existingTenant = db
    .prepare(`SELECT "id" FROM "Tenant" WHERE "slug" = ?`)
    .get(tenantSlug);

  if (existingTenant && !options.replace) {
    throw new Error(
      `Tenant slug "${tenantSlug}" already exists. Re-run with --replace to overwrite this tenant import.`,
    );
  }

  db.exec("BEGIN");

  try {
    if (existingTenant) {
      const userIds = db
        .prepare(`SELECT "userId" FROM "TenantMembership" WHERE "tenantId" = ?`)
        .all(existingTenant.id)
        .map((row) => row.userId);

      db.prepare(`DELETE FROM "Tenant" WHERE "id" = ?`).run(existingTenant.id);

      const deleteUser = db.prepare(`DELETE FROM "User" WHERE "id" = ?`);
      for (const userId of userIds) {
        deleteUser.run(userId);
      }
    }

    const existingUsers = db.prepare(`SELECT "email", "phone" FROM "User"`).all();
    const usedEmails = new Set(
      existingUsers.map((row) => String(row.email ?? "").trim().toLowerCase()).filter(Boolean),
    );
    const usedPhones = new Set(
      existingUsers.map((row) => normalizePhone(String(row.phone ?? ""))).filter(Boolean),
    );

    const pickUniqueEmail = (rawEmail, fallbackEmail) => {
      const normalized = normalizeEmail(rawEmail);
      if (normalized && !usedEmails.has(normalized)) {
        usedEmails.add(normalized);
        return normalized;
      }

      let attempt = 0;
      let candidate = fallbackEmail.toLowerCase();
      while (usedEmails.has(candidate)) {
        attempt += 1;
        const [localPart, domain = "import.local"] = fallbackEmail.toLowerCase().split("@");
        candidate = `${localPart}+${attempt}@${domain}`;
      }
      usedEmails.add(candidate);
      return candidate;
    };

    const pickUniquePhone = (rawPhone) => {
      const normalized = normalizePhone(rawPhone);
      if (!normalized || usedPhones.has(normalized)) return null;
      usedPhones.add(normalized);
      return normalized;
    };

    const parsedMemberDates = membersRows.flatMap((row) => [
      parseLegacyDate(row["Enrollered On"]),
      parseLegacyDate(row["last Updated"]),
    ]).filter(Boolean);
    const parsedPaymentDates = paymentRows.flatMap((row) => [
      parseLegacyDate(row["Paid on"]),
      parseLegacyDate(row["Due Date"]),
    ]).filter(Boolean);
    const allDates = [...parsedMemberDates, ...parsedPaymentDates];
    const createdAt = allDates.length > 0
      ? new Date(Math.min(...allDates.map((value) => value.getTime())))
      : now;
    const updatedAt = allDates.length > 0
      ? new Date(Math.max(...allDates.map((value) => value.getTime())))
      : now;

    const addressCounts = new Map();
    for (const row of membersRows) {
      const address = row.Address?.trim();
      if (!address) continue;
      addressCounts.set(address, (addressCounts.get(address) ?? 0) + 1);
    }
    const tenantAddress =
      [...addressCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;

    const passwordHash = bcrypt.hashSync(options.password, 10);

    const paymentRowsByMemberId = new Map();
    for (const row of paymentRows) {
      const memberId = Number.parseInt(row["A. No"], 10);
      if (!Number.isFinite(memberId)) continue;
      const list = paymentRowsByMemberId.get(memberId) ?? [];
      list.push(row);
      paymentRowsByMemberId.set(memberId, list);
    }

    const activeBatches = [...new Set(membersRows.map((row) => row.Batch?.trim()).filter(Boolean))];
    const shiftDefinitions = [
      activeBatches.includes("Morning")
        ? {
            id: `${memberPrefix}_shift_morning`,
            name: "Morning",
            description: "Imported from legacy batch data.",
            startTime: "06:00",
            endTime: "11:00",
          }
        : null,
      activeBatches.includes("Evening")
        ? {
            id: `${memberPrefix}_shift_evening`,
            name: "Evening",
            description: "Imported from legacy batch data.",
            startTime: "17:00",
            endTime: "22:00",
          }
        : null,
    ].filter(Boolean);
    const shiftByBatch = new Map(shiftDefinitions.map((shift) => [shift.name, shift.id]));

    const operatorEmails = [
      ...new Set(
        [
          ...membersRows.map((row) => row["Enrolled By"]?.trim().toLowerCase()),
          ...paymentRows.map((row) => row["Received By"]?.trim().toLowerCase()),
        ].filter(Boolean),
      ),
    ];

    const mainOperatorEmail =
      operatorEmails.find((email) => email.includes("rudragym")) ?? operatorEmails[0] ?? null;

    const insertTenant = db.prepare(`
      INSERT INTO "Tenant" (
        "id", "name", "slug", "email", "phone", "logoUrl", "address", "estd", "status",
        "createdAt", "updatedAt", "markdown", "description", "platformExpiresAt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertTenantSettings = db.prepare(`
      INSERT INTO "TenantSettings" ("id", "tenantId", "overdueDays", "createdAt", "updatedAt")
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertShift = db.prepare(`
      INSERT INTO "Shift" ("id", "tenantId", "name", "description", "startTime", "endTime", "isActive", "createdAt", "updatedAt")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertSubscription = db.prepare(`
      INSERT INTO "Subscription" ("id", "tenantId", "title", "description", "amount", "durationDays", "isActive", "createdAt", "updatedAt")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertUser = db.prepare(`
      INSERT INTO "User" ("id", "name", "email", "phone", "passwordHash", "avatarUrl", "platformRole", "status", "createdAt", "updatedAt")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMembership = db.prepare(`
      INSERT INTO "TenantMembership" ("id", "tenantId", "userId", "memberId", "role", "status", "dueDate", "shiftId", "joinedAt", "createdAt", "updatedAt")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertPayment = db.prepare(`
      INSERT INTO "Payment" (
        "id", "amount", "status", "tenantId", "membershipId", "collectorId", "subscriptionId",
        "chargeId", "description", "note", "paidAt", "validFrom", "validUntil", "createdAt", "updatedAt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertTenant.run(
      tenantId,
      options.tenantName,
      tenantSlug,
      normalizeEmail(mainOperatorEmail),
      null,
      null,
      tenantAddress,
      iso(createdAt),
      "ACTIVE",
      iso(createdAt),
      iso(updatedAt),
      `## ${options.tenantName}\n\nHistorical member and payment records imported from legacy CSV exports.`,
      "Legacy member and payment records imported into FitConnect.",
      null,
    );

    insertTenantSettings.run(
      `${memberPrefix}_settings`,
      tenantId,
      30,
      iso(createdAt),
      iso(updatedAt),
    );

    for (const shift of shiftDefinitions) {
      insertShift.run(
        shift.id,
        tenantId,
        shift.name,
        shift.description,
        shift.startTime,
        shift.endTime,
        1,
        iso(createdAt),
        iso(updatedAt),
      );
    }

    const subscriptionLabels = [
      ...new Set(paymentRows.map((row) => row.subscription?.trim()).filter(Boolean)),
    ];
    const subscriptionIdByLabel = new Map();
    for (const label of subscriptionLabels) {
      const paymentsForLabel = paymentRows.filter((row) => row.subscription?.trim() === label);
      const amounts = paymentsForLabel
        .map((row) => Number.parseInt(row["amount paid"], 10))
        .filter((value) => Number.isFinite(value));
      const meta = subscriptionMeta(label);
      const subscriptionId = `${memberPrefix}_subscription_${slugify(meta.title)}`;
      subscriptionIdByLabel.set(label, subscriptionId);

      insertSubscription.run(
        subscriptionId,
        tenantId,
        meta.title,
        `Imported from legacy plan "${label}".`,
        chooseModalAmount(amounts),
        meta.durationDays,
        meta.isActive ? 1 : 0,
        iso(createdAt),
        iso(updatedAt),
      );
    }

    const memberRowsByAdmission = new Map(
      membersRows.map((row) => [Number.parseInt(row["Admission Number"], 10), row]),
    );
    const maxMemberId = Math.max(...membersRows.map((row) => Number.parseInt(row["Admission Number"], 10)));
    const operatorMembershipIdByEmail = new Map();
    let mainAdminEmail = null;

    for (const [index, email] of operatorEmails.entries()) {
      const isMainOperator = email === mainOperatorEmail;
      const userId = `${memberPrefix}_staff_user_${String(index + 1).padStart(3, "0")}`;
      const membershipId = `${memberPrefix}_staff_membership_${String(index + 1).padStart(3, "0")}`;
      const displayName = isMainOperator ? `${options.tenantName} Admin` : titleFromEmail(email);
      const fallbackEmail = isMainOperator
        ? `${tenantSlug}.admin@import.local`
        : `${tenantSlug}.staff.${index + 1}@import.local`;
      const finalEmail = pickUniqueEmail(email, fallbackEmail);
      const createdMembershipAt = createdAt;

      if (isMainOperator) {
        mainAdminEmail = finalEmail;
      }

      insertUser.run(
        userId,
        displayName,
        finalEmail,
        null,
        passwordHash,
        null,
        "USER",
        "ACTIVE",
        iso(createdMembershipAt),
        iso(updatedAt),
      );

      insertMembership.run(
        membershipId,
        tenantId,
        userId,
        maxMemberId + index + 1,
        isMainOperator ? "ADMIN" : "COACH",
        "ACTIVE",
        null,
        null,
        iso(createdMembershipAt),
        iso(createdMembershipAt),
        iso(updatedAt),
      );

      operatorMembershipIdByEmail.set(email, membershipId);
    }

    const emailCounts = new Map();
    for (const row of membersRows) {
      const normalized = normalizeEmail(row.Email);
      if (normalized) {
        emailCounts.set(normalized, (emailCounts.get(normalized) ?? 0) + 1);
      }
    }

    let preservedPhoneCount = 0;
    let duplicateOrInvalidPhoneCount = 0;
    let preservedEmailCount = 0;
    let syntheticEmailCount = 0;

    for (const row of membersRows) {
      const legacyMemberId = Number.parseInt(row["Admission Number"], 10);
      const userId = `${memberPrefix}_user_${String(legacyMemberId).padStart(4, "0")}`;
      const membershipId = `${memberPrefix}_membership_${String(legacyMemberId).padStart(4, "0")}`;
      const latestPayments = paymentRowsByMemberId.get(legacyMemberId) ?? [];
      const latestDueDate = latestPayments
        .map((paymentRow) => parseLegacyDate(paymentRow["Due Date"]))
        .filter(Boolean)
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
      const joinedAt = parseLegacyDate(row["Enrollered On"]) ?? parseLegacyDate(row["last Updated"]) ?? createdAt;
      const memberUpdatedAt = parseLegacyDate(row["last Updated"]) ?? joinedAt;
      const rawEmail = normalizeEmail(row.Email);
      const shouldPreserveEmail =
        rawEmail &&
        !operatorEmails.includes(rawEmail) &&
        (emailCounts.get(rawEmail) ?? 0) === 1;
      const finalEmail = pickUniqueEmail(
        shouldPreserveEmail ? rawEmail : null,
        `${tenantSlug}.member.${String(legacyMemberId).padStart(4, "0")}@import.local`,
      );
      const finalPhone = pickUniquePhone(row.Phone);
      const membershipStatus = normalizeMemberStatus(row.status, latestDueDate, now);

      if (shouldPreserveEmail) {
        preservedEmailCount += 1;
      } else {
        syntheticEmailCount += 1;
      }

      if (finalPhone) {
        preservedPhoneCount += 1;
      } else if (row.Phone?.trim()) {
        duplicateOrInvalidPhoneCount += 1;
      }

      insertUser.run(
        userId,
        row.Name.trim(),
        finalEmail,
        finalPhone,
        passwordHash,
        null,
        "USER",
        membershipStatus === "ACTIVE" ? "ACTIVE" : "SUSPENDED",
        iso(joinedAt),
        iso(memberUpdatedAt),
      );

      insertMembership.run(
        membershipId,
        tenantId,
        userId,
        legacyMemberId,
        "MEMBER",
        membershipStatus,
        iso(latestDueDate),
        shiftByBatch.get(row.Batch?.trim()) ?? null,
        iso(joinedAt),
        iso(joinedAt),
        iso(memberUpdatedAt),
      );
    }

    for (const [index, row] of paymentRows.entries()) {
      const legacyMemberId = Number.parseInt(row["A. No"], 10);
      const memberRow = memberRowsByAdmission.get(legacyMemberId);
      if (!memberRow) continue;

      const paymentId = `${memberPrefix}_payment_${String(index + 1).padStart(4, "0")}`;
      const paymentAmount = Number.parseInt(row["amount paid"], 10);
      const paidAt = parseLegacyDate(row["Paid on"]);
      const dueDate = parseLegacyDate(row["Due Date"]);
      const receivedBy = row["Received By"]?.trim().toLowerCase();
      const subscriptionLabel = row.subscription?.trim();
      const noteParts = [`Imported legacy receipt #${row["Receipt Number"] || index + 1}`];

      if (row.mode?.trim()) noteParts.push(`Mode: ${row.mode.trim()}`);
      if (row.partial?.trim()) noteParts.push(`Partial: ${row.partial.trim()}`);
      if (row.comment?.trim()) noteParts.push(`Comment: ${row.comment.trim()}`);

      insertPayment.run(
        paymentId,
        Number.isFinite(paymentAmount) ? paymentAmount : 0,
        "COMPLETED",
        tenantId,
        `${memberPrefix}_membership_${String(legacyMemberId).padStart(4, "0")}`,
        receivedBy ? operatorMembershipIdByEmail.get(receivedBy) ?? null : null,
        subscriptionLabel ? subscriptionIdByLabel.get(subscriptionLabel) ?? null : null,
        null,
        subscriptionLabel || "Imported legacy payment",
        noteParts.join(" | "),
        iso(paidAt),
        iso(paidAt),
        iso(dueDate),
        iso(paidAt ?? createdAt),
        iso(paidAt ?? createdAt),
      );
    }

    db.exec("COMMIT");

    console.log(
      JSON.stringify(
        {
          tenant: {
            name: options.tenantName,
            slug: tenantSlug,
            id: tenantId,
          },
          database: dbPath,
          backup: backupPath,
          members: membersRows.length,
          payments: paymentRows.length,
          operatorAccounts: operatorEmails.length,
          subscriptions: subscriptionLabels.length,
          shifts: shiftDefinitions.length,
          preservedPhoneCount,
          duplicateOrInvalidPhoneCount,
          preservedEmailCount,
          syntheticEmailCount,
          login: {
            email: mainAdminEmail,
            password: options.password,
          },
        },
        null,
        2,
      ),
    );
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

main();
