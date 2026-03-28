# REST Client Collections

These `.http` files are written for the VS Code REST Client extension and mirror the API modules in this repository. They are intended for manual smoke tests, feature demos, and quick verification after schema or route changes.

## Basic Workflow

1. Start the API with `npm run dev`.
2. Open a file in this folder.
3. Run the named login or setup request near the top of that file first.
4. Run the remaining requests in that collection. Most later requests reuse access tokens or ids captured from earlier responses through REST Client variables.

## Seed Defaults Used By Many Files

- Tenant slug: `seed-gym-1`
- Tenant id: `tenant_0001`
- Super admin: `superadmin@seed.gym.test`
- Support: `support@seed.gym.test`
- Tenant admin: `admin.seed-gym-1@seed.gym.test`
- Coach: `coach.1.seed-gym-1@seed.gym.test`
- Member: `member.1.seed-gym-1@seed.gym.test`
- Shared password: `Test@1234`

## File Map

- `00-auth.http`: bootstrap, login, refresh, logout, current-user lookup, platform-user creation, and password reset flows
- `01-tenants.http`: tenant CRUD and tenant administration flows
- `02-members.http`: member creation, profile, status, reporting, and reset-password flows
- `03-payments.http`: subscription and payment flows
- `04-settings.http`: tenant settings and charge CRUD
- `05-workouts.http`: workout plan CRUD and assignment
- `06-badges.http`: badge CRUD and badge assignment
- `07-attendance.http`: check-ins, staff marking, summaries, and calendar views
- `08-audit.http`: privileged audit-log reads
- `09-public.http`: public gym listing and gym detail routes
- `10-commerce.http`: product catalog, checkout, and admin commerce management
- `11-review.http`: review creation, comments, helpful votes, and rating stats
- `12-push.http`: push subscription registration and removal
- `13-uploads.http`: avatar and product image uploads

## Conventions

- Most tenant-scoped endpoints use the tenant id, for example `tenant_0001`.
- Public tenant endpoints generally use the tenant slug, for example `seed-gym-1`.
- Some collections point at `http://127.0.0.1:8787`; others may target a deployed Worker URL. Adjust each file's `@baseUrl` before running requests.
- Authenticated collections usually expose one or more `# @name ...Login` requests near the top. Run those first.
- Upload requests use [`rest-client/fixtures/1x1.png`](/l:/api/rest-client/fixtures/1x1.png) and require a valid R2 bucket binding plus `R2_PUBLIC_URL`.

## When To Update These Files

Update the matching `.http` file whenever you:

- rename an endpoint
- change a request body or response dependency
- rename a seeded identity or fixture id
- change the route authorization expectations
- add a new feature that should be easy to smoke-test manually
