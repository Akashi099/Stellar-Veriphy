/**
 * features/index.ts
 *
 * Exports all feature-specific component collections.
 *
 * Features are organized by domain (certificates, batch, wallet, etc.)
 * and contain all components related to that feature.
 *
 * @example
 * ```tsx
 * import * as CertificateFeature from '@/components/features/certificates';
 * import * as BatchFeature from '@/components/features/batch';
 * import * as WalletFeature from '@/components/features/wallet';
 * ```
 */

// Re-export feature collections
export * as batch from "./batch";
export * as certificates from "./certificates";
export * as manifest from "./manifest";
export * as transactions from "./transactions";
export * as wallet from "./wallet";
