/**
 * atoms/index.ts
 *
 * Exports all atomic (base) components.
 *
 * Atoms are the smallest building blocks - buttons, badges, inputs, etc.
 * They contain no business logic and are purely presentational.
 *
 * @example
 * ```tsx
 * import { Button, Badge, Spinner } from '@/components/atoms';
 * ```
 */

// Re-export existing UI components as atoms
export { Accordion, type AccordionProps } from "../ui/Accordion";
export { Avatar, type AvatarProps } from "../ui/Avatar";
export { Button, type ButtonProps } from "../ui/Button";
export { EmptyState, type EmptyStateProps } from "../ui/EmptyState";
export { FormInput, type FormInputProps } from "../ui/FormInput";
export { HelpIcon } from "../ui/HelpIcon";
export { LiveRegion } from "../ui/LiveRegion";
export { Skeleton } from "../ui/Skeleton";
export { Spinner } from "../ui/Spinner";
export { StatusBadge as Badge, type StatusBadgeProps as BadgeProps } from "../ui/StatusBadge";
export { Tabs, type TabsProps } from "../ui/Tabs";
export { Tooltip, type TooltipProps } from "../ui/Tooltip";
