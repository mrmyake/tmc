/**
 * dataLayer-haakjes van de proefles-funnel (spec-proefles-funnel.md, B7).
 *
 * Bewust los van gtag en van src/lib/analytics.ts: dit zijn alleen haakjes.
 * De helper zet een object op window.dataLayer en doet niets als die
 * ontbreekt (productroutes, native app, of een pad buiten de GA4-scope). Er
 * wordt hier niets geconfigureerd, geen consent gelezen en geen gtag
 * aangeroepen; het koppelen aan GA4-events doet de analytics-chat.
 *
 * Regels:
 * - Nooit een proefcode, naam, e-mailadres of telefoonnummer in de params.
 * - Geen events op mount van een gewone pagina (huisregel uit analytics.ts);
 *   de enige uitzondering is proefles_booked op de bedankpagina, eenmalig
 *   per boeking.
 */

export type DataLayerEvent =
  | "proefles_cta_click"
  | "proefles_code_submit"
  | "proefles_callback_open"
  | "proefles_booked"
  | "actie_whatsapp_click";

export type DataLayerParams = Record<string, string | number | boolean | null | undefined>;

export function pushDataLayer(event: DataLayerEvent, params: DataLayerParams = {}): void {
  if (typeof window === "undefined") return;
  const layer = (window as unknown as { dataLayer?: unknown }).dataLayer;
  if (!Array.isArray(layer)) return;
  try {
    layer.push({ event, ...params });
  } catch {
    // Een haakje mag de pagina nooit breken.
  }
}
