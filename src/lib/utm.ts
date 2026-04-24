const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type UtmParams = Partial<Record<(typeof UTM_KEYS)[number], string>>;

const STORAGE_KEY = "tmc_utm";

/**
 * Leest utm_* parameters uit de huidige URL. Als er minstens één aanwezig is
 * én er nog niets in sessionStorage staat, wordt de set opgeslagen.
 * Voorgaande pageviews binnen dezelfde session worden niet overschreven —
 * eerste aanraking wint (attribution van originele campagne).
 */
export function captureUtmFromUrl() {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(STORAGE_KEY)) return;

    const url = new URL(window.location.href);
    const found: UtmParams = {};
    let hasAny = false;
    for (const key of UTM_KEYS) {
      const value = url.searchParams.get(key);
      if (value) {
        found[key] = value;
        hasAny = true;
      }
    }
    if (hasAny) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(found));
    }
  } catch {
    /* sessionStorage kan in edge cases falen — safe no-op */
  }
}

export function getStoredUtm(): UtmParams {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as UtmParams;
  } catch {
    return {};
  }
}

/**
 * Platte fields voor MailerLite subscribers. Alleen de niet-lege UTM's
 * plus de landing-path. Gebruikt door /api/leads/* zodat de campagne-
 * bron zichtbaar is in de MailerLite subscriber view.
 */
export function utmToMailerliteFields(
  utm: UtmParams,
  landingPath?: string,
): Record<string, string> {
  const fields: Record<string, string> = {};
  if (utm.utm_source) fields.acquisition_source = utm.utm_source;
  if (utm.utm_medium) fields.acquisition_medium = utm.utm_medium;
  if (utm.utm_campaign) fields.acquisition_campaign = utm.utm_campaign;
  if (utm.utm_content) fields.acquisition_content = utm.utm_content;
  if (landingPath) fields.signup_path = landingPath;
  return fields;
}
