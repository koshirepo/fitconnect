/**
 * Documentation: Test setup for the PWA.
 *
 * - Its own config rather than a `test` block inside `vite.config.ts`. That config builds a service worker, injects a tenant manifest, and runs the React Compiler babel plugin — none of which a unit test needs, and all of which it would otherwise pay for on every run.
 * - `jsdom`, because what is worth testing here is behaviour a person would see: whether a route renders, whether a control is disabled, whether a member is shown something they should not be. A DOM-less environment can only check the pure helpers, which are mostly in `@fitconnect/shared` and already covered there.
 * - The `@/` alias is repeated here because this config does not extend the app's. Keeping them in step matters: a test that cannot resolve `@/lib/...` fails in a way that looks like a missing file rather than a missing alias.
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // The built output and the generated service worker are not sources.
    exclude: ["node_modules", "dist", "dev-dist", ".wrangler"],
  },
});
