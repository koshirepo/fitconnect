-- Documentation: Staff pay and the gym's books.
-- - Two features that are really one ledger. A gym owner asking "what did I
--   spend this month" means rent and repairs *and* payroll, so recording a
--   salary payment writes an `Expense` row beside the `SalaryPayment` and links
--   the two. Without that link payroll is either missing from the books or
--   entered twice, and both are wrong in ways nobody notices for a month.
-- - Pay is split across three tables because the three change at different
--   times. `StaffCompensation` is the standing agreement and is edited when
--   somebody gets a raise. `SalaryCycle` is one month of it, holding a snapshot
--   of the agreed figure so a raise in March does not silently rewrite
--   February. `SalaryPayment` is money actually handed over, and there can be
--   several against one month — that is what paying in parts is.
-- - `SalaryComponent.amount` is always positive and `kind` carries the sign.
--   A deduction entered as a negative bonus would total correctly and read as
--   nonsense on a payslip.
-- - Recurring expenses are templates, not schedule entries. Nothing writes an
--   expense on its own: a month becomes real when somebody posts it. The unique
--   index on (recurringExpenseId, periodMonth) is what stops the same month
--   being posted twice, including by two admins pressing the button together.
-- - Money is stored in whole rupees as INTEGER throughout, matching `Payment`.

CREATE TABLE "StaffCompensation" (
  "id"            TEXT PRIMARY KEY NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "membershipId"  TEXT NOT NULL,
  "monthlyAmount" INTEGER NOT NULL,
  "effectiveFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "note"          TEXT,
  "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffCompensation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE,
  CONSTRAINT "StaffCompensation_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "TenantMembership" ("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "StaffCompensation_membershipId_key" ON "StaffCompensation" ("membershipId");
CREATE INDEX "StaffCompensation_tenantId_idx" ON "StaffCompensation" ("tenantId");

CREATE TABLE "SalaryCycle" (
  "id"           TEXT PRIMARY KEY NOT NULL,
  "tenantId"     TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "month"        TEXT NOT NULL,
  "baseAmount"   INTEGER NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'PENDING',
  "note"         TEXT,
  "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalaryCycle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE,
  CONSTRAINT "SalaryCycle_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "TenantMembership" ("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "SalaryCycle_tenantId_membershipId_month_key" ON "SalaryCycle" ("tenantId", "membershipId", "month");
CREATE INDEX "SalaryCycle_tenantId_month_idx" ON "SalaryCycle" ("tenantId", "month");
CREATE INDEX "SalaryCycle_membershipId_idx" ON "SalaryCycle" ("membershipId");

CREATE TABLE "SalaryComponent" (
  "id"        TEXT PRIMARY KEY NOT NULL,
  "cycleId"   TEXT NOT NULL,
  "kind"      TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "amount"    INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalaryComponent_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "SalaryCycle" ("id") ON DELETE CASCADE
);

CREATE INDEX "SalaryComponent_cycleId_idx" ON "SalaryComponent" ("cycleId");

CREATE TABLE "RecurringExpense" (
  "id"         TEXT PRIMARY KEY NOT NULL,
  "tenantId"   TEXT NOT NULL,
  "label"      TEXT NOT NULL,
  "amount"     INTEGER NOT NULL,
  "category"   TEXT NOT NULL DEFAULT 'OTHER',
  "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "note"       TEXT,
  "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecurringExpense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE
);

CREATE INDEX "RecurringExpense_tenantId_idx" ON "RecurringExpense" ("tenantId");

CREATE TABLE "Expense" (
  "id"                 TEXT PRIMARY KEY NOT NULL,
  "tenantId"           TEXT NOT NULL,
  "label"              TEXT NOT NULL,
  "amount"             INTEGER NOT NULL,
  "category"           TEXT NOT NULL DEFAULT 'OTHER',
  "incurredOn"         DATETIME NOT NULL,
  "recurringExpenseId" TEXT,
  "periodMonth"        TEXT,
  "note"               TEXT,
  "recordedById"       TEXT,
  "createdAt"          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Expense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE,
  CONSTRAINT "Expense_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense" ("id") ON DELETE SET NULL,
  CONSTRAINT "Expense_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "TenantMembership" ("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "Expense_recurringExpenseId_periodMonth_key" ON "Expense" ("recurringExpenseId", "periodMonth");
CREATE INDEX "Expense_tenantId_incurredOn_idx" ON "Expense" ("tenantId", "incurredOn");
CREATE INDEX "Expense_tenantId_category_idx" ON "Expense" ("tenantId", "category");

CREATE TABLE "SalaryPayment" (
  "id"           TEXT PRIMARY KEY NOT NULL,
  "tenantId"     TEXT NOT NULL,
  "cycleId"      TEXT NOT NULL,
  "amount"       INTEGER NOT NULL,
  "method"       TEXT NOT NULL DEFAULT 'CASH',
  "paidAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note"         TEXT,
  "recordedById" TEXT,
  "expenseId"    TEXT,
  "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalaryPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE,
  CONSTRAINT "SalaryPayment_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "SalaryCycle" ("id") ON DELETE CASCADE,
  CONSTRAINT "SalaryPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "TenantMembership" ("id") ON DELETE SET NULL,
  CONSTRAINT "SalaryPayment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense" ("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "SalaryPayment_expenseId_key" ON "SalaryPayment" ("expenseId");
CREATE INDEX "SalaryPayment_tenantId_idx" ON "SalaryPayment" ("tenantId");
CREATE INDEX "SalaryPayment_cycleId_idx" ON "SalaryPayment" ("cycleId");
