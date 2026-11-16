/**
 * Catalogusslug per pillar (geen apart proefles-tarief, besluit
 * spec-community-growth.md par. 1: de proefles betaalt gewoon het drop-in-
 * tarief). yoga_mobility en kettlebell delen dezelfde 'drop_in'-rij (die
 * twee tarieven zijn altijd gelijk geweest, zie tmc.catalogue-seed).
 * vrij_trainen heeft bewust geen drop-in-slug en is dus niet boekbaar als
 * betaalde proefles.
 */
export function dropInSlugForPillar(pillar: string): string | null {
  switch (pillar) {
    case "yoga_mobility":
    case "kettlebell":
      return "drop_in";
    case "kids":
      return "drop_in_kids";
    case "senior":
      return "drop_in_senior";
    default:
      return null;
  }
}

/**
 * Slug voor de waarde van een gratis proefles (code of openingsperiode) in
 * het GA4-event trial_booked (spec-conversiemeting.md): dezelfde drop-in-rij
 * als de betaalde proefles. Vrij trainen heeft geen eigen los tarief en
 * krijgt de waarde van 'drop_in'. De prijs zelf komt altijd uit
 * tmc.catalogue, nooit uit de code.
 */
export function trialValueSlugForPillar(pillar: string): string | null {
  if (pillar === "vrij_trainen") return "drop_in";
  return dropInSlugForPillar(pillar);
}
