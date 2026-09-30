import { parsePhone } from "./phone-parse";

/**
 * Gedeelde validatie en foutmapping voor profielgegevens: dezelfde regels
 * op de client (bij blur en submit) en in de server actions
 * (saveIdentityDetails, updateProfile), zodat de melding overal gelijk is.
 * Geen "use server"/"use client": pure functies, importeerbaar vanuit
 * beide kanten en vanuit scripts/phone.
 */

export type ProfileField =
  | "first_name"
  | "last_name"
  | "phone"
  | "street_address"
  | "postal_code"
  | "city";

// COPY: confirm met Marlon
export const PHONE_INVALID_MESSAGE =
  "Vul een geldig telefoonnummer in, met landcode als het geen Nederlands nummer is.";
// COPY: confirm met Marlon
export const PHONE_TAKEN_MESSAGE =
  "Dit telefoonnummer hoort al bij een account. Log in met dat account of gebruik een ander nummer.";
// COPY: confirm met Marlon
export const PHONE_HINT =
  "Zodat we je kunnen bereiken over je lessen en lidmaatschap.";
export const GENERIC_SAVE_MESSAGE = "Opslaan mislukt. Probeer opnieuw.";

export const REQUIRED_MESSAGES: Record<ProfileField, string> = {
  // COPY: confirm met Marlon
  first_name: "Vul je voornaam in.",
  // COPY: confirm met Marlon
  last_name: "Vul je achternaam in.",
  // COPY: confirm met Marlon
  phone: "Vul je telefoonnummer in.",
  // COPY: confirm met Marlon
  street_address: "Vul je straat en huisnummer in.",
  // COPY: confirm met Marlon
  postal_code: "Vul je postcode in.",
  // COPY: confirm met Marlon
  city: "Vul je plaats in.",
};

/** Eerste fout voor één veld, of null als de waarde deugt. */
export function validateProfileField(
  field: ProfileField,
  value: string,
  opts: { required: boolean },
): string | null {
  const v = value.trim();
  if (!v) return opts.required ? REQUIRED_MESSAGES[field] : null;
  if (field === "phone" && !parsePhone(v).ok) return PHONE_INVALID_MESSAGE;
  return null;
}

export interface WriteErrorInfo {
  code: string | null;
  constraint: string | null;
}

interface PostgrestLikeError {
  code?: string | null;
  message?: string | null;
}

/**
 * Alleen code en constraint-naam: het enige dat we loggen. `details` (bij
 * 23505 staat daar het volledige telefoonnummer in) en `message` blijven
 * buiten de log.
 */
export function describeWriteError(error: PostgrestLikeError): WriteErrorInfo {
  const m = /constraint "([^"]+)"/.exec(error.message ?? "");
  return { code: error.code ?? null, constraint: m ? m[1] : null };
}

export interface MappedWriteError {
  error: string;
  field?: ProfileField;
}

/** PostgREST/Postgres-fout op tmc.profiles naar een veldgebonden melding. */
export function mapProfileWriteError(error: PostgrestLikeError): MappedWriteError {
  const { code, constraint } = describeWriteError(error);
  if (code === "23505" && constraint === "profiles_phone_unique") {
    return { error: PHONE_TAKEN_MESSAGE, field: "phone" };
  }
  // Beide namen: profiles_phone_e164_nl (oude, alleen +31) blijft geldig
  // tot migratie 20261001100000 is uitgerold; daarna is het profiles_phone_e164.
  if (
    code === "23514" &&
    (constraint === "profiles_phone_e164" ||
      constraint === "profiles_phone_e164_nl")
  ) {
    return { error: PHONE_INVALID_MESSAGE, field: "phone" };
  }
  if (code === "23502") {
    const col = /column "([^"]+)"/.exec(error.message ?? "")?.[1];
    if (col === "first_name" || col === "last_name") {
      return { error: REQUIRED_MESSAGES[col], field: col };
    }
  }
  return { error: GENERIC_SAVE_MESSAGE };
}
