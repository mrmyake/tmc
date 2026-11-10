/**
 * Product toekennen zonder betaling (spec-facturatie.md 9.8): de pure regels
 * die de UI en de server action delen. De database (tmc._grant_product_core)
 * is leidend; dit bestand spiegelt de poort en de telling zodat het scherm
 * nooit een keuze aanbiedt die de RPC toch weigert, en vertaalt de redenen
 * van de RPC naar tekst.
 */

export interface GrantCatalogueRow {
  slug: string;
  kind: string;
  display_name: string;
  credits: number | null;
  validity_months: number | null;
  billing_cycle_weeks: number | null;
  is_active: boolean;
}

/** Zelfde whitelist als tmc.activate_order en tmc._grant_product_core. */
export function grantPlanType(slug: string): "ten_ride_card" | "pt_package" | null {
  if (slug.startsWith("ten_ride_card")) return "ten_ride_card";
  if (["pt_single", "pt_10", "duo_single", "duo_10"].includes(slug)) return "pt_package";
  return null;
}

/**
 * Los product met tegoed: kind product, credits, geen incassocyclus, actief
 * en op de whitelist. Abonnementen, add-ons, fees, programma's en drop_in*
 * vallen af.
 */
export function isGrantableProduct(row: GrantCatalogueRow): boolean {
  return (
    row.kind === "product" &&
    row.credits !== null &&
    row.credits > 0 &&
    row.billing_cycle_weeks === null &&
    row.is_active &&
    grantPlanType(row.slug) !== null
  );
}

export interface GrantableProduct {
  slug: string;
  displayName: string;
  credits: number;
  validityMonths: number | null;
}

export function toGrantableProducts(rows: GrantCatalogueRow[]): GrantableProduct[] {
  return rows.filter(isGrantableProduct).map((r) => ({
    slug: r.slug,
    displayName: r.display_name,
    credits: r.credits as number,
    validityMonths: r.validity_months,
  }));
}

// COPY: confirm met Marlon
export function grantTermsLabel(p: { credits: number; validityMonths: number | null }): string {
  const credits = p.credits === 1 ? "1 credit" : `${p.credits} credits`;
  return p.validityMonths
    ? `${credits}, ${p.validityMonths} maanden geldig`
    : `${credits}, geen vervaldatum`;
}

export interface GrantInvoiceLine {
  catalogueSlug: string | null;
  quantity: number;
}

/**
 * Toegestaan aantal toekenningen voor een factuur en slug: de som van
 * quantity van de regels met die slug, naar beneden afgerond; 1 als de slug
 * niet op de factuur staat.
 */
export function allowedGrantCount(lines: GrantInvoiceLine[], slug: string): number {
  const matching = lines.filter((l) => l.catalogueSlug === slug);
  if (matching.length === 0) return 1;
  return Math.floor(matching.reduce((sum, l) => sum + l.quantity, 0));
}

export interface InvoiceGrantCounter {
  slug: string;
  displayName: string;
  credits: number;
  validityMonths: number | null;
  allowed: number;
  granted: number;
}

/**
 * De tellers voor "Product klaarzetten" op een betaalde factuur: een rij per
 * toekenbare slug op de factuurregels, plus elke slug waarvoor al een
 * (niet ingetrokken) toekenning aan deze factuur hangt.
 */
export function invoiceGrantCounters(
  lines: GrantInvoiceLine[],
  activeGrantSlugs: string[],
  products: GrantableProduct[],
): InvoiceGrantCounter[] {
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const slugs: string[] = [];
  for (const s of [...lines.map((l) => l.catalogueSlug), ...activeGrantSlugs]) {
    if (s && bySlug.has(s) && !slugs.includes(s)) slugs.push(s);
  }
  return slugs.map((slug) => {
    const p = bySlug.get(slug) as GrantableProduct;
    return {
      slug,
      displayName: p.displayName,
      credits: p.credits,
      validityMonths: p.validityMonths,
      allowed: allowedGrantCount(lines, slug),
      granted: activeGrantSlugs.filter((s) => s === slug).length,
    };
  });
}

