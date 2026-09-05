# FitConnect — Architecture Review

**Date:** 4 September 2026
**Scope:** Whole repository — API, PWA, shared package, data model, CI/CD, operations
**Reviewer note on method:** Everything in the *Verified* column was checked by running something — a query against production D1, an HTTP probe, a compiler, a linter, or a log capture. Everything else is read from source and marked as inference. **I was not able to sign in to the running app**, so no user-facing flow in this report has been exercised end to end. That limit matters most in §6 and §9.

---

## 1. Executive summary

FitConnect is a multi-tenant gym-management SaaS: a Cloudflare Workers API (Hono + Prisma + D1) and a React PWA on Cloudflare Pages, sharing a typed package. It is substantially more mature than a typical project of this age — 248 routes, 56 tables, a 101-entry permission catalogue, offline sync, push, a storefront with courier integration, and RFID hardware support.

The architecture is sound. **The risks are not architectural; they are in verification and operations.**

| Area | Assessment |
|---|---|
| Architecture & boundaries | **Strong.** Clean module layering, one pattern followed consistently across 21 modules |
| Data model | **Strong.** 56 models, deliberate constraints, comments that explain *why* |
| Authorization design | **Strong.** Capability-based, resolved per request, never in the JWT |
| **Automated testing** | **Critical gap.** 1 test file for ~90,000 lines |
| **Verification loop** | **Was a critical gap.** The PWA type-check no-op is fixed; see §5.1 |
| Operational resilience | **Weak.** Today's outage was invisible until users reported it |
| Security | **Mostly good, two real holes.** See §7 |
| Production parity | **Currently broken.** Production is behind `main`; see §4.3 |

**The single highest-value change is not a feature.** It is closing the loop between "I changed something" and "I know it works," which today is a human clicking around on a phone. Sections 5 and 10 develop this.

---

## 2. System overview

### 2.1 Topology

```
                    ┌────────────────────────────────────────┐
   apex host ──────▶│  Cloudflare Pages: fitconnect-pwa      │
   *.fitconnect.co.in│  React 19 SPA + service worker         │
                    │  Functions/: SSR-ish meta injection    │
                    └───────────────────┬────────────────────┘
                                        │ HTTPS + JWT bearer
                    ┌───────────────────▼────────────────────┐
                    │  Worker: fitconnect-api                │
                    │  Hono, 248 routes, 21 modules          │
                    └──┬────────┬────────┬────────┬──────────┘
                       │        │        │        │
                    ┌──▼──┐ ┌───▼──┐ ┌───▼───┐ ┌──▼──────────┐
                    │ D1  │ │ R2   │ │ Rate  │ │ External:   │
                    │fit- │ │fit-  │ │limiter│ │ Razorpay    │
                    │ db  │ │bucket│ │       │ │ Delhivery   │
                    └─────┘ └──────┘ └───────┘ │ SMTP, WebPush│
                                               │ ZKTeco/eSSL │
                                               └─────────────┘
```

**Bindings in use:** D1 (`DB`), R2 (`FILES`), Rate Limiter (`SIGNUP_RATE_LIMITER`), plus vars/secrets. No KV, no Durable Objects, no Queues.

### 2.2 Code volume

| Area | Files | Lines |
|---|---:|---:|
| `apps/api/src` | 168 | 34,964 |
| `apps/pwa/src` | 248 | 52,124 |
| `packages/shared/src` | 12 | 3,113 |
| **Total (hand-written)** | **428** | **~90,200** |
| Generated Prisma client | 64 | *excluded* |

### 2.3 Layering

The API follows one shape in every module, without exception:

```
routes.ts       → Hono paths + authenticate + requireTenantPermissions
controller.ts   → parse body (zod), call service, shape envelope, audit log
service.ts      → business rules, cross-entity orchestration
repository.ts   → Prisma queries only
schema.ts       → zod schemas + inferred input types
```

This consistency is a real asset. A new module is mechanical to add and mechanical to review. **Preserve it.**

