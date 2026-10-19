/**
 * organisms/index.ts
 *
 * Exports all organism components.
 *
 * Organisms are complex combinations of molecules and atoms.
 * They contain application logic, hooks, and coordinate multiple
 * molecules/atoms together to form complete UI sections.
 *
 * @example
 * ```tsx
 * import {
 *   CertificateSearchPanel,
 *   TransactionHistory,
 *   WalletConnector,
 * } from '@/components/organisms';
 * ```
 */

// Re-export page-level components as organisms
export { ErrorBoundary } from "../ErrorBoundary";
export { Footer } from "../Footer";
export { Header } from "../Header";
export { ManifestGeneratorModal } from "../ManifestGeneratorModal";
export { ManifestPreview } from "../ManifestPreview";
export { MobileNav } from "../MobileNav";
export { Navigation } from "../Navigation";
export { TransactionTracker } from "../TransactionTracker";
export { VerificationStatusTracker } from "../VerificationStatusTracker";
export { WalletModal } from "../WalletModal";
