import { defineConfig, globalIgnores } from "eslint/config";
import base from "@fitconnect/eslint-config/base";

export default defineConfig([
  // `generated/` is Prisma's output and `dist/` is wrangler's — neither is
  // ours to fix, and both are large enough to drown a real finding.
  globalIgnores(["dist", ".wrangler", "src/generated", "worker-configuration.d.ts"]),
  {
    files: ["**/*.ts"],
    extends: base,
  },
]);