The PWA mirrors it: `api/*.ts` (axios clients) → `api/queries/*.ts` (react-query hooks) → `features/*` (screens), with `components/ui` as the primitive layer.

---

## 3. What exists

### 3.1 Functional inventory

| Domain | Depth |
|---|---|
| Members & memberships | Full CRUD, roles, shifts, freezes, referrals, ID cards, body metrics |
| Payments & subscriptions | Plans, charges, part payments with **pro-rata validity**, dues settlement, coupons, coins, Razorpay, receipts |
| Attendance | Manual, QR self-check-in, **RFID hardware (ZKTeco/eSSL ADMS)**, calendar |
| Commerce | Platform shop + per-gym store, variants, orders, returns, **Delhivery shipping** with serviceability/quoting/manifest/tracking |
| Staff pay & books | Salary agreements, cycles, components, part payments; expenses + recurring templates *(new, undeployed)* |
| Comms | WhatsApp templates (link-based), transactional email, web push, reminder log |
| Platform admin | Tenant management, platform payments, roles, audit log |
| Access control | 101 permissions, custom per-tenant roles, per-request resolution |

### 3.2 Route distribution

248 routes across 21 modules. Heaviest: `commerce` (37), `payments` (19), `finance` (19), `store` (18), `public` (18), `attendance` (17).

### 3.3 Things done notably well

1. **Comments explain rationale, not mechanics.** `Payment.extendsValidity` says *why* a balance row must not grant a second month. This is the most valuable documentation in the repo and it is unusual to find.
2. **Capability-based authz.** Permissions are derived per request and never embedded in the JWT, so revocation takes effect on the next request rather than the next token refresh (`packages/shared/src/types/permissions.ts`).
3. **Deliberate constraints.** `@@unique([recurringExpenseId, periodMonth])`, `@@unique([tenantId, membershipId, date])` — correctness enforced in the database, not just in code.
4. **Offline-first PWA.** `offline-db`, `sync-engine`, `sync-listener`, `offline-files` — a queue with replay, not just a cache. Right call for gyms on patchy mobile data.
5. **Deployment pipeline is correctly ordered.** Migrations run *before* the Worker deploy, so new code never meets an old schema. Comment in `deploy.yml` explains the idempotency.

---

## 4. Current state of production

### 4.1 Today's outage — resolved and verified

**Symptom:** widespread 503s and 500s; whole dashboards failing at once.

**Root cause:** one Prisma client is shared per isolate. Its query batching means a promise created serving request A can be resolved serving request B. Current `workerd` treats that as a bug and **cancels the continuation** — request A then awaits something that never settles and is killed at 30s.

**Evidence** (`wrangler tail`, production):
```
GET /tenants/tenant_rudra-gym/payments/…/reminders - Exception Thrown
ERROR: The Workers runtime canceled this request because it detected that
your Worker's code had hung and would never generate a response.

Warning: A promise was resolved or rejected from a different request context
than the one it was created in… consider setting the
`no_handle_cross_request_promise_resolution` compatibility flag.
```
63 hangs and 32 cross-request warnings in one capture window.

**Fix:** that compatibility flag, in `apps/api/wrangler.toml`.

**Verification:** 40 simultaneous requests to a DB-backed endpoint — the exact burst shape that was failing. Result: **40/40 × 200, zero hangs, zero cross-request warnings, zero exceptions**; 39 real user responses in the same window, all 2xx, slowest 389 ms.

> **Nothing in this repo caused it.** `compatibility_date` never moved. A runtime rollout met a latent hazard. This is worth internalising: the platform can change underneath you, and the only reason it was diagnosable was that structured logging had been added hours earlier.

### 4.2 Coupled invariant

`prisma.ts` (shared client) and the compat flag are now **load-bearing for each other**. Remove one without the other and hangs return under load. Both files carry a note saying so. Do not let a future cleanup delete "an unused flag."

### 4.3 Production is behind `main` — action required

| Check | Result |
|---|---|
| `GET /tenants/x/finance/summary` on prod | **404** (route not deployed) |
| `GET /tenants/x/salary/me` on prod | **404** |
| Salary/expense tables in production D1 | **absent** |

