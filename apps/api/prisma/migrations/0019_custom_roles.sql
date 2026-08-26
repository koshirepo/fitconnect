-- Documentation: Custom role definitions.
-- - Introduces a `Role` registry so gym admins (and platform staff) can define
--   their own roles instead of being limited to the fixed MEMBER/COACH/ADMIN set.
-- - Built-in roles are seeded with `isSystem = 1` so they share the registry and
--   the unique key constraint, but can never be deleted. Their permissions still
--   come from the static catalog in `src/shared/types/permissions.ts`; only
--   custom roles carry their full permission list as override rows.
-- - `tenantId` is null for platform-scoped roles and for the seeded built-ins;
--   custom gym roles store their owning tenant. `@@unique([tenantId, scope, key])`
--   keeps keys unique within a scope container.

CREATE TABLE IF NOT EXISTS "Role" (
  "id"          TEXT PRIMARY KEY,
  "scope"       TEXT NOT NULL,
  "key"         TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "tenantId"    TEXT REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "isSystem"    INTEGER NOT NULL DEFAULT 0,
  "isActive"    INTEGER NOT NULL DEFAULT 1,
  "createdBy"   TEXT,
  "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Role_tenantId_scope_key_key"
  ON "Role"("tenantId", "scope", "key");

CREATE INDEX "Role_scope_tenantId_idx"
  ON "Role"("scope", "tenantId");

-- Seed the built-in roles. Platform roles have no tenant; tenant roles are
-- seeded with a null tenantId as the platform-wide defaults every gym inherits.
INSERT INTO "Role" ("id", "scope", "key", "name", "description", "tenantId", "isSystem", "isActive", "createdAt", "updatedAt") VALUES
  ('role_platform_user',       'PLATFORM', 'USER',        'User',        'A plain platform account with no tenant capabilities.', NULL, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_platform_support',    'PLATFORM', 'SUPPORT',     'Support',     'Read-only cross-tenant visibility for platform support.', NULL, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_platform_super_admin','PLATFORM', 'SUPER_ADMIN', 'Super Admin', 'Unrestricted platform access.', NULL, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_tenant_member',       'TENANT',   'MEMBER',      'Member',      'Standard gym membership.', NULL, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_tenant_coach',        'TENANT',   'COACH',       'Coach',       'Day-to-day floor operations.', NULL, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_tenant_admin',        'TENANT',   'ADMIN',       'Admin',       'Full gym administration.', NULL, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
