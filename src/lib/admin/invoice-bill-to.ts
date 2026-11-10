/**
 * Afnemergegevens van een factuur (spec-facturatie.md 8.2, 9.3, 9.4).
 * Pure functies, bewust los van het "use server"-bestand: dat mag alleen
 * async acties exporteren, en deze logica moet ook los te testen zijn.
 *
 * Samenvoegregel: het concept wint waar het veld gevuld is, het profiel vult
 * alleen de gaten. Dat spiegelt tmc.finalize_invoice (stap 6c, coalesce),
 * zodat de TS-controle hetzelfde ziet als de RPC straks vastlegt.
 */

export interface BillTo {
  name: string | null;
  company: string | null;
  vatNumber: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
}

export interface BillToProfile {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company_name: string | null;
  vat_number: string | null;
  street_address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
}

export interface BillToDraftRow {
  bill_to_name: string | null;
  bill_to_company: string | null;
  bill_to_vat_number: string | null;
  bill_to_street: string | null;
  bill_to_postal_code: string | null;
  bill_to_city: string | null;
  bill_to_country: string | null;
  bill_to_email: string | null;
}

/** Getrimd, en een lege string telt als niet ingevuld. */
function clean(value: string | null | undefined): string | null {
  const t = (value ?? "").trim();
  return t === "" ? null : t;
}

export function mergeBillTo(
  draft: BillToDraftRow,
  profile: BillToProfile | null,
): BillTo {
  const profileName = profile
    ? clean(`${profile.first_name ?? ""} ${profile.last_name ?? ""}`)
    : null;
  return {
    name: clean(draft.bill_to_name) ?? profileName,
    company: clean(draft.bill_to_company) ?? clean(profile?.company_name),
    vatNumber: clean(draft.bill_to_vat_number) ?? clean(profile?.vat_number),
    street: clean(draft.bill_to_street) ?? clean(profile?.street_address),
    postalCode: clean(draft.bill_to_postal_code) ?? clean(profile?.postal_code),
    city: clean(draft.bill_to_city) ?? clean(profile?.city),
    country: clean(draft.bill_to_country) ?? clean(profile?.country),
    email: clean(draft.bill_to_email) ?? clean(profile?.email),
  };
}

/**
 * Verplicht bij finaliseren: naam, e-mail, straat, postcode en plaats. Land,
 * bedrijfsnaam en BTW-nummer zijn optioneel. De labels zijn de zichtbare
 * veldnamen in de melding.
 */
export function missingBillToFields(b: BillTo): string[] {
  const missing: string[] = [];
  // COPY: confirm met Marlon
  if (!b.name) missing.push("naam");
  if (!b.email) missing.push("e-mailadres");
  if (!b.street) missing.push("straat en huisnummer");
  if (!b.postalCode) missing.push("postcode");
  if (!b.city) missing.push("plaats");
  return missing;
}

export interface BillToInput {
  name: string;
  company: string;
  vatNumber: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FIELD = 200;

export type NormalisedBillTo =
  | { ok: true; value: BillTo }
  | { ok: false; error: string };

/**
 * Server-side normalisatie: alle velden getrimd, lege waarden worden null
 * (een lege string zou in de RPC-coalesce het profiel verslaan en een leeg
 * adres op de PDF zetten), e-mail gevalideerd. Een leeg e-mailveld is
 * toegestaan: dan valt het concept terug op het profiel.
 */
export function normaliseBillTo(input: BillToInput): NormalisedBillTo {
  const fields: Array<[keyof BillToInput, string]> = [
    ["name", "Naam"],
    ["company", "Bedrijfsnaam"],
    ["vatNumber", "BTW-nummer"],
    ["street", "Straat en huisnummer"],
    ["postalCode", "Postcode"],
    ["city", "Plaats"],
    ["country", "Land"],
    ["email", "E-mailadres"],
  ];
  const out: BillTo = {
    name: null,
    company: null,
    vatNumber: null,
    street: null,
    postalCode: null,
    city: null,
    country: null,
    email: null,
  };
  for (const [key, label] of fields) {
    const raw = input[key];
    if (typeof raw !== "string") {
      // COPY: confirm met Marlon
      return { ok: false, error: `${label} is ongeldig.` };
    }
    const v = clean(raw);
    if (v && v.length > MAX_FIELD) {
      // COPY: confirm met Marlon
      return { ok: false, error: `${label} is te lang.` };
    }
    out[key] = v;
  }
  if (out.email && !EMAIL_RE.test(out.email)) {
    // COPY: confirm met Marlon
    return { ok: false, error: "Het e-mailadres van de afnemer is ongeldig." };
  }
  return { ok: true, value: out };
}
