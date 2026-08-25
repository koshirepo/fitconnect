# Gym Management API

This repository contains a multi-tenant gym management API built for Cloudflare Workers with Hono, Prisma, D1, and R2. It covers platform authentication, tenant management, member lifecycle operations, subscriptions and payments, public gym pages, commerce, reviews, attendance, uploads, web push, and audit logging.

The codebase is organized in layers:

- `routes` files declare endpoint paths and middleware.
- `controller` files own the HTTP boundary and response shaping.
- `service` files hold business rules and workflow orchestration.
- `repository` files isolate Prisma persistence logic.
- `schema` files define Zod validation contracts.

Hand-maintained source, config, schema, migration, and REST client files include top-of-file documentation blocks so most files are self-describing in place.

## Stack

- Runtime: Cloudflare Workers
- HTTP framework: Hono
- Database: Cloudflare D1
- ORM: Prisma with `@prisma/adapter-d1`
- Object storage: Cloudflare R2
- Validation: Zod
- Auth: JWT access tokens plus persisted refresh tokens
- Email: Nodemailer
- Push: `web-push`

## Feature Areas

- `auth`: bootstrap, login, refresh, logout, current-user lookup, platform-user creation, and password reset
- `tenants`: tenant CRUD, tenant administration, and public profile data
- `members`: member creation, self profile, role changes, status updates, reports, and password reset
- `payments`: subscription catalog, payment creation, member dues, and validity windows
- `settings`: tenant settings plus reusable tenant charges
- `workouts`: workout plan CRUD and assignment
- `badges`: badge definitions and badge assignment
- `attendance`: self check-in, staff marking, summaries, and calendar views
- `public`: public gym listing and gym profile endpoints
- `commerce`: product catalog, order placement, and admin product/order management
- `review`: product reviews, comments, and helpful-vote tracking
- `push`: browser push subscription management
- `uploads`: avatar and product image uploads to R2
- `audit`: privileged audit-log reads

## Request Flow

1. Cloudflare invokes [`src/index.ts`](/l:/api/src/index.ts), which normalizes Worker bindings into `process.env`, initializes Prisma against `env.DB`, and forwards the request to the Hono app.
2. [`src/app.ts`](/l:/api/src/app.ts) applies global middleware, mounts route groups, and converts cross-cutting failures into the shared response envelope.
3. Route modules attach authentication and authorization middleware from [`src/middleware/authenticate.ts`](/l:/api/src/middleware/authenticate.ts), [`src/middleware/optional-authenticate.ts`](/l:/api/src/middleware/optional-authenticate.ts), and [`src/middleware/authorize.ts`](/l:/api/src/middleware/authorize.ts).
4. Controllers parse request bodies with [`src/lib/http.ts`](/l:/api/src/lib/http.ts), call services, and respond with helpers from [`src/lib/response.ts`](/l:/api/src/lib/response.ts).
5. Services coordinate repositories, email, audit logging, storage, and domain rules.
6. Repositories execute Prisma queries through the D1-aware proxy exported from [`src/lib/prisma.ts`](/l:/api/src/lib/prisma.ts).

## Repository Map

- [`src/app.ts`](/l:/api/src/app.ts): Hono app composition, route mounting, and global error translation
- [`src/index.ts`](/l:/api/src/index.ts): Worker `fetch` and `scheduled` entrypoints
- [`src/auth`](/l:/api/src/auth): JWT and password helpers
- [`src/lib`](/l:/api/src/lib): cross-cutting response, persistence, email, storage, pagination, and mapping utilities
- [`src/middleware`](/l:/api/src/middleware): auth and role middleware
- [`src/modules`](/l:/api/src/modules): domain modules following the route/controller/service/repository/schema split
- [`src/shared`](/l:/api/src/shared): shared DTOs, enums, constants, and pure helpers
- [`prisma`](/l:/api/prisma): Prisma schema and SQL migrations
- [`scripts`](/l:/api/scripts): Prisma freshness checks and deterministic seed workflows
- [`rest-client`](/l:/api/rest-client): VS Code REST Client request collections

## Local Setup

1. Install dependencies.

```bash
npm install
```

2. Copy `.env.example` to `.env`.

The local Worker requires `JWT_SECRET`. The example value is only for local development.

3. Create Cloudflare resources.

```bash
npx wrangler d1 create fit-db
npx wrangler r2 bucket create fit-bucket
npx wrangler r2 bucket create fit-bucket-preview
```

4. Update the generated identifiers and bucket names in [`wrangler.toml`](/l:/api/wrangler.toml).

5. Generate Cloudflare runtime types.

```bash
npm run cf-typegen
```

6. Apply checked-in migrations to the local D1 database.

```bash
npm run db:migrate:local
```

7. Start the Worker locally.

```bash
npm run dev
```

`npm install`, `npm run dev`, `npm run build`, `npm run deploy`, and `npm run typecheck` all ensure the Prisma client exists before they continue.

## Common Commands

- `npm run dev`: start the local Worker
- `npm run typecheck`: run TypeScript without emitting output
- `npm run build`: ask Wrangler to produce a production-style bundle in `dist`
- `npm run deploy`: deploy the Worker through Wrangler
- `npm run generate`: regenerate Prisma client manually
- `npm run db:migrate:local`: apply SQL migrations to local D1
- `npm run db:migrate:remote`: apply SQL migrations to remote D1
- `npm run db:migration:diff -- --output prisma/migrations/0002_name.sql`: create the next migration script from Prisma schema changes
- `npm run seed:local`: rebuild and seed the local database
- `npm run seed:remote`: migrate and seed the configured remote database
- `npm run seed:remote:sql`: print the generated remote seed SQL without executing it

