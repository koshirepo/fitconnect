-- Documentation: Add per-role permission overrides.
-- - Stores grants and revocations layered on top of the static role-permission
--   catalog so platform staff and gym admins can tune capabilities at runtime.
-- - `scope` is "PLATFORM" (PlatformRole rows) or "TENANT" (TenantRole rows).
-- - A null `tenantId` means the row is a platform-wide default; a set `tenantId`
--   scopes the override to a single gym.

CREATE TABLE "RolePermissionOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "tenantId" TEXT REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "updatedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "RolePermissionOverride_tenantId_scope_role_permission_key"
    ON "RolePermissionOverride"("tenantId", "scope", "role", "permission");

CREATE INDEX "RolePermissionOverride_tenantId_idx"
    ON "RolePermissionOverride"("tenantId");

CREATE INDEX "RolePermissionOverride_scope_role_idx"
    ON "RolePermissionOverride"("scope", "role");