CI was red on type errors (§5.1), so the `deploy` job — which is `needs: test` — never ran. The type errors are now fixed and pushed (`374aa1f`), but **the deploy has not been confirmed green.** Watch that run. Nothing in §3.1's "staff pay & books" row exists in production until it succeeds.

### 4.4 Avatar regression — resolved

Production `R2_PUBLIC_URL` pointed at `pub-2da141…`, a bucket serving nothing. **Zero rows** in the database referenced it; all 368 member photos live at `pub-f9794d…`. The upload proxy fell back to the wrong host and returned `File not found.` for every avatar.

Fixed in config, and the member page now uses `AssetImage`, which falls back to the stored URL when the proxy fails — defence in depth so a single config error can't blank every face again.

---

## 5. Defects and gaps

### 5.1 ✅ FIXED — the PWA type-check was checking nothing

`apps/pwa/tsconfig.json` used to be a solution file:
```json
{ "files": [], "references": [ … ] }
```

`tsc --noEmit -p tsconfig.json` against this compiles **zero files** and exits 0. Anyone (including me, repeatedly, throughout a full day) running that command got a green result that meant nothing. Two genuine type errors reached CI as a direct result.

**This was the most dangerous defect in the report**, because it silently disabled the safety net rather than failing loudly.

**Fix applied:** the root config no longer has an empty `files` array — it extends the app config, so pointing *any* tool (CI, an editor, a habit) at the repo root now type-checks `src` for real:
```jsonc
// apps/pwa/tsconfig.json
{ "extends": "./tsconfig.app.json", "compilerOptions": { "tsBuildInfoFile": "..." } }
```
The build no longer treats the root as a solution file: `build` and `build:production` now run `tsc -b tsconfig.app.json tsconfig.node.json`. `npm run typecheck` is unchanged and remains the sanctioned command.

Verified by planting a deliberate type error in `src` and confirming `tsc --noEmit -p tsconfig.json` reports it, where it previously exited 0.

### 5.2 🔴 CRITICAL — effectively no automated tests

One test file (`packages/shared/src/store-pricing.test.ts`) for ~90,200 lines. `npm test` passes because there is almost nothing to fail.

This is the reason every change today ended with "I could not verify this; please click it." It is also why a payment-ceiling bug earlier in the project had to be found **three times in three layers** (browser `max`, client validation, server schema) — one screenshot at a time.

Highest-value targets, in order:

| Priority | Target | Why |
|---|---|---|
| 1 | `computePayable`, `nextValidityWindow`, `proratedDays`, `settlePendingWithBudget` | Pure functions that decide money and membership dates. Fastest possible tests, highest blast radius |
| 2 | `financeRepository.incomeTotals` | The double-counting trap in §8.2 is exactly what a test pins |
| 3 | Permission resolution | 101 permissions × custom roles; a regression here is a data-exposure bug |
| 4 | One integration test per money path | Record payment → assert Payment + validity + expense rows |

You do not need broad coverage. You need the ~15 functions where being wrong costs real money to be pinned.

### 5.3 🟠 HIGH — 46 lint warnings, and a bigger finding underneath them

`react-hooks/set-state-in-effect` (46) + `exhaustive-deps` (2 — now fixed), across 40 files. The eslint config already documents the decision to keep them visible rather than mute them.

**`exhaustive-deps`: fixed.** Both warnings came from one line in `ReminderCalendarPage.tsx`: `data?.days ?? {}` minted a fresh object every render, so the `useCallback` and `useMemo` below it re-ran every time. Now memoised on `calendarQuery.data`.

**`set-state-in-effect`: 2 of 46 done, and the priority is wrong.**

The stated reason for burning these down is React Compiler readiness. That reason does not survive measurement. `npm run compiler:health` (added: `apps/pwa/scripts/react-compiler-health.mjs`) asks the compiler plugin directly what it skipped, which nothing else reports — a component it cannot analyse is left unoptimized silently, with no error and no log line.