## Environment And Bindings

### Required local or remote settings

- `JWT_SECRET`: signing secret for access tokens

### Common optional environment variables

- `CORS_ORIGIN`: explicit frontend origin when `*` is not acceptable
- `APP_URL`: frontend URL used in password reset emails
- `R2_PUBLIC_URL`: public base URL for uploaded assets
- `EMAIL_HOST`
- `EMAIL_PORT`
- `EMAIL_SECURE`
- `EMAIL_USER`
- `EMAIL_PASSWORD`
- `EMAIL_FROM`
- `EMAIL_VERIFY_ON_STARTUP`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_EMAIL`
- `JWT_ACCESS_TTL_SECONDS`
- `JWT_REFRESH_TTL_SECONDS`

### Cloudflare bindings

- `DB`: D1 binding used by Prisma
- `FILES`: current R2 binding used for uploads
- `UPLOADS_BUCKET`: optional alias accepted by the runtime if you prefer a more explicit bucket name
- `R2_PUBLIC_URL`: string binding consumed by upload routes to build final asset URLs

## Database Workflow

When [`prisma/schema.prisma`](/l:/api/prisma/schema.prisma) changes:

1. Edit the Prisma schema.
2. Generate a new numbered SQL migration.

```bash
npm run db:migration:diff -- --output prisma/migrations/0002_your_change.sql
```

3. Regenerate Prisma if you want an immediate client refresh.

```bash
npm run generate
```

4. Apply the migration locally.

```bash
npm run db:migrate:local
```

5. Re-run type checking.

```bash
npm run typecheck
```

6. When ready, apply the same migration remotely.

```bash
npm run db:migrate:remote
```

If you update bindings in [`wrangler.toml`](/l:/api/wrangler.toml), rerun `npm run cf-typegen` so `worker-configuration.d.ts` stays synchronized.

## Seed Data

[`scripts/ensure-prisma-client.mjs`](/l:/api/scripts/ensure-prisma-client.mjs) also contains the deterministic seed workflow used for local and remote environments.

### Local test credentials

Use these accounts to sign in during local development.

- Platform super admin: `superadmin@seed.gym.test` / `Test@1234`
- Support user: `support@seed.gym.test` / `Test@1234`
- Tenant admin (replace `<tenant-slug>` with a seeded tenant slug): `admin.<tenant-slug>@seed.gym.test` / `Test@1234`

Examples:

- App-level platform login: `http://localhost:5173/login`
- Tenant login on a public subdomain: `http://seed-gym-5.localhost:5173/login`

When the host includes a tenant subdomain, the shared login page treats the user as a tenant-level user and defaults back to the tenant public page after sign-in. When there is no subdomain, it behaves as the platform/app login and redirects to the dashboard.

Default seeded identities:

- Super admin: `superadmin@seed.gym.test`
- Support: `support@seed.gym.test`
- Tenant admins: `admin.<tenant-slug>@seed.gym.test`
- Shared password: `Test@1234`

Scale the generated data set with flags such as:

```bash
npm run seed:local -- --tenants=8 --members-per-tenant=30 --products=40 --orders=180 --attendance-days=60
```

Important:

- `seed:local` resets local Wrangler D1 state before loading fixtures.
- `seed:remote` is intended for empty or disposable remote databases.
- `seed:remote:sql` is the safe way to inspect the generated SQL before execution.

## Scheduled Work

The Worker exposes a `scheduled` handler in [`src/index.ts`](/l:/api/src/index.ts). That job imports the member service and runs overdue subscription enforcement, then logs a summary to the Worker console.

If you change overdue-enforcement behavior, validate both the scheduled path and the ordinary member/payment flows because they operate on the same membership state.

## REST Client Collections

The [`rest-client`](/l:/api/rest-client) folder contains request collections for the VS Code REST Client extension. Each file groups related flows and typically includes a named login request whose response variables feed the later requests.

Start with:

1. `npm run dev`
2. Open the matching `.http` file in `rest-client/`
3. Run the top login or setup request first
4. Run the remaining requests in order

The separate [`rest-client/README.md`](/l:/api/rest-client/README.md) documents file-by-file conventions and seed assumptions.

## Deployment

Use Wrangler to bundle and deploy this Worker. Do not replace it with a generic JavaScript bundling command, because Prisma's generated Cloudflare client depends on bundling behavior that Wrangler handles correctly.

Typical deployment flow:

1. Create remote D1 and R2 resources if they do not exist yet.
2. Update real ids and bucket names in [`wrangler.toml`](/l:/api/wrangler.toml).
3. Set production secrets such as `JWT_SECRET`.
4. Apply migrations with `npm run db:migrate:remote`.
5. Verify the bundle locally with `npm run build`.
6. Deploy with `npm run deploy`.

## Documentation Notes

- Most maintained text files now begin with a local overview describing their purpose, responsibilities, and key exports or usage.
- Generated artifacts such as `src/generated/prisma/**` and `worker-configuration.d.ts` are intentionally not treated as hand-maintained documentation targets because tooling rewrites them.
- Binary assets such as [`rest-client/fixtures/1x1.png`](/l:/api/rest-client/fixtures/1x1.png) are left untouched for the same reason.
