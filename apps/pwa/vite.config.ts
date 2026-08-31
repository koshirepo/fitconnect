import { defineConfig, loadEnv, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

/** Repo root, so Vite may read files outside this app (the shared workspace package). */
const workspaceRoot = path.resolve(__dirname, "../..");

/**
 * Serve the per-gym manifest in development.
 *
 * In production a Cloudflare Pages Function answers `/manifest.webmanifest`
 * with the gym's own name and logo. Pages Functions do not run under Vite, so
 * on localhost the static build manifest was served instead — every install
 * from a gym subdomain came out called "FitConnect", which is not what ships.
 *
 * This runs the same handler the Pages Function exports, so what is tested on
 * `<slug>.localhost` matches what a member installs from
 * `<slug>.fitconnect.co.in`.
 */
function devTenantManifest(apiBaseUrl: string): PluginOption {
  return {
    name: "dev-tenant-manifest",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/manifest.webmanifest", (req, res, next) => {
        void (async () => {
          try {
            const { onRequestGet } = await import("./functions/manifest.webmanifest");
            const host = String(req.headers.host ?? "");

            const response = await onRequestGet({
              request: new Request(`http://${host}/manifest.webmanifest`),
              env: {
                API_BASE_URL: apiBaseUrl,
                // Bare "localhost", so `<slug>.localhost` resolves to a gym the
                // same way `<slug>.fitconnect.co.in` does in production.
                APP_ROOT_DOMAINS: "localhost",
              },
            });

            res.setHeader("Content-Type", "application/manifest+json");
            res.end(await response.text());
          } catch {
            // Fall through to the static manifest rather than break the page.
            next();
          }
        })();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Dev-only proxy target. Kept separate from VITE_API_URL: setting that would
  // also become the client's axios baseURL, which bypasses this proxy and turns
  // every local request cross-origin.
  const apiTarget = env.VITE_API_PROXY_TARGET || "http://localhost:8787";
  const navigationAllowlist = [/^(?!\/(?:api|uploads)(?:\/|$)).*/];

  return {
  plugins: [
    devTenantManifest(apiTarget),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    tailwindcss(),
    VitePWA({
      /**
       * The app updates itself, but not at a moment of its own choosing.
       *
       * "autoUpdate" hands that decision to the browser: the new worker takes
       * over the instant it downloads, which on this app can mean the page
       * swapping under somebody halfway through recording a payment. It also
       * means `onNeedRefresh` never fires, which is why the update prompt in
       * this codebase had never once appeared.
       *
       * "prompt" does not mean the user is asked — it means *we* decide when.
       * `register-sw.ts` applies the update on its own as soon as the app is
       * not being used, so it is still automatic from the outside.
       */
      registerType: "prompt",
      includeAssets: ["icons/icon.svg", "icons/*.png"],
      workbox: {
        // A generated service worker has no push handling of its own; this
        // adds the `push` and `notificationclick` listeners the admin
        // notifications need.
        importScripts: ["push-sw.js"],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Face detection and the charting library are ~1.1 MB between them and
        // each serves a single screen. Precaching them made every first visit
        // pay for both in the background; they are cached on first use instead.
        globIgnores: [
          "**/assets/vendor-tf-*.js",
          "**/assets/FinanceReportsPage-*.js",
          // Never precache the manifest. In production a Pages Function answers
          // this url with the gym's own name and logo, and a precached copy of
          // the build's platform manifest would be served from cache instead —
          // which is why every install from a gym subdomain was still called
          // "FitConnect" even though the endpoint itself was correct. A
          // manifest is only read when installing, which needs the network
          // anyway, so there is nothing to lose offline.
          "**/manifest.webmanifest",
        ],
        runtimeCaching: [
          {
            // Covers the chunks left out of the precache above, so a screen that
            // pulls one keeps working offline afterwards.
            urlPattern: /^\/assets\/.*\.js$/,
            handler: "CacheFirst",
            options: {
              cacheName: "lazy-chunks",
              expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^\/api\/(tenants|members|badges|payments|workouts|subscriptions|shifts)/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-data",
              expiration: { maxEntries: 200, maxAgeSeconds: 300 },
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^\/api\/public\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-public",
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^\/uploads\//,
            handler: "CacheFirst",
            options: {
              cacheName: "uploaded-images",
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        navigateFallback: "/index.html",
        navigateFallbackAllowlist: navigationAllowlist,
        cleanupOutdatedCaches: true,
        // Deliberately absent: `skipWaiting` would let a new worker seize
        // control mid-session. The waiting worker is told to take over by
        // `register-sw.ts`, at a moment it has chosen.
        clientsClaim: true,
      },
      manifest: {
        name: "FitConnect - Gym Management Software & Accessories Shop",
        short_name: "FitConnect",
        description:
          "All-in-one gym management software for fitness centers and health clubs. Manage members, payments, attendance, subscriptions, workout plans and shop premium gym accessories online.",
        start_url: "/dashboard",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#09090b",
        theme_color: "#09090b",
        categories: ["fitness", "health", "business", "shopping", "lifestyle"],
        lang: "en",
        icons: [
          { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
          { src: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png" },
          { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          {
            name: "Dashboard",
            short_name: "Dashboard",
            url: "/dashboard",
            icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }],
          },
          {
            name: "Members",
            short_name: "Members",
            url: "/members",
            icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }],
          },
          {
            name: "Payments",
            short_name: "Payments",
            url: "/payments",
            icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }],
          },
          {
            name: "Badges",
            short_name: "Badges",
            url: "/badges",
            icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }],
          },
          {
            name: "Shop Gym Accessories",
            short_name: "Shop",
            url: "/shop",
            icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96" }],
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: "module",
        navigateFallbackAllowlist: navigationAllowlist,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Resolved explicitly so the workspace package is compiled from source by
      // this app's pipeline, which keeps HMR working when shared contracts change.
      "@fitconnect/shared": path.resolve(workspaceRoot, "packages/shared/src"),
    },
  },
  optimizeDeps: {
    // Workspace source, not a published dependency — pre-bundling it would
    // freeze a stale copy between edits.
    exclude: ["@fitconnect/shared"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("react-dom") ||
            id.includes("react-router-dom") ||
            id.includes("/react/")
          ) {
            return "vendor-react";
          }
          if (id.includes("lucide-react")) {
            return "vendor-icons";
          }
          // Named so the service worker can keep them out of the precache: both
          // are large and only reached from one screen each.
          if (id.includes("@tensorflow") || id.includes("blazeface")) {
            return "vendor-tf";
          }
          // Deliberately NOT chunking recharts: a named manual chunk gets pulled
          // into the entry's preload graph, so it would load on every page
          // instead of only on the finance screen that imports it.
        },
      },
    },
  },
  server: {
    fs: {
      // Allow serving the shared workspace package from outside this app root.
      allow: [workspaceRoot],
    },
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
      "/uploads": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
};
});