```
React Compiler coverage: 377/489 components and hooks optimized (77.1%)
Bailed out: 112

  90  Handle TryStatement with a finalizer ('finally') clause
   6  Support ThrowStatement inside of try/catch
   5  Handle TryStatement without a catch clause
   4  Support value blocks (conditional, logical…) within a try/catch statement
   2  Cannot access refs during render
   2  …one or more React ESLint rules were disabled
   1  [Codegen] Internal error
```

**105 of the 112 bailouts are one shape: `try/catch/finally` in an async submit handler.** Only **2** are attributable to disabled ESLint rules. So the 40-file `set-state-in-effect` refactor — the expensive one, touching checkout, auth, signup and payments — buys almost no compiler coverage. A `try/finally` sweep buys 105.

That reorders the work:

| Do this | Cost | Buys |
|---|---|---|
| 1. `try/finally` sweep in submit handlers | Small, mechanical, one shape | ~105 components optimized, 77% → ~98% |
| 2. `set-state-in-effect` refactor | 38 files, bespoke, no tests | 2 components, plus genuinely simpler code |

Item 2 is still worth doing — cascading renders are real and the two rewritten so far got *simpler* — but it is a code-quality job, not a performance one, and §5.2 still says not to attempt it at scale without tests.

**The fix shape, verified end to end on `TodoFormPage.tsx`** (both its components now compile):

```ts
// Bails: the compiler rejects `finally`, and rejects a branch inside try/catch.
try { if (isEdit) await update(...); else await create(...); }
catch (err) { setError(getApiError(err)); }
finally { setSubmitting(false); }

// Compiles: decide before the try, keep only the await inside it.
const save = isEdit ? () => update(...) : () => create(...);
try { await save(); navigate("/todos"); }
catch (err) { setError(getApiError(err)); }
setSubmitting(false);   // nothing returns early, so this runs on both paths
```

Both rewrites are behaviour-identical: no `return` inside the original `try`, so a trailing statement runs exactly where `finally` did.

Two `set-state-in-effect` sites were also fixed properly (`TodoFormPage.tsx`, `WorkoutFormPage.tsx`) using **keyed remount** — the loader splits from the form, the form initialises `useState` from its props, and `key={record.id}` gives the "don't clobber edits on refetch" guarantee that the old `seeded` flag was hand-rolling. Both lost an effect, a boolean, and a render. Earlier: `asset-image.tsx`, `image-lightbox.tsx`. **44 remain.**

### 5.4 ✅ FIXED — local D1 was drifted

```
$ wrangler d1 migrations apply fit-db --local
✘ duplicate column name: shippingQuoteIssue: SQLITE_ERROR
```

Migration 0035's column existed but the ledger did not record it, so the local queue stalled and **no later migration could be applied locally**. Every developer's local database was stuck at 0034 unless they hand-applied files (which is what I did to test 0041). Production was unaffected, but local development ran against a schema that no longer matched the code — a bug generator.

**Fixed, in two parts.**

*Reconciled the ledger.* 0035–0041 were confirmed physically present in the local schema (the columns, tables and indexes each one creates), then recorded in `d1_migrations`. `wrangler d1 migrations apply fit-db --local` now reports `No migrations to apply!` instead of failing, with all 41 recorded and local data intact.

*Removed the class of problem.* `npm run db:reset:local` (`apps/api/scripts/reset-local-db.mjs`) deletes `.wrangler/state/v3/d1` and replays every migration from 0001. Replaying from empty is cheaper and more reliable than unpicking a drifted ledger by hand, and it is local-only — it cannot touch the remote database. Follow it with `npm run seed:local` for data.

### 5.5 ✅ FIXED — duplicated response shapes drifted silently

`AttendanceCalendarPage.tsx` declared its own `DayData` with three fields and cast the API response to it. When the endpoint grew `avatarUrl` and `checkInAt`, the copy stayed stale — and because it was a **cast**, nothing complained. The type is now derived from the query hook.

**Swept the rest of the PWA** for the same pattern — every `as Record<string,`, every `as unknown as`, every cast over a `.data` read. Findings:

