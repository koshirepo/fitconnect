# Authorization

FitConnect authorizes on **named permissions**, never on role-name comparisons.
`role === "ADMIN"` scattered across routes and components is how a policy drifts;
one catalog that both sides read is how it stays consistent.

## Where things live

| Concern | File |
|---|---|
| Permission catalog + role grants | `packages/shared/src/types/permissions.ts` |
| API route gating | `apps/api/src/middleware/authorize.ts` |
| API controller-level checks | `apps/api/src/lib/permissions.ts` |
| Stored overrides (read/write) | `apps/api/src/modules/roles/` |
| PWA capability set | `apps/pwa/src/stores/auth.ts`, `apps/pwa/src/lib/permissions.ts` |
| PWA gating primitives | `apps/pwa/src/features/auth/permission-gate.tsx` |
| PWA route gating | `apps/pwa/src/features/auth/route-guards.tsx` |

## The model

A permission is a string, `<resource>:<action>[:<qualifier>]` — `members:read`,
`payments:update`, `attendance:read:self`. The `:self` qualifier opens a door but
does not scope the query; the service layer still filters to the caller's own
records.

Two independent role axes grant permissions, and an actor holds the **union**:

- **Platform role** (`USER`, `SUPPORT`, `SUPER_ADMIN`) — account-level reach.
- **Tenant role** (`MEMBER`, `COACH`, `ADMIN`) — reach inside one gym, resolved
  per request from the tenant in the URL or the `x-tenant-id` header.

`MEMBER ⊂ COACH ⊂ ADMIN` by construction: each tier spreads the tier below it and
adds to it, so a capability can never be granted to a coach but missed by an admin.

## Resolution order

```
catalog baseline for the role
  → platform-wide override rows   (tenantId IS NULL)
  → gym-specific override rows    (tenantId = <this gym>)
  → locked permissions re-added
  = effective permission set
```

Permissions are resolved **per request**, never embedded in the JWT. Revoking a
capability takes effect on the next request rather than the next token refresh.
The JWT still carries the tenant-role map, so resolution costs one small indexed
read rather than a membership lookup.

## Guardrails

These are enforced in `roles.service.ts` and cannot be bypassed from the UI:

- **`SUPER_ADMIN` is immutable.** It always holds every permission. Editing it is
  rejected, so the platform cannot be locked out of its own admin screens.
- **Locked permissions survive a revoke.** `TENANT_ADMIN` keeps `roles:read`,
  `roles:update`, and `tenant:read` no matter what is submitted — otherwise an
  admin could remove their own access to the screen that grants it back.
- **Gyms cannot grant themselves platform reach.** A tenant-scoped write only
  accepts permissions outside the `platform:` namespace, and only for tenant roles.
- **Overrides store deviations, not full sets.** Resetting a role deletes its rows
  and returns it to the catalog baseline, so catalog changes keep flowing to roles
  nobody has customized.

## Adding a permission

1. Add the key to `Permission` in `packages/shared/src/types/permissions.ts`.
2. Add a human label to `PERMISSION_LABELS` — the management screens render it.
3. Grant it to the roles that should hold it by default (remember the tiers spread
   downward, so adding to `MEMBER_PERMISSIONS` reaches coaches and admins too).
4. Gate the route with `requireTenantPermissions(...)` or `requirePermissions(...)`.
5. Gate the UI with `<Can permission={...}>`, `usePermissions()`, or
   `<RequirePermission anyOf={[...]} />`.

If the permission does not match an existing `PERMISSION_GROUPS` prefix, add a
group so it renders in the right section of the management screens.

## Managing roles at runtime

Two screens, both backed by the same service:

- **Gym level** — `/settings/roles`, needs `roles:read` (edit needs `roles:update`).
  Edits the three tenant roles for the signed-in gym only.
- **Platform level** — `/platform-roles`, needs `platform:roles:read` (edit needs
  `platform:roles:update`). Edits platform roles and the tenant-role defaults every
  gym inherits.

A gym-specific override wins over the platform-wide default for the same
permission. Every change is written to the audit log as a `ROLE_CHANGE`.

## UI gating is an affordance, not a control

The PWA hides what the user cannot do so the interface stays honest, but the API
re-checks every request against the same catalog. A permission that is only
enforced in the PWA is not enforced.
