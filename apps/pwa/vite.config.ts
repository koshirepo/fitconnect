import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_URL || "http://localhost:4000";
  const navigationAllowlist = [/^(?!\/(?:api|uploads)(?:\/|$)).*/];

  return {
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon.svg", "icons/*.png"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
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
        skipWaiting: true,
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
    },
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
          if (id.includes("react-markdown") || id.includes("remark-gfm")) {
            return "vendor-markdown";
          }
          if (id.includes("lucide-react")) {
            return "vendor-icons";
          }
        },
      },
    },
  },
  server: {
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
