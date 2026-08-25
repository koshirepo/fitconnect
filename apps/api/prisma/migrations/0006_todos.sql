-- Documentation: add tenant-scoped todos.
-- - Creates a tenant todo table with visibility controls so admins and coaches can collaborate while keeping private/admin-only items hidden.
-- - Visibility values are stored as plain strings: PRIVATE, PROTECTED, PUBLIC.

CREATE TABLE "Todo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "createdById" TEXT,
    "updatedById" TEXT,
    "completedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Todo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Todo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "TenantMembership" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Todo_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "TenantMembership" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Todo_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "TenantMembership" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Todo_tenantId_updatedAt_idx" ON "Todo"("tenantId", "updatedAt");
CREATE INDEX "Todo_tenantId_visibility_isCompleted_idx" ON "Todo"("tenantId", "visibility", "isCompleted");
CREATE INDEX "Todo_createdById_idx" ON "Todo"("createdById");
CREATE INDEX "Todo_updatedById_idx" ON "Todo"("updatedById");
CREATE INDEX "Todo_completedById_idx" ON "Todo"("completedById");
