/**
 * Eén bron voor de online koopbare losse producten (rittenkaarten en
 * PT-/Duo-pakketten), gedeeld door /kopen (publiek) en /app/producten
 * (ingelogd). Prijzen komen nooit hiervandaan, altijd uit tmc.catalogue;
 * dit bestand draagt alleen de slug-selectie, de groepering en de
 * marketing-copy per slug (tmc.catalogue draagt bewust geen tekst).
 *
 * Spiegelt de whitelist in tmc._compute_order_price (productbranch):
 * ten_ride_card%, pt_single, pt_10, duo_single, duo_10. GEEN drop_in* (die
 * lopen via de proeflesflow) en GEEN ten_ride_card_kids/_senior (is_active
 * false in de catalogus).
 */

export const PRODUCT_SLUGS = [
  "ten_ride_card",
  "pt_single",
  "pt_10",
  "duo_single",
  "duo_10",
] as const;

// COPY: confirm met Marlon
export const PRODUCT_DESCRIPTIONS: Record<string, string> = {
  ten_ride_card: "Tien groepslessen, vrij in te zetten.",
  pt_single: "Eén persoonlijke sessie met een trainer.",
  pt_10: "Tien persoonlijke sessies.",
  duo_single: "Eén sessie voor twee personen.",
  duo_10: "Tien duo-sessies.",
};

export interface ProductGroup {
  // COPY: confirm met Marlon
  title: string;
  // COPY: confirm met Marlon
  hint: string;
  slugs: string[];
}

export const PRODUCT_GROUPS: ProductGroup[] = [
  {
    title: "Groepslessen los",
    hint: "Zonder abonnement",
    slugs: ["ten_ride_card"],
  },
  {
    title: "Personal Training",
    hint: "1 op 1 met een trainer",
    slugs: ["pt_single", "pt_10"],
  },
  {
    title: "Duo Training",
    hint: "Samen trainen, 2 personen",
    slugs: ["duo_single", "duo_10"],
  },
];

/** Analytics-context voor payment_start, zelfde afleiding als BuyButton. */
export function paymentContextForProduct(
  slug: string,
): "ten_ride_card" | "pt_package" {
  return slug.startsWith("ten_ride_card") ? "ten_ride_card" : "pt_package";
}
