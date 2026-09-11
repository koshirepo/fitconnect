/**
 * Documentation: The lint rules every workspace shares.
 *
 * - Exists for the same reason `@fitconnect/tsconfig` does: the API, the PWA and the shared package were not held to the same standard, because only one of them had a config. The API was not linted at all.
 * - Only rules that make sense without a DOM live here. React-specific rules are in `./react`, which extends this.
 * - Primary export: default flat config array.
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      /**
       * A leading underscore is how this codebase marks a binding it
       * destructured only to leave behind — `const { _count, ...rest }`.
       * Without this that idiom is an error on every flatten helper.
       */
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      /**
       * A warning, not an error, and deliberately so.
       *
       * This flags code that works and needs a judgement call to change — an
       * `any` at a driver boundary where the real shape is the adapter's
       * business. As an error it would have meant either a day of unrelated
       * edits before the API could be linted at all, or muting the rule and
       * never seeing it again.
       *
       * The same treatment `react-hooks/set-state-in-effect` gets in the React
       * preset: visible, counted, burned down on purpose.
       *
       * Nothing type-aware is enabled here. Rules like
       * `prefer-nullish-coalescing` need a project service wired up per
       * package, which is worth doing and is a separate change from turning
       * the linter on in the first place.
       */
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