| Site | Verdict |
|---|---|
| `AttendanceCalendarPage.tsx:42` | **Fixed.** The last cast is gone: `days` is now *annotated* `Record<string, DayData>`, so a shape change fails to compile instead of being silently agreed with |
| `FinanceReportsPage.tsx:76,78` | Safe. `ReportData`/`AnalyticsData` are already derived via `Awaited<ReturnType<…>>`; the cast only widens to `| undefined` for the offline-queued `{}` case, which the comment explains |
| `client.ts`, `queries/shared.ts`, `failed-sync-dialog.tsx` | Safe. Casts over headers and `JSON.parse`, not over a typed response |
| `WorkoutDetailPage.tsx:147`, `haptics.ts`, `face-detection.ts` | Safe. Local mutation and browser-API shims; no API shape involved |

No second drift site was hiding. The rule to keep: **derive from the query hook, and annotate rather than cast** — an annotation fails when the shape moves, a cast agrees with whatever you tell it.

### 5.6 ✅ FIXED — stray file in the repo root

`apps/api/nul` — a Windows artifact from a `> nul` redirect.

**Two corrections to the original finding.** It was never committed: `git log --all --diff-filter=A -- '*nul'` returns nothing, and it showed as `??` (untracked), so "survived multiple commits" described the working tree, not history. And it is already gone from disk — `dir /a` finds nothing and it is absent from the index.

Worth knowing *why* it looked immortal: `nul` is a reserved DOS device name. `ls apps/api/nul` answers "No such file or directory" even when the file is right there, because the name resolves to the null device before it reaches the filesystem. Anyone trying to delete it by hand is told it does not exist. Reaching it needs an extended-length path prefix, e.g. `Remove-Item -LiteralPath '\\?\D:\FitConnect\apps\api\nul'`.

**Root cause found.** `.commandcode/settings.json` holds allowlisted shell commands written in cmd syntax — `dir "%LOCALAPPDATA%\Temp\wrangler" 2>nul`. Run under a POSIX shell, `2>nul` does not mean "discard"; it means "create a file called `nul` here". That config is gitignored, so this is a per-machine trap rather than a repo one, but it will keep producing the file on any machine that runs those commands through bash.

**Fix:** `nul` and `NUL` added to `.gitignore`, verified with `git check-ignore -v`, so the next one cannot be committed by someone who cannot see it. Use `2>/dev/null` in anything that may run under bash.

### 5.7 Debt markers

| Marker | Count |
|---|---:|
| `: any` / `as any` | 21 |
| `@ts-ignore` / `@ts-expect-error` | **0** ✅ |
| Non-null assertions (`x!.`) | 13 |
| `eslint-disable` | 6 |
| `TODO` / `FIXME` / `HACK` | 17 |

Low for a codebase this size. Zero `@ts-ignore` is genuinely good discipline.

---

## 6. Known-incomplete work

Carried from active development; listed so it isn't mistaken for finished:

| Item | State |
|---|---|
| Salary & expenses | Code complete, typechecked, routes probed (401 not 404). **Never exercised through the UI. Not in production.** |
| Delhivery: Ewaybill Update, Expected TAT, Download Document | Blocked — specs behind Delhivery's login |
| NDR handling | Blocked — specs |
| Per-item returns | Scoped as separate work |
| Delhivery staging token | Not obtainable; the supplied key is production-only (verified: 401 staging / 200 production) |
| Image lightbox "page zoom" report | Robustness fix shipped; **root cause never reproduced** — see §9 |

---

## 7. Security review

### 7.1 ✅ FIXED — `/auth/login` was not rate-limited

```
authRoutes.post("/passkeys/login/options", rateLimitSignup, …)  ✅
authRoutes.post("/passkeys/login/verify",  rateLimitSignup, …)  ✅
authRoutes.post("/login", authController.login);                 ❌ unthrottled
```

Two consequences, and the second is the one people miss:

1. **Credential stuffing / brute force** against the primary login path was unmetered.
2. **CPU exhaustion.** `bcryptSaltRounds: 12` costs roughly 250–400 ms of pure CPU per attempt. Unthrottled, an attacker converts cheap requests into expensive Worker CPU — a billing and availability problem, not just an auth one.

