/**
 * GA4-events — uitsluitend acquisitie op de publieke site.
 *
 * De meetgrens: GA4 meet hoe iemand de site vindt, wat 'm overtuigt en of
 * 'ie converteert. Daar houdt het op. Productgedrag achter login (boeken,
 * annuleren, pauzeren, profiel, intake, roosternavigatie) gaat naar
 * `tmc.events` — server-side, al gekoppeld aan een `profile_id`, en niet
 * afhankelijk van cookie-consent. Zie `spec-analytics.md` en de
 * routelijst in `src/components/layout/SiteShell.tsx`.
 *
 * Voeg hier dus geen helper toe die alleen achter login vuurt. Hoort het
 * event bij productgedrag, dan hoort het in `tmc.events` via `emitEvent()`.
 *
 * Bedragen gaan uitsluitend server-side mee, vanuit de Mollie-webhook —
 * nooit client-side. De browser kent de autoritatieve prijs niet (die komt
 * uit `tmc.create_order`) en is bovendien manipuleerbaar. De conversiebrug
 * die de omzet naar GA4 stuurt is `sendPurchaseToGa4`
 * (`src/lib/orders/ga-purchase.ts`), aangeroepen vanuit de Mollie-webhook;
 * de client-events hier dragen bewust geen `value`. Enige rest-uitzondering:
 * `payment_start` (herziening volgt).
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * GA4 e-commerce item. Bewust zonder `price`/`quantity`/`currency`: de
 * configurator-events dragen géén bedragen — de enige autoritatieve prijs
 * komt server-side uit tmc.create_order (zie ConfigureStage/PayStage).
 */
type AnalyticsItem = {
  item_id: string;
  item_name: string;
  item_category: string;
};

type EventParams = {
  event_category?: string;
  event_label?: string;
  value?: number;
  items?: AnalyticsItem[];
  [key: string]: string | number | boolean | AnalyticsItem[] | undefined;
};

/** Module-privaat: alle call-sites gaan via de getypeerde helpers hieronder. */
const trackEvent = (eventName: string, params?: EventParams) => {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", eventName, params);
  }
};

export const trackLead = (type: string, value: number = 1) => {
  trackEvent("generate_lead", {
    event_category: "lead_magnet",
    event_label: type,
    value,
  });
};

export const trackCTA = (buttonText: string, page: string) => {
  trackEvent("cta_click", {
    event_category: "engagement",
    event_label: buttonText,
    page_location: page,
  });
};

/**
 * Publiek-gevormd, en op dit moment zonder call-site — dat is opzet, geen
 * dode code. De helper wacht op een mount op de footer-`tel:`/`mailto:`-links
 * van de publieke site (audit gap #4, `docs/analytics-audit-2026-07.md`).
 *
 * Niet achter login mounten: de vorige enige call-site zat op `/app/support`
 * en is verwijderd omdat die aan de verkeerde kant van de meetgrens stond.
 */
export const trackContact = (method: "phone" | "whatsapp" | "email") => {
  trackEvent(`click_${method}`, {
    event_category: "contact",
    event_label: `${method}_click`,
  });
};

export const trackFormStart = (formName: string) => {
  trackEvent("form_start", {
    event_category: "engagement",
    event_label: formName,
  });
};

// ---- Abonnement-configurator (/abonnement) ----

/**
 * Stap-weergave in de stage-machine ("configure" | "identify" | "pay").
 * Vult het gat dat de configurator tot nu toe volledig stil maakte tussen
 * pagina-load en `payment_start`.
 */
export const trackConfiguratorStageView = (stage: string): void => {
  trackEvent("configurator_stage_view", {
    event_category: "configurator",
    stage,
  });
};

/**
 * Eén expliciete configuratie-keuze: kaartselectie, de plus-30 vrij-trainen-
 * swap, de verlengde-toegang-addon of de 12/24-maanden-looptijd.
 *
 * `itemId` is de tmc.catalogue-slug van de rij die daadwerkelijk gefactureerd
 * wordt, gelezen uit de bestaande catalogus-resolutie — nooit zelf afgeleid.
 * Bevat bewust geen bedragen.
 */
export const trackConfiguratorSelect = (params: {
  itemId: string;
  family: string;
  frequency: string;
  commitmentMonths: number;
  addonVrijTrainen: boolean;
  addonExtendedAccess: boolean;
}): void => {
  trackEvent("configurator_select", {
    event_category: "configurator",
    item_id: params.itemId,
    family: params.family,
    frequency: params.frequency,
    commitment_months: params.commitmentMonths,
    addon_vrij_trainen: params.addonVrijTrainen,
    addon_extended_access: params.addonExtendedAccess,
  });
};

/**
 * Vervangt de oude `cta_click("Ga verder")`, die de gekozen variant niet
 * bevatte. Geen `value`/`currency`: dit event draagt bewust geen bedrag, dus
 * GA4 rapporteert hier €0 omzet — de betaalwaarde blijft bij `payment_start`
 * / `payment_success`.
 */
export const trackBeginCheckout = (params: {
  itemId: string;
  itemName: string;
  family: string;
}): void => {
  trackEvent("begin_checkout", {
    event_category: "configurator",
    items: [
      {
        item_id: params.itemId,
        item_name: params.itemName,
        item_category: params.family,
      },
    ],
  });
};

/**
 * Een checkout-poging die server-side geweigerd is: `create_order` gaf
 * {ok:false} (bv. `existing_membership`, `existing_open_order`, de EM/24m-
 * conflictgate), of de flow strandde vóór Mollie. Zonder dit event is die
 * uitval niet eens als uitval zichtbaar — GA4 ziet dan alleen een
 * `begin_checkout` zonder `payment_start`, precies zoals bij iemand die uit
 * eigen beweging afhaakt.
 *
 * `reason` is de machine-leesbare code uit createOrderAndCheckout, nooit de
 * Nederlandse foutcopy die de gebruiker ziet.
 */
export const trackCheckoutRejected = (params: {
  itemId: string;
  reason: string;
}): void => {
  trackEvent("checkout_rejected", {
    event_category: "configurator",
    item_id: params.itemId,
    reason: params.reason,
  });
};

// ---- Portal login ----

export const trackPortalLogin = (
  method: "otp" | "oauth" = "otp",
): void => {
  trackEvent("portal_login", {
    event_category: "portal",
    method,
  });
};

// ---- Payment (member side) ----

export const trackPaymentStart = (params: {
  amount: number;
  context: "first_membership" | "upgrade" | "pt_package" | "ten_ride_card";
  planVariant?: string;
}): void => {
  trackEvent("payment_start", {
    event_category: "payment",
    value: params.amount,
    currency: "EUR",
    context: params.context,
    plan_variant: params.planVariant,
  });
};

/**
 * Aankomst op de bedankpagina na een Mollie-checkout. Arrival-event
 * conform de drie voorwaarden in spec-analytics.md: geen `value`, geen
 * `currency` — de omzet gaat uitsluitend server-side, via het Measurement
 * Protocol purchase-event uit de Mollie-webhook (sendPurchaseToGa4).
 * `order_status` als dimensie houdt de webhook-race zichtbaar: wie
 * terugkeert vóór activatie, komt hier binnen met "pending".
 *
 * Verving payment_success/payment_failed (client-side, mét bedrag) — de
 * laatste uitzondering op voorwaarde 3, opgeheven door de conversiebrug.
 */
export const trackPaymentReturnView = (params: {
  orderStatus: string;
}): void => {
  trackEvent("payment_return_view", {
    event_category: "payment",
    order_status: params.orderStatus,
  });
};
