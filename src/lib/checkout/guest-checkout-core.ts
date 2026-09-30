import { parsePhone } from "@/lib/phone-parse";
import {
  PHONE_TAKEN_MESSAGE,
  validateProfileField,
  type ProfileField,
} from "@/lib/profile-validation";
import { CHECKOUT_PROFILE_FIELDS } from "@/lib/checkout/profile-complete-core";
import { buildReturnUrl, type ReturnTarget } from "@/lib/native/return-url";

/**
 * Kern van de gastcheckout-action ("betalen voor account", PR 2): gegevens
 * valideren, rate limit, bestaand adres herkennen, telefooncheck, intent
 * aanmaken via create_checkout_intent (de enige prijsbron), Mollie-customer
 * en eerste betaling, mark_checkout_intent_pending. Geen Supabase, Mollie of
 * Next hier; scripts/checkout/guest-checkout-core.test.mts bewijst de paden
 * met fakes.
 *
 * Volgorde is bewust (besluiten 2026-09-30): elke aanroep telt voor de rate
 * limit, ook een geldige; de e-mailcheck gaat vóór de telefooncheck en is
 * gekoppeld aan het direct versturen van de inlogcode, zodat de melding
 * "je hebt al een account" altijd een rate-gelimiteerde mail kost.
 */

export interface GuestCheckoutInput {
  slug: string;
  extendedAccess?: boolean;
  commit24m?: boolean;
  /** Intentie; create_checkout_intent beslist via _compute_order_price. */
  earlyMember?: boolean;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  streetAddress: string;
  postalCode: string;
  city: string;
  acquisition?: Record<string, string | null | undefined>;
  gaClientId?: string;
  gaSessionId?: string;
  returnTarget?: ReturnTarget;
}

export interface CreateIntentRpcResult {
  ok: boolean;
  reason?: string;
  constraint?: string;
  intent_id?: string;
  status_token?: string;
  kind?: "subscription" | "product";
  first_charge_cents?: number;
  recurring_cents?: number | null;
  early_member?: boolean;
  expires_at?: string;
}

export interface GuestCheckoutDeps {
  mode: "live" | "test";
  ip: string;
  /** register_trial_code_attempt met sleutel checkout:<ip>; true = toegestaan. */
  rateLimit(ip: string): Promise<boolean>;
  auth: {
    userIdForEmail(email: string): Promise<string | null>;
    /** signInWithOtp zonder aanmaak, met het IP van de bezoeker. */
    sendLoginCode(email: string): Promise<{ ok: boolean; rateLimited?: boolean }>;
  };
  db: {
    phoneInUse(phoneE164: string): Promise<boolean>;
    createIntent(args: {
      mode: "live" | "test";
      slug: string;
      extendedAccess: boolean;
      commit24m: boolean;
      earlyMember: boolean;
      email: string;
      firstName: string;
      lastName: string;
      phoneE164: string;
      streetAddress: string;
      postalCode: string;
      city: string;
      acquisition: Record<string, string>;
      gaClientId: string | null;
      gaSessionId: string | null;
      returnTarget: ReturnTarget;
    }): Promise<CreateIntentRpcResult>;
    markPending(args: {
      intentId: string;
      paymentId: string;
      customerId: string;
    }): Promise<{ ok: boolean; reason?: string }>;
  };
  mollie: {
    createCustomer(args: { name: string; email: string; intentId: string }): Promise<string>;
    createPayment(args: {
      amountValue: string;
      description: string;
      redirectUrl: string;
      webhookUrl: string;
      customerId: string;
      isSubscription: boolean;
      intentId: string;
      mode: "live" | "test";
      idempotencyKey: string;
    }): Promise<{ id: string; checkoutUrl: string | null }>;
  };
  urls: { site: string; webhook: string };
  emit(event: { type: "checkout_intent.created"; subjectId: string; payload: Record<string, unknown> }): Promise<unknown>;
}

export type GuestCheckoutFailureReason =
  | "rate_limited"
  | "invalid_input"
  | "existing_account"
  | "phone_in_use"
  | "price_unavailable"
  | "mollie_unavailable"
  | "unexpected_error";

export type GuestCheckoutResult =
  | { ok: true; checkoutUrl: string; kind: "subscription" | "product"; amountCents: number }
  | {
      ok: false;
      reason: GuestCheckoutFailureReason;
      error: string;
      field?: ProfileField | "email";
      /** Bij existing_account: is de inlogcode verstuurd (scherm 2)? */
      codeSent?: boolean;
      /** Bij existing_account: het genormaliseerde adres voor de codestap. */
      email?: string;
    };

