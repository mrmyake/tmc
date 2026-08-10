import "server-only";

/**
 * Rekenregels voor factuurregels (spec-facturatie.md 3.1/9.3): bruto is
 * leidend, de BTW is de afgeleide, en net = gross - vat zodat de twee per
 * definitie optellen tot het bruto. Zelfde formule als _compute_order_price
 * en de PR 2-backfill; ::numeric-equivalent via Math.round (half away from
 * zero is hier gelijk aan Postgres' round voor positieve bedragen; voor
 * creditnota's rekenen we op het positieve bedrag en spiegelen daarna,
 * zodat de afronding exact het origineel volgt).
 */
export function splitGross(grossCents: number, vatRateBp: number): {
  netCents: number;
  vatCents: number;
} {
  const sign = grossCents < 0 ? -1 : 1;
  const abs = Math.abs(grossCents);
  const vat = Math.round((abs * vatRateBp) / (10000 + vatRateBp));
  return { netCents: sign * (abs - vat), vatCents: sign * vat };
}

/** De toegestane tarieven in de keuzelijst (9.3): 9, 21 en 0 procent. */
export const VAT_RATE_OPTIONS_BP = [900, 2100, 0] as const;

export interface InvoiceLineInput {
  lineNo: number;
  catalogueSlug: string | null;
  description: string;
  quantity: number;
  grossCents: number;
  vatRateBp: number;
  revenueCategory: string | null;
}

/** Eén regel bruto-in, volledig uitgerekend uit (regels van 2.6). */
export function computeLine(input: InvoiceLineInput) {
  const { netCents, vatCents } = splitGross(input.grossCents, input.vatRateBp);
  return {
    line_no: input.lineNo,
    catalogue_slug: input.catalogueSlug,
    description: input.description,
    quantity: input.quantity,
    unit_net_cents: input.quantity !== 0 ? Math.round(netCents / input.quantity) : netCents,
    vat_rate_bp: input.vatRateBp,
    net_cents: netCents,
    vat_cents: vatCents,
    gross_cents: input.grossCents,
    revenue_category: input.revenueCategory,
  };
}
