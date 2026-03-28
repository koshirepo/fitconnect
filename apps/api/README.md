# Hono + Cloudflare Workers + Prisma + D1 + R2 API

This project scaffolds a Cloudflare Workers API using:

- Hono for routing
- Prisma ORM with the `@prisma/adapter-d1` driver
- Cloudflare D1 for relational data
- Cloudflare R2 for file storage

Cloudflare does not have an `R1` file storage product, so this scaffold uses `R2`.

## Endpoints

- `GET /`
- `GET /health`
- `GET /users`
- `POST /users`
- `GET /users/:id`
- `PATCH /users/:id`
- `DELETE /users/:id`
- `GET /files`
- `POST /files`
- `GET /files/:id`
- `GET /files/:id/content`
- `DELETE /files/:id`

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env`.

The local Worker requires `JWT_SECRET` for `/auth/login`. The template now includes a development value; replace it for any shared or remote environment.

3. Create your Cloudflare resources:

```bash
npx wrangler d1 create fit-db
npx wrangler r2 bucket create fit-bucket
npx wrangler r2 bucket create fit-bucket-preview
```

4. Update the placeholder IDs and bucket names in `wrangler.toml`.

5. Generate Cloudflare runtime types:

```bash
npm run cf-typegen
```

`npm install` now ensures the Prisma client exists, and `npm run dev`, `npm run deploy`, and `npm run typecheck` regenerate it automatically only when `prisma/schema.prisma` is newer than the generated client.

6. Apply the schema to your local D1 database:

```bash
npm run db:migrate:local
```

7. Start the local Worker:

```bash
npm run dev
```

## When `schema.prisma` changes

Use this flow every time you modify `prisma/schema.prisma`.

Important: this command compares your updated Prisma schema against your current local D1 database, so make sure you have already run `npm run db:migrate:local` at least once before using it.

1. Edit `prisma/schema.prisma`.

2. Generate a new SQL migration file with the next number in sequence:

```bash
npm run db:migration:diff -- --output prisma/migrations/0002_your_change_name.sql
```

Example:

```bash
npm run db:migration:diff -- --output prisma/migrations/0002_add_profile_table.sql
```

3. Regenerate Prisma Client if you want to refresh it before running another command:

```bash
npm run generate
```

`npm run dev`, `npm run deploy`, and `npm run typecheck` already regenerate the client automatically when it is missing or stale.

4. Apply the new migration to your local D1 database:

```bash
npm run db:migrate:local
```

5. Re-run type checking:

```bash
npm run typecheck
```

6. Start the Worker and test the changed routes:

```bash
npm run dev
```

7. When you are ready to update Cloudflare remote D1, apply the same migration remotely:

```bash
npm run db:migrate:remote
```

8. If you changed Worker bindings in `wrangler.toml`, regenerate runtime types too:

```bash
npm run cf-typegen
```

## Deployment

Use Wrangler to bundle and deploy this Worker. Do not use a generic command like `bun build src/index.ts --outdir dist --target bun`; Prisma's generated Cloudflare client imports a WASM module that Wrangler bundles correctly and Bun's generic build does not.

1. Create your remote Cloudflare resources if you have not already:

```bash
npx wrangler d1 create fit-db
npx wrangler r2 bucket create fit-bucket
```

2. Update the real database IDs and bucket names in `wrangler.toml`.

3. Set required production secrets and vars in Cloudflare.

Required:

- `JWT_SECRET`

Recommended, depending on enabled features:

- `CORS_ORIGIN`
- `APP_URL`
- `R2_PUBLIC_URL`
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

Example secret command:

```bash
npx wrangler secret put JWT_SECRET
```

4. Apply all checked-in SQL migrations to the remote D1 database:

```bash
npm run db:migrate:remote
```

5. Run a local production-style bundle check:

```bash
npm run build
```

6. Deploy the Worker:

```bash
npm run deploy
```

If your hosting or CI provider asks for commands, use:

- Build command: `npm run build`
- Deploy command: `npm run deploy`

## Local seed data

`npm run seed:local` rebuilds the local D1 database from the SQL files in `prisma/migrations` and then loads a large deterministic dataset for testing.

Important: this resets the local `.wrangler` D1 data before seeding.

Default seeded login credentials:

- Super admin: `superadmin@seed.gym.test`
- Support: `support@seed.gym.test`
- Tenant admins: `admin.<tenant-slug>@seed.gym.test`
- Shared password for all seeded users: `Test@1234`

You can scale the dataset up or down with flags:

```bash
npm run seed:local -- --tenants=8 --members-per-tenant=30 --products=40 --orders=180 --attendance-days=60
```

If `.wrangler/state` does not exist yet, start the Worker once with `npm run dev` so Wrangler provisions the local D1 file first.

## Example requests

Create a user:

```bash
curl -X POST http://127.0.0.1:8787/users ^
  -H "content-type: application/json" ^
  -d "{\"email\":\"jane@example.com\",\"name\":\"Jane\"}"
```

Upload a file:

```bash
curl -X POST http://127.0.0.1:8787/files ^
  -F "file=@README.md"
```

## Notes

- Prisma support for Cloudflare D1 is currently marked Preview by Prisma.
- Cloudflare D1 does not support transactions in the way Prisma supports them on traditional databases.
- The migration files in `prisma/migrations` are the source of truth for the local D1 schema.
