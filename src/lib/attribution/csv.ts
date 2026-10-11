import type { AdConsent } from "./params";

/**
 * Een rij van de admin-export (spec-marketing-attribution.md): de
 * attributierij plus status en bron van de gekoppelde proefboeking of
 * terugbelaanvraag. Pure laag, zodat de kolommen testbaar zijn zonder
 * database.
 */
export interface LeadAttributionExportRow {
  createdAt: string;
  sourceType: "trial_booking" | "trial_request";
  sourceId: string;
  /** Status van de trial_booking (pending, paid, ...) of trial_request (new, ...); leeg als de bron weg is. */
  status: string;
  /** Alleen bij trial_booking: paid, code of opening. */
  bookingSource: string;
  email: string;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbclid: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  landingPath: string | null;
  adConsent: AdConsent;
}

// COPY: confirm met Marlon
export const LEAD_ATTRIBUTION_CSV_HEADER = [
  "Aangemaakt op",
  "Brontype",
  "Bron-id",
  "Status",
  "Boekingsbron",
  "E-mail",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "Landingspad",
  "Bannerkeuze",
] as const;

function quote(cell: string | null): string {
  return `"${(cell ?? "").replace(/"/g, '""')}"`;
}

/**
 * CSV met komma's en alles tussen aanhalingstekens, zoals de andere
 * admin-exports (OmzetCsvExport, trialCodesCsv). Tijdstip als ISO.
 */
export function leadAttributionsCsv(rows: readonly LeadAttributionExportRow[]): string {
  const body = rows.map((r) => [
    r.createdAt,
    r.sourceType,
    r.sourceId,
    r.status,
    r.bookingSource,
    r.email,
    r.gclid,
    r.gbraid,
    r.wbraid,
    r.fbclid,
    r.utmSource,
    r.utmMedium,
    r.utmCampaign,
    r.utmTerm,
    r.utmContent,
    r.landingPath,
    r.adConsent,
  ]);
  return [[...LEAD_ATTRIBUTION_CSV_HEADER], ...body]
    .map((row) => row.map(quote).join(","))
    .join("\n");
}
