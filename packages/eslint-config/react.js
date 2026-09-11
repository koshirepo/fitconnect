/**
 * Documentation: The shared rules, plus what only a React app needs.
 *
 * - Extends `./base` rather than repeating it, so a rule added for everyone reaches the PWA without being written twice.
 * - Primary export: default flat config array.
 */
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import base from "./base.js";

export default [
  ...base,
  reactHooks.configs.flat.recommended,
  reactRefresh.configs.vite,
  {
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      /**
       * Flags effects that call setState synchronously — a React Compiler
       * readiness rule, not a correctness one. The current hits are working
       * code (form seeding, fetch-then-set loaders) and each needs
       * restructuring into derived state, a keyed remount, or react-query.
       * Kept visible as a warning so the count can be burned down
       * deliberately rather than muted.
       */
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];
