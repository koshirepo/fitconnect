# Fit Connect PWA

This repository contains the React frontend for Fit Connect. It is a Vite-based progressive web app used by gym staff, members, and public visitors for gym management, attendance, payments, commerce, and public gym pages.

The app is organized by feature area:

- `features`: page-level flows such as auth, members, payments, workouts, attendance, badges, settings, commerce, and public pages
- `components`: shared UI, layout, form, and error-boundary components
- `api`: Axios clients and request helpers
- `stores`: persisted Zustand state such as authentication and current tenant selection
- `lib`: cross-cutting browser helpers for caching, assets, push notifications, WhatsApp links, and formatting
- `shared` and `types`: shared DTOs, constants, and frontend-facing models

## Stack

- React 19
- TypeScript
- Vite
- React Router
- Zustand
- Axios
- Tailwind CSS v4
- `vite-plugin-pwa`

## Feature Areas

- Auth: login, session restore, password reset, and route guards
- Members: member list, member detail, onboarding, referrals, and badges
- Payments: payment history, payment detail, payment recording, and subscriptions
- Attendance: self check-in, staff attendance marking, and calendar views
- Workouts: workout plans and assignments
- Settings: gym settings, public page settings, WhatsApp templates, and finance reports
- Commerce: public catalog, cart, checkout, order lookup, and admin product and order management
- Public pages: landing page, gym profile pages, about, and contact
- Platform staff: tenant creation and tenant administration

## App Flow

1. [`src/main.tsx`](L:/gms/v2/pwa/src/main.tsx) boots React, routing, and global styles.
2. [`src/App.tsx`](L:/gms/v2/pwa/src/App.tsx) defines public routes, authenticated routes, lazy loading, and top-level offline/PWA UI.
3. [`src/stores/auth.ts`](L:/gms/v2/pwa/src/stores/auth.ts) persists auth state and current tenant context.
4. [`src/api/client.ts`](L:/gms/v2/pwa/src/api/client.ts) attaches auth headers, refreshes expired tokens, serves cached reads offline, and queues failed mutations.
5. Feature pages compose shared UI and call API modules under `src/api`.

## Repository Map

- [`src/App.tsx`](L:/gms/v2/pwa/src/App.tsx): route tree, guards, suspense, and shell-level UI
- [`src/api`](L:/gms/v2/pwa/src/api): Axios client plus feature-specific API wrappers
- [`src/components`](L:/gms/v2/pwa/src/components): layout primitives, reusable UI, forms, and error handling
- [`src/features`](L:/gms/v2/pwa/src/features): domain-focused page components and route targets
- [`src/lib`](L:/gms/v2/pwa/src/lib): cache, assets, push, formatting, and browser integration helpers
- [`src/stores`](L:/gms/v2/pwa/src/stores): persisted Zustand stores
- [`src/styles`](L:/gms/v2/pwa/src/styles): shared styling assets
- [`src/types`](L:/gms/v2/pwa/src/types): API and model type exports
- [`public`](L:/gms/v2/pwa/public): icons, manifest assets, and static files served as-is

## Local Setup

Examples below use `pnpm` because the frontend deploy script does too.

1. Install dependencies.

```bash
pnpm install
```

2. Create a local env file such as `.env.local`.

Common variables:

- `VITE_API_URL`: backend base URL, for example `http://localhost:8787`
- `VITE_VAPID_PUBLIC_KEY`: public VAPID key for browser push notifications

3. Start the development server.

```bash
pnpm dev
```

By default, Vite proxies `/api` and `/uploads` to `VITE_API_URL` during local development.

## Common Commands

- `pnpm dev`: start the Vite dev server
- `pnpm build`: run TypeScript build checks and create the production bundle
- `pnpm preview`: serve the production bundle locally
- `pnpm typecheck`: run TypeScript without emitting files
- `pnpm lint`: run ESLint
- `pnpm format`: format the workspace with Prettier
- `pnpm format:check`: verify formatting without writing changes
- `pnpm deploy`: build and deploy `dist` to Cloudflare Pages

## PWA And Offline Notes

- Service worker registration is configured in [`vite.config.ts`](L:/gms/v2/pwa/vite.config.ts).
- Public API reads and selected tenant-scoped API reads are cached with Workbox strategies.
- Uploaded assets under `/uploads` are cached separately for longer-lived media reuse.
- [`src/lib/api-cache.ts`](L:/gms/v2/pwa/src/lib/api-cache.ts) provides offline response fallback and queued mutation support.
- Install prompts, update prompts, sync status, and offline banners are mounted at the app shell level.

## Deployment

The frontend is deployed to Cloudflare Pages through Wrangler.

Typical flow:

1. Set the production `VITE_API_URL`.
2. Verify the build locally with `pnpm build`.
3. Deploy with `pnpm deploy`.

## Documentation Notes

- Hand-maintained frontend files should prefer ASCII comments and clear top-level documentation where the file owns important routing, state, or browser behavior.
- Generated assets and build output are not treated as documentation targets.
