import type { Pillar } from "@/lib/member/plan-coverage";

/**
 * Central tone-mapping tables. Before this lived, the same
 * pillar→border-color and status→text-color dictionaries were written
 * out in every rendering component: AdminSessionBlock, PlanBadge,
 * MembershipStatusBadge, HoursRow, AttendanceList, MobileAttendanceList,
 * and the trainer-uren page each had their own switch or object
 * literal. This file is the one source of truth.
 */

export type ChipTone =
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "muted";

/** Ordered so consumers can iterate canonical pillar keys. */
export const PILLAR_KEYS: Pillar[] = [
  "vrij_trainen",
  "yoga_mobility",
  "kettlebell",
  "kids",
  "senior",
];

/**
 * Background + border-left color per pillar (used on schedule blocks,
 * badges, attendance cards). Deliberately distinct from status tone —
 * pillar is identity, status is state.
 */
export const PILLAR_BG_CLASS: Record<Pillar, string> = {
  vrij_trainen: "bg-[color:var(--stone-500)]",
  yoga_mobility: "bg-accent",
  kettlebell: "bg-[color:var(--warning)]",
  kids: "bg-[color:var(--success)]",
  senior: "bg-[color:var(--stone-600)]",
};

export const PILLAR_BORDER_LEFT_CLASS: Record<Pillar, string> = {
  vrij_trainen: "border-l-[color:var(--stone-500)]",
  yoga_mobility: "border-l-accent",
  kettlebell: "border-l-[color:var(--warning)]",
  kids: "border-l-[color:var(--success)]",
  senior: "border-l-[color:var(--stone-600)]",
};

export function pillarBg(pillar: string): string {
  return PILLAR_BG_CLASS[pillar as Pillar] ?? "bg-text-muted";
}

export function pillarBorderLeft(pillar: string): string {
  return PILLAR_BORDER_LEFT_CLASS[pillar as Pillar] ?? "border-l-text-muted";
}

/**
 * Text + dot color classes for each `ChipTone`. Use via <Chip tone> or
 * standalone when rendering a status eyebrow.
 */
export const TONE_TEXT_CLASS: Record<ChipTone, string> = {
  accent: "text-accent",
  success: "text-[color:var(--success)]",
  warning: "text-[color:var(--warning)]",
  danger: "text-[color:var(--danger)]",
  muted: "text-text-muted",
};

export const TONE_DOT_CLASS: Record<ChipTone, string> = {
  accent: "bg-accent",
  success: "bg-[color:var(--success)]",
  warning: "bg-[color:var(--warning)]",
  danger: "bg-[color:var(--danger)]",
  muted: "bg-text-muted",
};

export const TONE_BORDER_CLASS: Record<ChipTone, string> = {
  accent: "border-accent/40",
  success: "border-[color:var(--success)]/40",
  warning: "border-[color:var(--warning)]/40",
  danger: "border-[color:var(--danger)]/40",
  muted: "border-text-muted/30",
};
