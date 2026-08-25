# Deployment

## Where Cloudflare config lives

**Per app, next to the app it configures** — not centralized.

```
apps/api/wrangler.toml     Worker: name, D1, R2, cron, vars, per-environment blocks
apps/api/.dev.vars         Local secrets (gitignored)
apps/pwa/.env.*            Build-time config per environment
apps/pwa/public/_headers   Pages response headers
apps/pwa/public/_redirects Pages SPA routing
apps/pwa/package.json      Pages project names, in the deploy scripts
```

The reasoning, since it comes up:

- **They configure different products.** The API is a Worker (bindings, D1, R2,
  cron triggers); the PWA is Pages (a static build plus headers and redirects).
  There is no shared schema to centralize into — a combined file would just be two
  unrelated configs in one place.
- **Wrangler resolves config from the working directory.** Co-located means
  `npm run deploy:test --workspace @fitconnect/api` works with no `--config` path
  juggling, and running `npx wrangler ...` inside an app directory behaves the way
  the docs say it does.
- **Independent deployability.** A broken PWA build cannot block an API hotfix,
  and CI can path-filter on `apps/api/**` vs `apps/pwa/**` to deploy only what
  changed.
- **It extends.** A third app drops in `apps/<name>/wrangler.toml` and changes
  nothing at the root.

What *is* centralized is this document — the human-facing inventory of what exists
in each environment. Config files stay machine-readable and local; the map stays
here.

The PWA has no `wrangler.toml`. Pages config in `wrangler.toml` binds a directory
to exactly one project name, and this setup uses two projects (test and
production). Keeping both project names side by side in the `deploy:*` scripts is
clearer than one file that only describes half the setup.

## Environment inventory

| Resource | Test | Production |
|---|---|---|
| Worker | `fitconnect-api-test` | `fitconnect-api` |
| D1 database | `fit-db-test` | `fit-db` |
| R2 bucket | `fit-bucket-test` | `fit-bucket` |
| Pages project | `fitconnect-pwa-test` | `fitconnect-pwa` |
| App root domain | `test.fitconnect.co.in` | `fitconnect.co.in` |
| Gym subdomains | `*.test.fitconnect.co.in` | `*.fitconnect.co.in` |

Local development uses `fitconnect-api-dev` against miniflare's local D1/R2 state
and `localhost` as the root domain.

## Secrets

Never in `wrangler.toml`. Four secrets per environment:

| Key | Purpose |
|---|---|
| `JWT_SECRET` | Signs access tokens |
| `EMAIL_USER` | SMTP username |
| `EMAIL_PASSWORD` | SMTP app password |
| `VAPID_PRIVATE_KEY` | Web Push signing key |

Set them all interactively:

```bash
npm run secrets:test --workspace @fitconnect/api
```

```bash
npm run secrets:production --workspace @fitconnect/api
```

Locally they go in `apps/api/.dev.vars`, which is gitignored.

Everything else — `APP_URL`, `APP_ROOT_DOMAINS`, `CORS_ORIGIN`, `R2_PUBLIC_URL`,
SMTP host/port/from, `VAPID_PUBLIC_KEY` — is non-secret and lives in the `[vars]`
block for its environment.

## First-time test environment setup

```bash
npx wrangler d1 create fit-db-test
```

```bash
npx wrangler r2 bucket create fit-bucket-test
```

Paste the returned `database_id` into `[[env.test.d1_databases]]` in
`apps/api/wrangler.toml`, then:

```bash
npm run secrets:test --workspace @fitconnect/api
```

```bash
npm run db:migrate:test --workspace @fitconnect/api
```

Create the Pages project once (or let the first deploy create it):

```bash
npx wrangler pages project create fitconnect-pwa-test --production-branch=test
```

## Deploying

```bash
npm run deploy:test --workspaces --if-present
```

```bash
npm run deploy:production --workspaces --if-present
```

Single app:

```bash
npm run deploy:test --workspace @fitconnect/api
```

Migrations are not run by a deploy. Apply them first:

```bash
npm run db:migrate:production --workspace @fitconnect/api
```

## DNS and routing

Gym subdomains require a wildcard record, because each gym is served from
`<slug>.<root-domain>`:

| Record | Value |
|---|---|
| `fitconnect.co.in` | Pages project `fitconnect-pwa` |
| `*.fitconnect.co.in` | Pages project `fitconnect-pwa` (wildcard custom domain) |
| `test.fitconnect.co.in` | Pages project `fitconnect-pwa-test` |
| `*.test.fitconnect.co.in` | Pages project `fitconnect-pwa-test` |

Add the wildcard as a custom domain on the Pages project so Cloudflare issues a
certificate covering it. Without the wildcard, gym subdomains resolve but fail TLS.

`APP_ROOT_DOMAINS` must list exactly these root domains. It is what tells the app
that `fitconnect.co.in` is the app itself while `rudra.fitconnect.co.in` is a gym —
label counting cannot distinguish them, since both have three labels.

## CI outline

Two workflows, path-filtered:

- `apps/api/**` or `packages/**` changes → `npm ci`, `npm run typecheck`,
  `npm run deploy:test --workspace @fitconnect/api`
- `apps/pwa/**` or `packages/**` changes → `npm ci`, `npm run typecheck`,
  `npm run deploy:test --workspace @fitconnect/pwa`

`packages/**` triggers both, since a contract change affects both sides.
Production deploys should run from a tag or a protected branch, never on every push.