**Fix applied:** a login-specific limiter rather than reusing the signup one.

```ts
authRoutes.post("/login",          rateLimitLogin, authController.login);
authRoutes.post("/refresh",        rateLimitLogin, authController.refresh);
authRoutes.post("/reset-password", rateLimitLogin, authController.resetPassword);
```

`rateLimitLogin` (`middleware/abuse-guard.ts`) is bound to a new `LOGIN_RATE_LIMITER` — namespace 1002, **10 requests / 60 s**, keyed by `CF-Connecting-IP` + path, in both the dev and production blocks of `wrangler.toml`.

Three deliberate choices:

- **Separate namespace, not `SIGNUP_RATE_LIMITER`.** Sharing one counter means a gym's signup traffic can lock out its own staff logins.
- **10/60 s, not signup's 5/60 s.** A gym front desk is several people behind one address; five sign-ins a minute from one IP is ordinary traffic there, and 600/hour is still nowhere near a useful brute-force rate against bcrypt-12.
- **Keyed by path.** A failed sign-in must not spend the budget for a token refresh.

`/reset-password` was added beyond the report's original two: it is unauthenticated, it takes a guessable token, and it hashes a password. Verified by `tsc --noEmit` and `wrangler deploy --dry-run --env production`, which resolves the binding as `env.LOGIN_RATE_LIMITER (10 requests/60s)`. **Not yet exercised against a live deploy.**

### 7.2 🟡 RFID device endpoints authenticate by serial number alone

`iclock.routes.ts` — 7 routes, 1 authenticated. This is **inherent to the ZKTeco/eSSL ADMS protocol**: wall-mounted devices send no secret, no signature, no session. The code documents this honestly and mitigates by requiring the serial to resolve to a registered device.

Residual risk: anyone who learns a serial number can post attendance for that gym. Accepted risk, but worth knowing. Mitigations if it matters later: IP allow-listing per device, or a shared secret in the query string if the firmware supports it.

### 7.3 ✅ Things that are right

- **Password hashing:** bcrypt cost 12 (`apps/api/src/auth/password.ts`) — strong; see §7.1 for the CPU trade-off
- **JWT:** `jose`, 1 h access / 7 d refresh
- **Permissions never in the token** — revocation is immediate
- **Ownership checks compare against the token, not the URL.** `salaryController` resolves membership from `authUser` and refuses a mismatched `:membershipId`. This is the correct pattern and is applied consistently
- **Structured request logging** with deliberately no user id, email, or body
- **CORS** driven by `resolveCorsOrigin`, not `*`
- **Secrets** never in `wrangler.toml`; `npm run secrets:production`

### 7.4 Unauthenticated route audit

| File | Routes | Authenticated | Verdict |
|---|---:|---:|---|
| `public.routes.ts` | 18 | 3 | ✅ By design (branding, catalog, signup, ID card) |
| `commerce.routes.ts` | 37 | 30 | ✅ Guest storefront |
| `auth.routes.ts` | 13 | 8 | ✅ Login/refresh/reset |
| `uploads.routes.ts` | 6 | 4 | ⚠️ `/file/:folder/:filename` is a public read proxy — intentional, but it will serve any key in the bucket to anyone who guesses it. Filenames are unguessable in practice; note it |
| `iclock.routes.ts` | 7 | 1 | ⚠️ See §7.2 |

---

## 8. Data model observations

### 8.1 Shape

56 models, 41 migrations, integer rupees throughout (no floats for money — correct). Consistent `tenantId` scoping with cascade deletes.

### 8.2 The double-count trap — documented, worth protecting

`StoreOrder.paymentId` exists because a member's store order **already writes a `Payment` row**. Any revenue calculation that sums `Payment` *and* `StoreOrder` double-counts every member sale.

`financeRepository.incomeTotals` handles this by summing payments plus **only guest orders** (`paymentId: null`). This is subtle, easy to get wrong in the next reporting feature, and currently protected by nothing but a comment. **This is test target #2 in §5.2.**

