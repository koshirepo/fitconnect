/**
 * Documentation: Shared type barrel.
 *
 * - Re-exports the shared enum, model, and API envelope modules from a single import surface.
 * - Prefer importing shared contracts from this barrel in client code to reduce deep relative import paths.
 */
// Re-export everything from submodules for convenient imports:
//   import type { User, ApiResponse, PlatformRole } from "@gms/shared/types";

export * from "./enums";
export * from "./models";
export * from "./api";
