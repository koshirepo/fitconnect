import { defineConfig } from "eslint/config";
import base from "@fitconnect/eslint-config/base";

export default defineConfig([
  {
    files: ["**/*.ts"],
    extends: base,
  },
]);
