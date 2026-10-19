/**
 * components/index.ts
 *
 * Main export file for all components organized by atomic design hierarchy.
 *
 * Structure:
 * - atoms: Basic building blocks (buttons, inputs, badges, etc.)
 * - molecules: Simple combinations of atoms (cards, search fields, etc.)
 * - organisms: Complex combinations (headers, panels, modals, etc.)
 * - templates: Page-level layouts
 * - features: Feature-specific component collections
 * - utils: Providers and utility components
 *
 * @example
 * ```tsx
 * // Import atoms
 * import { Button, Badge, Spinner } from '@/components/atoms';
 *
 * // Import molecules
 * import { Card, SearchField } from '@/components/molecules';
 *
 * // Import organisms
 * import { Header, Footer } from '@/components/organisms';
 *
 * // Import features
 * import { CertificateLookupForm } from '@/components/features/certificates';
 *
 * // Import utilities
 * import { ThemeProvider } from '@/components/utils';
 * ```
 */

// Atomic Design Hierarchy
export * from "./atoms";
export * as features from "./features";
export * from "./molecules";
export * from "./organisms";
export * from "./templates";
export * as utils from "./utils";

// Confidence scoring
export { default as ConfidencePanel } from "./ConfidencePanel";
export { default as ConfidenceScore, ConfidenceScoreHelp } from "./ConfidenceScore";
export { default as ConfidenceExplanation } from "./ConfidenceExplanation";

// Dispute governance workflow
export { default as DisputeSubmissionForm } from "./DisputeSubmissionForm";
export { default as DisputeAuditTrail } from "./DisputeAuditTrail";

// Multi-anchor provenance
export { default as ProvenanceAnchors } from "./ProvenanceAnchors";

// Legacy landing page components (can be reorganized into atoms/molecules)
export { default as About } from "./About";
export { default as CallToAction } from "./CallToAction";
export { default as Ecosystem } from "./Ecosystem";
export { HeroSection } from "./HeroSection";
export { default as HowItWorks } from "./HowItWorks";

// Legacy utilities (to be migrated into utils)
export { APIHealthIndicator } from "./APIHealthIndicator";
export { APIKeyManagement } from "./APIKeyManagement";
export { ContentHashCalculator } from "./ContentHashCalculator";
export { MediaSnapshotPreview } from "./MediaSnapshotPreview";
export { AssetStatusFilterChips, matchesAssetStatusFilter, type AssetStatusFilter } from "./AssetStatusFilterChips";
export { ShareVerificationModal } from "./ShareVerificationModal";
