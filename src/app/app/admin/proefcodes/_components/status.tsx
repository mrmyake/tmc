import { Chip } from "@/components/ui/Chip";
import type { ChipTone } from "@/lib/tone";
import type { TrialCodeRow, TrialCodeStatus } from "@/lib/admin/trial-codes-query";
import { SCOPE_LABEL, type TrialCodeScope } from "@/lib/trial-codes/scope";
import { kindText } from "@/lib/trial-codes/csv";

// COPY: confirm met Marlon
export const STATUS_CHIP: Record<TrialCodeStatus, { label: string; tone: ChipTone }> = {
  active: { label: "Actief", tone: "accent" },
  exhausted: { label: "Op", tone: "muted" },
  revoked: { label: "Ingetrokken", tone: "danger" },
};

export function StatusChip({ status }: { status: TrialCodeStatus }) {
  return <Chip tone={STATUS_CHIP[status].tone}>{STATUS_CHIP[status].label}</Chip>;
}

/** De scope als chip ("Geldig voor"). Vrij trainen krijgt de accenttoon. */
export function ScopeChip({ scope }: { scope: TrialCodeScope }) {
  return (
    <Chip tone={scope === "vrij_trainen" ? "accent" : "muted"} dot={false}>
      {SCOPE_LABEL[scope]}
    </Chip>
  );
}

/** "Eenmalig", "5 keer" of "Onbeperkt". */
export function kindLabel(maxUses: number | null): string {
  return kindText(maxUses);
}

/** "1 van 1", "3 van 5" of "12 (onbeperkt)". */
export function usageLabel(row: Pick<TrialCodeRow, "usesCount" | "maxUses">): string {
  // COPY: confirm met Marlon
  if (row.maxUses === null) return `${row.usesCount} (onbeperkt)`;
  return `${row.usesCount} van ${row.maxUses}`;
}

/** "Batch van 10" onder het label; alleen voor codes uit een batch. */
export function batchLabel(size: number | null): string | null {
  // COPY: confirm met Marlon
  return size !== null && size > 1 ? `Batch van ${size}` : null;
}
