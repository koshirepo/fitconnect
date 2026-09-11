import { defineConfig, globalIgnores } from "eslint/config";
import react from "@fitconnect/eslint-config/react";

export default defineConfig([
  globalIgnores(["dist", "dev-dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: react,
    rules: {
      "react-refresh/only-export-components": [
        "error",
        {
          allowConstantExport: true,
          // Hooks colocated with the provider they read from. Splitting them
          // into their own files would buy nothing but an extra import.
          allowExportNames: ["badgeVariants", "buttonVariants", "useToast", "usePermissions"],
        },
      ],
    },
  },
]);
