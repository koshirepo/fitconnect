# FitConnect

Monorepo for the FitConnect gym-management platform.

```
FitConnect/
├── apps/
│   ├── api/            @fitconnect/api  — Hono API on Cloudflare Workers (D1 + R2)
│   └── pwa/            @fitconnect/pwa  — React + Vite PWA on Cloudflare Pages
├── packages/
│   ├── shared/         @fitconnect/shared    — contracts every app depends on
│   └── tsconfig/       @fitconnect/tsconfig  — shared TypeScript presets
├── package.json        workspace root scripts
└── pnpm-workspace.yaml package list + allowed build scripts
```

## Why this shape

`packages/shared` is the single definition of everything the API and the PWA must
agree on — the role/permission catalog, enums, domain models, API envelopes, and
pure utilities. Before the split these files were byte-duplicated in both apps and
had already drifted. Anything both sides must agree on belongs there; anything one
runtime owns (Prisma queries, React components) stays in its app.

`packages/tsconfig` holds the compiler presets so a new app inherits the same
strictness instead of copying a config.

## Repository history

This repo consolidates two previously separate repositories,
[fit-api](https://github.com/koshimicrosystem/fit-api) and
[fit-pwa](https://github.com/koshimicrosystem/fit-pwa). Both histories were
imported in full, rewritten so every commit records the path its files live at
now — `git log` and `git blame` on `apps/api/...` and `apps/pwa/...` reach all
the way back rather than stopping at the import.

The rewrite means **commit SHAs differ from the original repositories**. Those
repositories still exist on GitHub with their original hashes and were not
modified; this is a new repo that needs its own remote, not a continuation of
either one. Any open branch or PR there has to be re-landed here by hand.

## Getting started

```bash
pnpm install
```

One install at the root wires every workspace; do not run `pnpm install` inside an
app directory.

### Local development

Run the API and the PWA in two terminals:

```bash
pnpm run dev:api
```

```bash
pnpm run dev:pwa
```

- API: <http://localhost:8787>
- PWA: <http://localhost:5173> (Vite proxies `/api` and `/uploads` to the API, so
  the browser stays same-origin and no CORS setup is needed)

Before the first API run, copy the secrets template:

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

`.dev.vars` is gitignored. `apps/api/wrangler.toml` holds only non-secret vars.

Apply database migrations to the local D1 instance:

```bash
pnpm run db:migrate:local --workspace @fitconnect/api
```

Seed it with demo data — platform accounts, six gyms, their staff and members:

```bash
pnpm run seed:local --workspace @fitconnect/api
```

Everything it creates shares the password `Test@1234`:

| Level | Role | Email |
| --- | --- | --- |
| Platform | `SUPER_ADMIN` | `superadmin@seed.gym.test` |
| Platform | `SUPPORT` | `support@seed.gym.test` |
| Seed Gym 5 | `ADMIN` | `admin.seed-gym-5@seed.gym.test` |
| Seed Gym 5 | `COACH` | `coach.1.seed-gym-5@seed.gym.test` |
| Seed Gym 5 | `COACH` | `coach.2.seed-gym-5@seed.gym.test` |
| Seed Gym 5 | `MEMBER` | `member.6.seed-gym-5@seed.gym.test` |

Platform accounts sign in at `localhost:5173/login`; gym accounts sign in on
their own subdomain, `seed-gym-5.localhost:5173/login`. Other gyms follow the
same pattern with their slug (`seed-gym-1` … `seed-gym-6`), and each has two
coaches and twenty-four members. Most seeded members are suspended on an overdue
subscription by design — that is the overdue-enforcement fixture — so use an
active one such as `member.6` when you need a member who can check in.

#### Testing gym subdomains locally

Gyms are served from `<slug>.<root-domain>`. Locally that means
`http://rudra.localhost:5173` — Chrome and Firefox resolve any `*.localhost`
without a hosts-file entry. `VITE_APP_ROOT_DOMAINS=localhost` in
`apps/pwa/.env.development` tells the app that `localhost` is the app root, so
`localhost:5173` shows the landing page and `rudra.localhost:5173` shows that gym.

## Environments

Three environments, each with its own config. Nothing is shared between them
except the code.

| | Local | Test | Production |
|---|---|---|---|
| Worker | `fitconnect-api-dev` | `fitconnect-api-test` | `fitconnect-api` |
| D1 | local miniflare state | `fit-db-test` | `fit-db` |
| R2 | local miniflare state | `fit-bucket-test` | `fit-bucket` |
| Pages project | — | `fitconnect-pwa-test` | `fitconnect-pwa` |
| App root domain | `localhost` | `test.fitconnect.co.in` | `fitconnect.co.in` |

API config lives in `apps/api/wrangler.toml` under `[env.test]` / `[env.production]`.
Wrangler does not inherit `vars`, `d1_databases`, `r2_buckets`, or `triggers` into a
named environment, so each block repeats everything it needs — that is deliberate,
not duplication to clean up.

PWA config lives in `apps/pwa/.env.development`, `.env.test`, and `.env.production`.
Every `VITE_*` value is inlined into the client bundle and is therefore public;
never put a secret in one.
  pnpm exec wrangler d1 export fit-db --remote --env production --output ./fit-db-export.sql
### First-time setup for the test environment

```bash
pnpm exec wrangler d1 create fit-db-test
```

```bash
pnpm exec wrangler r2 bucket create fit-bucket-test
```

Paste the returned `database_id` into the `[[env.test.d1_databases]]` block in
`apps/api/wrangler.toml`, then set the secrets and run migrations:

```bash
pnpm run secrets:test --workspace @fitconnect/api
```

```bash
pnpm run db:migrate:test --workspace @fitconnect/api
```

### Deploying

```bash
pnpm run deploy:test --workspaces --if-present
```

```bash
pnpm run deploy:production --workspaces --if-present
```

Or one app at a time with `pnpm run deploy:test --workspace @fitconnect/api`.

## Authorization

Access is decided by named permissions, not role-name comparisons. The catalog and
the role grants live in `packages/shared/src/types/permissions.ts`; both the API
middleware and the PWA's UI gating read from it, so a policy change lands in one
place. Platform staff and gym admins can further tune role grants at runtime
through the Roles &amp; Permissions screens, which persist overrides layered on top of
that catalog. See [`docs/authorization.md`](docs/authorization.md).

## Subscriptions

A membership is a span of paid time, and one derived date — `dueDate` — drives
access, suspension, renewal reminders, and the member's card. When a term starts
depends on whether the previous one is still running, has lapsed, or lapsed while
the member kept training. See [`docs/subscriptions.md`](docs/subscriptions.md).

## Adding another app

1. Create `apps/<name>` with a `package.json` named `@fitconnect/<name>`.
2. Extend the right compiler preset:
   `{ "extends": "@fitconnect/tsconfig/worker.json" }` for a Worker service, or
   `react-app.json` for a Vite front-end.
3. Add `"@fitconnect/shared": "*"` to its dependencies and import contracts from
   it rather than redefining them.
4. Give it `dev`, `build`, `typecheck`, `deploy:test`, and `deploy:production`
   scripts — the root scripts fan out across workspaces and will pick them up.
5. Run `pnpm install` at the root to link it.

No root config change is needed: the `apps/*` and `packages/*` globs already cover it.

## Workspace scripts

| Command | Effect |
|---|---|
| `pnpm run dev:api` / `pnpm run dev:pwa` | Start one app locally |
| `pnpm run typecheck` | Type-check every workspace |
| `pnpm run build` | Build every workspace |
| `pnpm run lint` / `pnpm run format` | Run each workspace's linter/formatter |
| `pnpm run deploy:test` / `pnpm run deploy:production` | Deploy every deployable workspace |




TODO
1. In tenent store
2. admin should be able to to crud on roles
3. Biometric integration
4. subscription rules — written up in [`docs/subscriptions.md`](docs/subscriptions.md); two known gaps listed there are still to fix 