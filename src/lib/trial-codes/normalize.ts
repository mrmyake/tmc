/**
 * Proefcodes (spec-community-growth.md §1 "Proefcodes"): hoofdletterongevoelig,
 * spaties en koppeltekens worden genegeerd. Dezelfde normalisatie als in
 * tmc.redeem_trial_code en tmc.create_trial_code (upper + strip [\s-]);
 * de server blijft leidend, dit is alleen voor de invoer en de weergave.
 */
export function normalizeTrialCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, "");
}

/** Geldig formaat voor een zelf ingetypte code (zelfde regex als de RPC). */
export function isValidTrialCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{4,32}$/.test(code);
}

/** Vaste ontvangers van de misbruikmelding bij een herhaalde gratis proefles. */
export const TRIAL_CODE_ABUSE_RECIPIENTS = [
  "marlon@themovementclub.nl",
  "me@ilja.com",
] as const;
