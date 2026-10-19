/**
 * CardGrid — #764
 *
 * Single source of truth for multi-column card layouts so spacing and column
 * breakpoints stay consistent across dashboards and listings.
 *
 * - Fixed gap scale per density (no one-off gap-3 / gap-4 mixes per page).
 * - Items stretch to the tallest card in their row; give the card
 *   `flex flex-col` and push its footer/action down with `mt-auto` so actions
 *   line up even when content heights differ.
 * - `min-w-0` on items stops long hashes/addresses from widening a column.
 *
 * Usage:
 *   <CardGrid layout="stats">{cards}</CardGrid>
 *   <CardGrid as="ul" layout="listing">{items.map(i => <li key={i.id}>…</li>)}</CardGrid>
 */

import React from "react";

import { cn } from "@/utils/cn";

export type CardGridLayout = "stats" | "stats-3" | "summary" | "listing" | "gallery" | "compact";
export type CardGridDensity = "comfortable" | "dense";

const layoutClasses: Record<CardGridLayout, string> = {
  /** KPI / metric tiles: 1 → 2 → 4 */
  stats: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  /** Three-up stat tiles: 1 → 2 → 3 */
  "stats-3": "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  /** Short numeric summaries that read fine two-up on phones: 2 → 4 */
  summary: "grid-cols-2 md:grid-cols-4",
  /** Content cards with title/body/meta: 1 → 2 → 3 */
  listing: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  /** Thumbnail tiles: 2 → 3 → 4 */
  gallery: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
  /** Small metric chips: 2 → 3 → 6 */
  compact: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
};

const densityClasses: Record<CardGridDensity, string> = {
  comfortable: "gap-4 lg:gap-6",
  dense: "gap-3 sm:gap-4",
};

const defaultDensity: Record<CardGridLayout, CardGridDensity> = {
  stats: "comfortable",
  "stats-3": "comfortable",
  summary: "dense",
  listing: "comfortable",
  gallery: "comfortable",
  compact: "dense",
};

export interface CardGridProps extends React.HTMLAttributes<HTMLElement> {
  layout?: CardGridLayout;
  density?: CardGridDensity;
  as?: "div" | "ul" | "section" | "ol";
}

export function cardGridClassName(layout: CardGridLayout = "listing", density?: CardGridDensity): string {
  return cn(
    "grid items-stretch [&>*]:min-w-0",
    layoutClasses[layout],
    densityClasses[density ?? defaultDensity[layout]]
  );
}

export function CardGrid({ layout = "listing", density, as: Tag = "div", className, children, ...props }: CardGridProps) {
  return (
    <Tag className={cn(cardGridClassName(layout, density), className)} {...props}>
      {children}
    </Tag>
  );
}

export default CardGrid;
