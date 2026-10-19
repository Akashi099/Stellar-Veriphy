/**
 * molecules/index.ts
 *
 * Exports all molecular components.
 *
 * Molecules are combinations of atoms that form functional units.
 * Examples: search fields, cards, form groups, etc.
 * They may have simple local state but contain minimal business logic.
 *
 * @example
 * ```tsx
 * import { SearchField, Card, FormGroup } from '@/components/molecules';
 * ```
 */

// Re-export existing composite components as molecules
export { CopyButton } from "../CopyButton";
export { AutoSaveIndicator } from "../ui/AutoSaveIndicator";
export { Breadcrumbs, type BreadcrumbsProps } from "../ui/Breadcrumbs";
export { Card } from "../ui/Card";
export { ConfirmDialog, type ConfirmDialogProps } from "../ui/ConfirmDialog";
export { LoadingTransition } from "../ui/LoadingTransition";
export { Modal, type ModalProps } from "../ui/Modal";
export { NotificationBanner } from "../ui/NotificationBanner";
export { Search, type SearchProps } from "../ui/Search";
export { StatusBadge } from "../ui/StatusBadge";