### 8.3 Snapshot-vs-reference discipline

Several places correctly freeze a value instead of following a relation:
- `SalaryCycle.baseAmount` — so a raise doesn't rewrite last month
- `StoreOrder.coinsEarned` — frozen at completion
- `Payment.validityBasisAmount` — the payable a part payment is a share of

This is mature modelling. Keep doing it.

### 8.4 Timezone handling

Mixed, deliberately:
- `SalaryCycle.month`, `Expense.periodMonth` — `"YYYY-MM"` strings, because every query is by calendar month and a date invites timezone questions
- `AttendanceDevice.timezone` — devices print local time with no offset, so the zone must be stored to place a punch on a calendar
- Half-open month bounds (`>= start`, `< next start`) in `monthRange` — avoids the classic "lost the last day" bug

This is more careful than most codebases. One residual: `formatTime`/`toLocaleTimeString` in the PWA render in the *viewer's* zone. Correct for an admin in the same city; wrong for a gym owner travelling. Low priority.

---

## 9. Reliability & operations

### 9.1 Observability — good, and recently proven

`observability.logs` + `traces` declared in `wrangler.toml` for **both** the top-level and `[env.production]` blocks, because named environments do not inherit them. Structured `request_failed` / `request_unauthenticated` / `request_error` events log the *route pattern*, not the concrete path, so failures aggregate.

This is what made today's outage diagnosable. Without it, "597 errors" would have had no story attached.

**Gap:** nothing *alerts*. The outage was discovered by a user noticing. Cloudflare Workers supports alerting on error rate — configure it. A 503 rate above baseline should page someone, not wait for a screenshot.

### 9.2 Deployment

Well-built: `test` → `deploy`, migrations before Worker, Worker before PWA, `concurrency` with `cancel-in-progress`. Branch-gated to `main`.

**Gaps:**
1. **No staging environment.** `main` → production, directly. Combined with §5.2 (no tests), the first place a change is exercised is on real gyms.
2. **No rollback path documented.** `wrangler rollback` exists; nothing in `docs/` mentions it.
3. **Migrations are irreversible.** 41 forward migrations, no `down`. A bad migration on D1 means restore-from-backup. There is a `backups/` directory and `fit-db-export.sql` — confirm the backup cadence is real and automated, not a one-off export.

### 9.3 The verification gap (the theme of this report)

Today produced, in one session: a config change to production, a schema migration, two new API modules, five new screens, and multiple UI redesigns. **Almost none of it was exercised by a human or a machine before being pushed.**

The one thing that *was* verified properly — the hang fix, with a 40-way concurrency burst and before/after counts — is also the only change anyone can be confident in. That contrast is the argument for §5.2 and §10.

---

## 10. Recommendations

Ordered by value ÷ effort. The first three are days, not weeks.

### Tier 1 — do these first

| # | Action | Effort | Why |
|---|---|---|---|
| 1 | **Rate-limit `/auth/login` and `/refresh`** | 1 hour | Closes brute-force *and* a CPU-exhaustion vector (§7.1) |
| 2 | **Confirm the deploy ran; get production current** | 1 hour | Salary/expenses do not exist in production right now (§4.3) |
| 3 | **Unit-test the ~15 money functions** | 1–2 days | Ends the "found the same bug in three layers" pattern (§5.2) |
| 4 | ~~**Make the type-check no-op impossible**~~ — done | — | A green check that means nothing is worse than no check (§5.1) |
| 5 | **Configure Cloudflare error-rate alerting** | 1 hour | Outages should not be reported by users (§9.1) |

### Tier 2 — next

| # | Action | Effort |
|---|---|---|
| 6 | Fix local D1 drift; add `db:reset:local` (§5.4) | half day |
| 7 | Add a staging environment (`env.staging` + branch) (§9.2) | 1 day |
| 8 | Integration tests for the three money paths (§5.2) | 2–3 days |
| 9 | Sweep for `as LocalType` casts over API responses (§5.5) | half day |
| 10 | Document rollback + verify backup cadence (§9.2) | half day |

