import { Chip } from "@/components/ui/Chip";
import type { ChipTone } from "@/lib/tone";
import type { TrialCodeRow, TrialCodeStatus } from "@/lib/admin/trial-codes-query";
import { SCOPE_LABEL, type TrialCodeScope } from "@/lib/trial-codes/scope";
import { kindText } from "@/lib/trial-codes/csv";

// COPY: confirm met Marlon
export const STATUS_CHIP: Record<TrialCodeStatus, { label: string; tone: ChipTone }> = {
  active: { label: "Actief", tone: "accent" },
  exhausted: { label: "Op", tone: "muted" },
  expired: { label: "Verlopen", tone: "muted" },
  revoked: { label: "Ingetrokken", tone: "danger" },
};

/** "Geldig t/m 26 nov. 2026" uit een YYYY-MM-DD-datum, zonder tijdzoneverschuiving. */
export function validThroughLabel(validThrough: string | null): string | null {
  if (!validThrough) return null;
  const [y, m, d] = validThrough.split("-").map(Number);
  const text = new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  // COPY: confirm met Marlon
  return `Geldig t/m ${text}`;
}

/** Chips voor de twee campagnevlaggen; niets als beide uit staan. */
export function RuleChips({ row }: { row: Pick<TrialCodeRow, "newCustomersOnly" | "onePerPerson"> }) {
  return (
    <>
      {/* COPY: confirm met Marlon */}
      {row.newCustomersOnly && <Chip tone="muted" dot={false}>Alleen nieuwe klanten</Chip>}
      {/* COPY: confirm met Marlon */}
      {row.onePerPerson && <Chip tone="muted" dot={false}>1x per persoon</Chip>}
    </>
  );
}

export function StatusChip({ status }: { status: TrialCodeStatus }) {
  return <Chip tone={STATUS_CHIP[status].tone}>{STATUS_CHIP[status].label}</Chip>;
}

/** De scope als chip ("Geldig voor"). Vrij trainen en alles krijgen de accenttoon. */
export function ScopeChip({ scope }: { scope: TrialCodeScope }) {
  return (
    <Chip tone={scope === "vrij_trainen" || scope === "all" ? "accent" : "muted"} dot={false}>
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