export interface GrantInput {
  profileId: string;
  slug: string;
  reason: string;
  invoiceId?: string | null;
  allowDuplicate?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Invoercontrole voor de action; null betekent in orde. */
// COPY: confirm met Marlon
export function validateGrantInput(input: GrantInput): string | null {
  if (!UUID_RE.test(input.profileId)) return "Onbekend lid.";
  if (!input.slug || grantPlanType(input.slug) === null) {
    return "Dit product kan niet toegekend worden.";
  }
  if (!input.reason || !input.reason.trim()) return "Geef een reden op.";
  if (input.reason.trim().length > 500) return "De reden is te lang (maximaal 500 tekens).";
  if (input.invoiceId && !UUID_RE.test(input.invoiceId)) return "Onbekende factuur.";
  return null;
}

/** Tekst bij een weigering van tmc.admin_grant_product. */
// COPY: confirm met Marlon
export function grantFailureMessage(
  reason: string | undefined,
  extra: { granted?: number; allowed?: number } = {},
): string {
  switch (reason) {
    case "invalid_reason":
      return "Geef een reden op.";
    case "profile_not_found":
      return "Dit lid bestaat niet meer.";
    case "product_not_found":
    case "product_not_grantable":
      return "Dit product kan niet toegekend worden. Alleen losse producten met tegoed, geen abonnementen.";
    case "invoice_not_found":
      return "Deze factuur bestaat niet.";
    case "invoice_profile_mismatch":
      return "Deze factuur is van een ander lid.";
    case "invoice_not_finalised":
      return "Deze factuur is nog een concept.";
    case "invoice_is_credit_note":
      return "Aan een creditnota kan geen product gekoppeld worden.";
    case "invoice_credited":
      return "Deze factuur is gecrediteerd. Ken het product zonder factuur toe als dat toch de bedoeling is.";
    case "invoice_not_paid":
      return "Deze factuur is nog niet betaald. Ken het product toe zodra de betaling binnen is, of zonder factuur met het factuurnummer in de reden.";
    case "invoice_payment_reversed":
      return "De betaling van deze factuur is teruggedraaid.";
    case "invoice_test_mismatch":
      return "Testfactuur en lid passen niet bij elkaar (testmodus wijkt af).";
    case "already_granted":
      return `Dit product is voor deze factuur al toegekend (${extra.granted ?? 0} van ${extra.allowed ?? 0}).`;
    default:
      return "Product toekennen lukte niet.";
  }
}

/** Tekst bij een weigering van tmc.admin_revoke_product_grant. */
// COPY: confirm met Marlon
export function revokeFailureMessage(
  reason: string | undefined,
  extra: { creditsRemaining?: number; creditsTotal?: number } = {},
): string {
  switch (reason) {
    case "invalid_reason":
      return "Geef een reden op.";
    case "grant_not_found":
      return "Deze toekenning bestaat niet.";
    case "already_revoked":
      return "Deze toekenning is al ingetrokken.";
    case "membership_not_found":
    case "membership_not_active":
      return "Dit tegoed is niet meer actief.";
    case "credits_used":
      return `Er is al tegoed verbruikt (${extra.creditsRemaining ?? 0} van ${extra.creditsTotal ?? 0} over). Intrekken kan niet meer; gebruik "Credits aanpassen".`;
    case "credits_adjusted":
      return 'Het saldo is handmatig aangepast. Intrekken kan niet meer; gebruik "Credits aanpassen".';
    default:
      return "Intrekken lukte niet.";
  }
}

/**
 * Een creditrij zonder prijs en zonder incassocyclus (een toegekend product)
 * heeft geen bedrag om te tonen: "€ 0 per 0 weken" is misleidend.
 */
export function hasCyclePrice(row: {
  pricePerCycleCents: number;
  billingCycleWeeks: number;
}): boolean {
  return !(row.pricePerCycleCents === 0 && row.billingCycleWeeks === 0);
}