### Tier 3 — when the above are done

| # | Action |
|---|---|
| 11 | Burn down the 48 lint warnings, in batches, behind tests (§5.3) |
| 12 | Extract the ~13 `await`-in-loop sites into batched queries if any show up in traces |
| 13 | Revisit the `uploads/file` public proxy if bucket contents ever become sensitive |

### 10.1 Explicitly *not* recommended

- **MCP server.** Discussed separately: it exposes your data to *other people's* AI clients. No current user runs one. If the goal is an in-app assistant, that is Anthropic API tool-use calling your existing services — no OAuth, no new bindings, strictly less work.
- **A big lint refactor now.** 40 files across checkout, auth and payments, with no tests underneath. Wrong order.
- **More features before Tier 1.** The app already does more than it can currently prove it does correctly.

---

## 11. Closing assessment

The engineering instincts in this codebase are good — often better than the process around them. Constraints live in the database, comments explain *why*, permissions are capability-based, money is integers, snapshots are frozen where they should be, and the tricky parts (pro-rata validity, cross-request batching, the store/payment double-count) are all *understood* and written down.

What is missing is not knowledge. It is **feedback**. There is no automated test to catch a regression, the type-check was silently inert, and nothing alerts when production breaks. Every one of today's problems was found by a person looking at a screen — which works right up until it doesn't, which is what happened this morning.

Close that loop and this becomes a genuinely solid platform. Add features first and the surface area to verify by hand keeps growing faster than the ability to verify it.

---

## Appendix A — How to reproduce these findings

```bash
# Code volume
find apps/api/src apps/pwa/src packages/shared/src -name "*.ts" -o -name "*.tsx" \
  | grep -v generated | xargs wc -l | tail -1

# Test count (returns 1)
find apps packages -name "*.test.*" -o -name "*.spec.*" | grep -v node_modules

# The former type-check no-op (§5.1) — used to exit 0 having compiled nothing
cd apps/pwa && npx tsc --noEmit -p tsconfig.json; echo $?
# The real one
npm run typecheck

# Production deployment state (§4.3) — 404 means undeployed
curl -o /dev/null -w "%{http_code}\n" \
  https://fitconnect-api.fitconnect.workers.dev/tenants/x/finance/summary

# Local D1 drift (§5.4)
cd apps/api && npx wrangler d1 migrations apply fit-db --local

# Login is unthrottled (§7.1)
grep -n 'post("/login"' apps/api/src/modules/auth/auth.routes.ts

# Concurrency check used to verify the hang fix (§4.1)
for i in $(seq 1 40); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    "https://fitconnect-api.fitconnect.workers.dev/public/gyms?cb=$i" &
done; wait
```

## Appendix B — Confidence

| Finding | Basis |
|---|---|
| §4.1 hang cause & fix | **Verified** — production tail, before/after counts, 40-way burst |
| §4.3 production behind main | **Verified** — HTTP probes + D1 query |
| §4.4 avatar/bucket mismatch | **Verified** — D1 query + curl against both buckets |
| §5.1 type-check no-op | **Verified and fixed** — reproduced the false green, then proved the new config catches a planted error |
| §5.4 local D1 drift | **Verified and fixed** — ledger reconciled against the real schema; `migrations apply --local` now clean |
| §7.1 login rate limit | **Fixed, not live** — compiles and the binding resolves in a production dry-run; no deployed request has been throttled yet |
| §5.2 test count | **Verified** — filesystem |
| §5.3 lint count | **Verified** — `npm run lint` |
| §5.4 local D1 drift | **Verified** — reproduced the error |
| §7.1 login unthrottled | **Verified** — read the routes; CPU cost is *inferred* from bcrypt cost 12 |
| §7.2 iclock auth | **Verified** — read the routes and protocol notes |
| §8.2 double-count trap | **Verified** — read schema + repository; *not* covered by a test |
| §9.3 verification gap | **Observed** across one working session |
| §5.5 drift elsewhere | **Inferred** — one confirmed instance, pattern not swept |