// COPY: confirm met Marlon
export const GUEST_COPY = {
  rateLimited: "Te veel pogingen vanaf dit adres. Wacht een kwartier en probeer het dan opnieuw.",
  emailInvalid: "Vul een geldig e-mailadres in.",
  existingAccount:
    "Dit e-mailadres kennen we al. We hebben een inlogcode gestuurd; vul die in, dan gaan we verder met je aanmelding.",
  existingAccountNoMail:
    "Dit e-mailadres kennen we al. Log in via de inlogpagina, dan gaan we verder met je aanmelding.",
  priceUnavailable: "Dit abonnement is niet (meer) beschikbaar.",
  mollieUnavailable: "Betalingsprovider niet geconfigureerd.",
  unexpected: "Er ging iets mis. Probeer het opnieuw.",
} as const;

// Zelfde teksten als create-order.ts voor de RPC-weigeringen die hier
// kunnen voorkomen; een onbekende reason valt terug op priceUnavailable.
// COPY: confirm met Marlon
const REASON_COPY: Record<string, string> = {
  catalogue_row_not_found: "Dit abonnement is niet (meer) beschikbaar.",
  not_purchasable: "Dit is geen abonnement dat je direct kunt afsluiten. Neem contact met ons op.",
  invalid_kind: "Dit abonnement is niet (meer) beschikbaar.",
  em_and_24m_exclusive: "Early Member en de 24-maanden-korting zijn niet te combineren.",
  commit_24m_not_offered: "24 maanden commitment is niet beschikbaar op dit abonnement.",
  extended_access_not_available: "Verlengde toegang is niet beschikbaar op dit abonnement.",
  invalid_product_options: "Deze opties zijn niet geldig voor dit product.",
  product_not_supported: "Dit product is niet online te koop. Neem contact met ons op.",
};

