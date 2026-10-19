/**
 * index.ts
 *
 * Barrel re-export for the `config/` directory.
 *
 * Consumers can import from `"@/config"` instead of specifying the
 * individual file, which keeps import lines shorter and makes future
 * restructuring of the config module easier.
 *
 * @module config
 *
 * @example
 * ```ts
 * import { SITE_NAME, queryClient, queryKeys } from "@/config";
 * ```
 */

export * from "./app";
export * from "./cache";
export * from "./environment";
export * from "./network";
