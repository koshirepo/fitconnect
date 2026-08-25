/**
 * Documentation: Top-level shared barrel.
 *
 * - Aggregates the public shared contract surface so downstream code can import common API and model types from one entrypoint.
 * - This file should stay small and export-only; do not introduce runtime side effects here.
 */
// ─── @gms/shared barrel ──────────────────────────────────────────────────────
// Top-level re-export so consumers can do:
//   import type { User } from "@gms/shared";
//   import { formatCurrency } from "@gms/shared";

export * from "./types/index";
export * from "./constants/index";
export * from "./utils/index";
