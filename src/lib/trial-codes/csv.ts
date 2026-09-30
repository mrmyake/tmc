import type { CreatedTrialCode } from "@/lib/admin/trial-codes-actions";
import { SCOPE_LABEL } from "@/lib/trial-codes/scope";

/** "Eenmalig", "5 keer" of "Onbeperkt"; dezelfde tekst als de admin-tabel. */
export function kindText(maxUses: number | null): string {
  // COPY: confirm met Marlon
  if (maxUses === null) return "Onbeperkt";
  if (maxUses === 1) return "Eenmalig";
  return `${maxUses} keer`;
}

function quote(cell: string): string {
  return `"${cell.replace(/"/g, '""')}"`;
}

/**
 * CSV van net aangemaakte codes: code, label, soort, scope, aangemaakt op.
 * Zelfde opmaak als de andere admin-exports (komma's, alles tussen
 * aanhalingstekens). Aangemaakt op is een ISO-tijdstip, eenduidig voor
 * spreadsheets en sortering.
 */
export function trialCodesCsv(codes: readonly CreatedTrialCode[]): string {
  // COPY: confirm met Marlon
  const header = ["Code", "Label", "Soort", "Scope", "Aangemaakt op"];
  const rows = codes.map((c) => [
    c.code,
    c.label,
    kindText(c.maxUses),
    SCOPE_LABEL[c.scope],
    c.createdAt,
  ]);
  return [header, ...rows].map((row) => row.map(quote).join(",")).join("\n");
}
