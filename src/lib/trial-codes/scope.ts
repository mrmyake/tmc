/**
 * Scope van een proefcode (spec-community-growth.md §1 "Proefcodes").
 * Bron van de waarden is de check-constraint trial_codes_scope_check; dit
 * bestand is alleen voor weergave en voor het filteren van de sessielijst.
 * De server blijft leidend: tmc.redeem_trial_code controleert de scope bij
 * het boeken onder de sessielock (scope_mismatch).
 */

export type TrialCodeScope = "yoga_mobility" | "kettlebell" | "group" | "vrij_trainen";

export const TRIAL_CODE_SCOPES: readonly TrialCodeScope[] = [
  "yoga_mobility",
  "kettlebell",
  "group",
  "vrij_trainen",
];

/**
 * Scopes die in deze stand bruikbaar zijn (PR 1). Vrij trainen bestaat in de
 * database maar is pas inwisselbaar na PR 2; de admin-UI biedt hem niet aan.
 */
export const SELECTABLE_TRIAL_CODE_SCOPES: readonly TrialCodeScope[] = [
  "yoga_mobility",
  "kettlebell",
  "group",
];

export function isTrialCodeScope(value: unknown): value is TrialCodeScope {
  return typeof value === "string" && (TRIAL_CODE_SCOPES as readonly string[]).includes(value);
}

// COPY: confirm met Marlon
export const SCOPE_LABEL: Record<TrialCodeScope, string> = {
  yoga_mobility: "Yoga & mobility",
  kettlebell: "Kettlebell",
  group: "Alle groepslessen",
  vrij_trainen: "Vrij trainen",
};

// COPY: confirm met Marlon
export const SCOPE_DESCRIPTION: Record<TrialCodeScope, string> = {
  yoga_mobility: "Alle yoga- en mobilitylessen",
  kettlebell: "Alle kettlebelllessen",
  group: "Yoga, mobility en kettlebell",
  vrij_trainen: "Vast 1 uur, alleen als Marlon er is",
};

/**
 * De pillars waarvoor een proefles boekbaar is, per scope. Dezelfde regel
 * als in tmc.redeem_trial_code: group = alles behalve vrij trainen (dus ook
 * kids en senior, zoals in de betaalde flow). Vrij trainen heeft geen
 * sessielijst.
 */
export function pillarsForScope(scope: TrialCodeScope): string[] {
  switch (scope) {
    case "yoga_mobility":
      return ["yoga_mobility"];
    case "kettlebell":
      return ["kettlebell"];
    case "group":
      return ["yoga_mobility", "kettlebell", "kids", "senior"];
    case "vrij_trainen":
      return [];
  }
}

/** "Je code is geldig voor ..." op de sessiekiezer van de codeflow. */
export function scopeValidityText(scope: TrialCodeScope): string {
  // COPY: confirm met Marlon
  switch (scope) {
    case "yoga_mobility":
      return "Je code is geldig voor een gratis yoga- of mobilityles.";
    case "kettlebell":
      return "Je code is geldig voor een gratis kettlebellles.";
    case "group":
      return "Je code is geldig voor een gratis groepsles.";
    case "vrij_trainen":
      return "Je code is geldig voor een gratis uur vrij trainen.";
  }
}
