import type { ProfileField } from "@/lib/profile-validation";

/**
 * Pure kern van profileCompleteForCheckout(): bepaalt uit "is er een user"
 * en "wat staat er op het profiel" in welke van drie toestanden een
 * bezoeker van /abonnement of /kopen zit. Geen Next-, Supabase- of
 * server-imports, zodat scripts/checkout dezelfde code test die de pagina's
 * en createOrderAndCheckout gebruiken.
 *
 * De verplichte set is exact die van saveIdentityDetails: een profiel dat
 * daar niet doorheen zou komen, is hier onvolledig. Een enkele bron voor
 * de lijst voorkomt dat de gegevensstap en de servercheck uit elkaar
 * groeien (de aanleiding: een profiel met lege naam kwam door de
 * client-side skip naar de betaalstap en strandde daar).
 */
export const CHECKOUT_PROFILE_FIELDS = [
  "first_name",
  "last_name",
  "phone",
  "street_address",
  "postal_code",
  "city",
] as const satisfies readonly ProfileField[];

export type CheckoutProfileField = (typeof CHECKOUT_PROFILE_FIELDS)[number];

/** Wat de check van het profiel leest; alles mag ontbreken of null zijn. */
export type CheckoutProfileRow = Partial<
  Record<CheckoutProfileField, string | null | undefined>
>;

/** Voorvulwaarden voor de gegevensstap: altijd strings, nooit null. */
export type CheckoutProfilePrefill = Record<CheckoutProfileField, string>;

/**
 * Wat de client-componenten krijgen. Geen user-id: die hoort niet in
 * props van een publieke pagina. `email` is het adres van de sessie en
 * wordt in de gegevensstap alleen getoond, nooit opnieuw gevraagd.
 */
export type CheckoutIdentity =
  | { status: "anonymous" }
  | { status: "complete"; email: string; prefill: CheckoutProfilePrefill }
  | {
      status: "incomplete";
      email: string;
      prefill: CheckoutProfilePrefill;
      missing: CheckoutProfileField[];
    };

export interface CheckoutUser {
  id: string;
  email?: string | null;
}

function cleanValue(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** Voorvulling uit een profielrij; een ontbrekende rij geeft lege velden. */
export function checkoutPrefill(
  profile: CheckoutProfileRow | null | undefined,
): CheckoutProfilePrefill {
  const out = {} as CheckoutProfilePrefill;
  for (const field of CHECKOUT_PROFILE_FIELDS) {
    out[field] = cleanValue(profile?.[field]);
  }
  return out;
}

/** Velden die leeg zijn (null, undefined of alleen witruimte), in formuliervolgorde. */
export function missingCheckoutFields(
  profile: CheckoutProfileRow | null | undefined,
): CheckoutProfileField[] {
  const prefill = checkoutPrefill(profile);
  return CHECKOUT_PROFILE_FIELDS.filter((field) => prefill[field] === "");
}

export function isProfileCompleteForCheckout(
  profile: CheckoutProfileRow | null | undefined,
): boolean {
  return missingCheckoutFields(profile).length === 0;
}

/**
 * De drie toestanden:
 * - geen user: anonymous (stap 2 vraagt e-mail en code);
 * - user met alle zes velden gevuld: complete (stap 2 wordt overgeslagen);
 * - user met een of meer lege velden, of zonder profielrij: incomplete
 *   (stap 2 toont alleen de gegevens, voorgevuld, zonder e-mailstap).
 */
export function resolveCheckoutIdentity(
  user: CheckoutUser | null | undefined,
  profile: CheckoutProfileRow | null | undefined,
): CheckoutIdentity {
  if (!user) return { status: "anonymous" };
  const email = cleanValue(user.email);
  const prefill = checkoutPrefill(profile);
  const missing = missingCheckoutFields(profile);
  if (missing.length === 0) return { status: "complete", email, prefill };
  return { status: "incomplete", email, prefill, missing };
}
