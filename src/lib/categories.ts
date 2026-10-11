/**
 * Play categories — the one list every screen reads: labels, the order they
 * are offered in, and the badge colours of the playbook grid.
 *
 * This file holds complete Tailwind class names, so it is listed in the
 * `content` globs of tailwind.config.ts.
 */

import type { Category } from "@/lib/types";

interface CategoryInfo {
  /** Full label (selects, the share viewer). */
  label: string;
  /** Label where space is tight (grid filter chip, card badge), where it differs from `label`. */
  short?: string;
  /** Badge colours — a light pair and a dark pair (complete class names, so Tailwind sees them). */
  badge: string;
}

/**
 * Every category, in the order the selects and filter chips show them.
 * A Record, so a category added to the `Category` type must be added here.
 */
const INFO: Record<Category, CategoryInfo> = {
  offense: { label: "Offense", badge: "bg-[#DBEAFE] text-[#1E40AF] dark:bg-[#1E2F4D] dark:text-[#93C5FD]" },
  defense: { label: "Defense", badge: "bg-[#FEE2E2] text-[#991B1B] dark:bg-[#4A1D1D] dark:text-[#FCA5A5]" },
  inbound: { label: "Inbound", badge: "bg-[#D1FAE5] text-[#065F46] dark:bg-[#123A2C] dark:text-[#6EE7B7]" },
  "press-break": { label: "Press Break", badge: "bg-[#FEF3C7] text-[#92400E] dark:bg-[#45300B] dark:text-[#FCD34D]" },
  "fast-break": { label: "Fast Break", badge: "bg-[#EDE9FE] text-[#5B21B6] dark:bg-[#2E2456] dark:text-[#C4B5FD]" },
  oob: { label: "Out of Bounds", short: "OOB", badge: "bg-chip text-ink" },
  special: { label: "Special", badge: "bg-[#FCE7F3] text-[#9D174D] dark:bg-[#4A1936] dark:text-[#F9A8D4]" },
};

export const CATEGORIES = (Object.keys(INFO) as Category[]).map((value) => ({ value, ...INFO[value] }));

function byCategory(pick: (c: CategoryInfo) => string): Record<Category, string> {
  return Object.fromEntries(CATEGORIES.map((c) => [c.value, pick(c)])) as Record<Category, string>;
}

/** Short label per category (the full one unless a shorter exists). */
export const CATEGORY_SHORT_LABELS = byCategory((c) => c.short ?? c.label);

/** Full label per category. */
export const CATEGORY_LABELS = byCategory((c) => c.label);

/** Badge colour classes per category. */
export const CATEGORY_BADGE = byCategory((c) => c.badge);

/** Options of a category select (full labels). */
export const CATEGORY_OPTIONS: { value: Category; label: string }[] = CATEGORIES.map(({ value, label }) => ({
  value,
  label,
}));

/** Grid filter chips: "All" first, then every category under its short label. */
export const CATEGORY_FILTERS: { value: Category | "all"; label: string }[] = [
  { value: "all", label: "All" },
  ...CATEGORIES.map(({ value, label, short }) => ({ value, label: short ?? label })),
];