const CONSTRAINT_FIELD: Record<string, ProfileField | "email"> = {
  checkout_intents_email_check: "email",
  checkout_intents_first_name_check: "first_name",
  checkout_intents_last_name_check: "last_name",
  checkout_intents_phone_e164: "phone",
  checkout_intents_street_check: "street_address",
  checkout_intents_postal_check: "postal_code",
  checkout_intents_city_check: "city",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeGuestEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Acquisitie naar de snake_case-sleutels van p_acquisition, getrimd en begrensd. */
export function cleanAcquisition(
  input: Record<string, string | null | undefined> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  const keys = [
    "acquisition_source",
    "acquisition_medium",
    "acquisition_campaign",
    "acquisition_content",
    "signup_path",
  ] as const;
  for (const key of keys) {
    const v = input[key];
    if (typeof v === "string" && v.trim()) out[key] = v.trim().slice(0, 128);
  }
  const ft = input.first_touch_at;
  if (typeof ft === "string" && ft.trim() && !Number.isNaN(Date.parse(ft))) {
    out.first_touch_at = new Date(ft).toISOString();
  }
  return out;
}

export function thanksPath(kind: "subscription" | "product", statusToken: string): string {
  return `/${kind === "subscription" ? "abonnement" : "kopen"}/bedankt?t=${statusToken}`;
}

export async function startGuestCheckoutCore(
  deps: GuestCheckoutDeps,
  input: GuestCheckoutInput,
): Promise<GuestCheckoutResult> {
  // 1. Elke aanroep telt.
  if (!(await deps.rateLimit(deps.ip))) {
    return { ok: false, reason: "rate_limited", error: GUEST_COPY.rateLimited };
  }

  // 2. Validatie, zelfde regels als de gegevensstap en saveIdentityDetails.
  const email = normalizeGuestEmail(input.email ?? "");
  if (!EMAIL_RE.test(email)) {
    return { ok: false, reason: "invalid_input", error: GUEST_COPY.emailInvalid, field: "email" };
  }
  const values: Record<ProfileField, string> = {
    first_name: (input.firstName ?? "").trim(),
    last_name: (input.lastName ?? "").trim(),
    phone: (input.phone ?? "").trim(),
    street_address: (input.streetAddress ?? "").trim(),
    postal_code: (input.postalCode ?? "").trim(),
    city: (input.city ?? "").trim(),
  };
  for (const field of CHECKOUT_PROFILE_FIELDS) {
    const msg = validateProfileField(field, values[field], { required: true });
    if (msg) return { ok: false, reason: "invalid_input", error: msg, field };
  }
  const parsed = parsePhone(values.phone);
  if (!parsed.ok) {
    return {
      ok: false,
      reason: "invalid_input",
      error: validateProfileField("phone", "x", { required: true }) ?? GUEST_COPY.unexpected,
      field: "phone",
    };
  }

  // 3. Bestaand adres: inlogcode sturen en naar scherm 2. Pas daarna de
  //    telefooncheck (besluit 3).
  if (await deps.auth.userIdForEmail(email)) {
    const sent = await deps.auth.sendLoginCode(email);
    return {
      ok: false,
      reason: "existing_account",
      error: sent.ok ? GUEST_COPY.existingAccount : GUEST_COPY.existingAccountNoMail,
      field: "email",
      codeSent: sent.ok,
      email,
    };
  }
  if (await deps.db.phoneInUse(parsed.e164)) {
    return { ok: false, reason: "phone_in_use", error: PHONE_TAKEN_MESSAGE, field: "phone" };
  }

  // 4. Intent met bevroren prijs.
  const returnTarget: ReturnTarget = input.returnTarget === "app" ? "app" : "web";
  const created = await deps.db.createIntent({
    mode: deps.mode,
    slug: input.slug,
    extendedAccess: Boolean(input.extendedAccess),
    commit24m: Boolean(input.commit24m),
    earlyMember: Boolean(input.earlyMember),
    email,
    firstName: values.first_name,
    lastName: values.last_name,
    phoneE164: parsed.e164,
    streetAddress: values.street_address,
    postalCode: values.postal_code,
    city: values.city,
    acquisition: cleanAcquisition(input.acquisition),
    gaClientId: input.gaClientId?.trim() || null,
    gaSessionId: input.gaSessionId?.trim() || null,
    returnTarget,
  });
  if (!created.ok || !created.intent_id || !created.status_token || !created.kind) {
    if (created.reason === "invalid_input") {
      const field = created.constraint ? CONSTRAINT_FIELD[created.constraint] : undefined;
      return {
        ok: false,
        reason: "invalid_input",
        error: field ? (validateProfileField(field === "email" ? "first_name" : field, "", { required: true }) ?? GUEST_COPY.unexpected) : GUEST_COPY.unexpected,
        field,
      };
    }
    return {
      ok: false,
      reason: "price_unavailable",
      error: (created.reason && REASON_COPY[created.reason]) || GUEST_COPY.priceUnavailable,
    };
  }
  const intentId = created.intent_id;
  const kind = created.kind;
  const amountCents = created.first_charge_cents ?? 0;

  // 5. Mollie-customer (het mandaat hangt hieraan) en eerste betaling.
  let checkoutUrl: string | null;
  let paymentId: string;
  let customerId: string;
  try {
    customerId = await deps.mollie.createCustomer({
      name: `${values.first_name} ${values.last_name}`.trim(),
      email,
      intentId,
    });
    const payment = await deps.mollie.createPayment({
      amountValue: (amountCents / 100).toFixed(2),
      description: `The Movement Club | ${input.slug}`,
      redirectUrl: buildReturnUrl(deps.urls.site, thanksPath(kind, created.status_token), returnTarget),
      webhookUrl: deps.urls.webhook,
      customerId,
      isSubscription: kind === "subscription",
      intentId,
      mode: deps.mode,
      idempotencyKey: `checkout-${intentId}-p1`,
    });
    paymentId = payment.id;
    checkoutUrl = payment.checkoutUrl;
  } catch (err) {
    console.error("[guest-checkout] mollie failed", { intentId, code: (err as { statusCode?: number })?.statusCode ?? "unknown" });
    return { ok: false, reason: "mollie_unavailable", error: GUEST_COPY.mollieUnavailable };
  }

  // 6. Koppelen; de intent blijft draft en de cron ruimt hem op als dit
  //    misgaat (de betaling verloopt dan vanzelf bij Mollie).
  const marked = await deps.db.markPending({ intentId, paymentId, customerId });
  if (!marked.ok || !checkoutUrl) {
    console.error("[guest-checkout] mark pending failed", { intentId, reason: marked.reason ?? "no_checkout_url" });
    return { ok: false, reason: "unexpected_error", error: GUEST_COPY.unexpected };
  }

  await deps.emit({
    type: "checkout_intent.created",
    subjectId: intentId,
    payload: {
      intent_id: intentId,
      slug: input.slug,
      kind,
      mode: deps.mode,
      first_charge_cents: amountCents,
      early_member: Boolean(created.early_member),
      return_target: returnTarget,
    },
  });

  return { ok: true, checkoutUrl, kind, amountCents };
}
