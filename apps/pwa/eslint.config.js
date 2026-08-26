import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dev-dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'react-refresh/only-export-components': [
        'error',
        {
          allowConstantExport: true,
          // Hooks colocated with the provider they read from. Splitting them into
          // their own files would buy nothing but an extra import.
          allowExportNames: [
            'badgeVariants',
            'buttonVariants',
            'useToast',
            'usePermissions',
          ],
        },
      ],
      // Flags effects that call setState synchronously — a React Compiler
      // readiness rule, not a correctness one. The 38 current hits are working
      // code (form seeding, fetch-then-set loaders) and each needs restructuring
      // into derived state, a keyed remount, or react-query. Kept visible as a
      // warning so the count can be burned down deliberately rather than muted.
      'react-hooks/set-state-in-effect': 'warn',
      // A leading underscore is how this codebase marks a binding it destructured
      // only to leave it behind.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
])
