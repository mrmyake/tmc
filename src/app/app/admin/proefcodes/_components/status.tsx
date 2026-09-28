import { Chip } from "@/components/ui/Chip";
import type { ChipTone } from "@/lib/tone";
import type { TrialCodeRow, TrialCodeStatus } from "@/lib/admin/trial-codes-query";

// COPY: confirm met Marlon
export const STATUS_CHIP: Record<TrialCodeStatus, { label: string; tone: ChipTone }> = {
  active: { label: "Actief", tone: "accent" },
  exhausted: { label: "Op", tone: "muted" },
  revoked: { label: "Ingetrokken", tone: "danger" },
};

export function StatusChip({ status }: { status: TrialCodeStatus }) {
  return <Chip tone={STATUS_CHIP[status].tone}>{STATUS_CHIP[status].label}</Chip>;
}

/** "Eenmalig", "5 keer" of "Onbeperkt". */
export function kindLabel(maxUses: number | null): string {
  // COPY: confirm met Marlon
  if (maxUses === null) return "Onbeperkt";
  if (maxUses === 1) return "Eenmalig";
  return `${maxUses} keer`;
}

/** "1 van 1", "3 van 5" of "12 (onbeperkt)". */
export function usageLabel(row: Pick<TrialCodeRow, "usesCount" | "maxUses">): string {
  // COPY: confirm met Marlon
  if (row.maxUses === null) return `${row.usesCount} (onbeperkt)`;
  return `${row.usesCount} van ${row.maxUses}`;
}
