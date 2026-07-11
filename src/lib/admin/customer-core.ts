/**
 * WS-5 PR B: on-behalf klant-aanmaak, kernlogica met geinjecteerde deps.
 *
 * Zelfde patroon als payment-link-core.ts (PR A): de invarianten zijn hier
 * deterministisch bewijsbaar met fake deps
 * (scripts/test-find-or-create-customer.ts), zonder productie-writes.
 *
 * De twee harde eisen uit de discovery (discovery-ws5-onbehalf-klant.md):
 *
 * 1. GEEN dubbele klant. E-mail is de unieke sleutel, afgedwongen op
 *    auth-niveau (users_email_partial_key op auth.users; tmc.profiles heeft
 *    die uniciteit NIET). Zoeken gaat ALTIJD vooraf aan aanmaken, en een
 *    "already registered"-fout uit de auth-laag wordt afgehandeld als
 *    "bestaande klant gevonden" (re-search), nooit als tweede account.
 *
 * 2. De dubbel-ingevoerde-e-mail-check zit HIER, server-side, niet alleen
 *    in de wizard-UI. Dit is de barriere tegen het typo-naar-echt-adres-
 *    scenario: een verkeerd getikt maar bestaand adres van een derde zou
 *    die derde via OTP toegang geven tot het profiel en de orderhistorie
 *    van de klant.
 *
 * Telefoon is bewust GEEN onderdeel van het aanmaakpad: de
 * on_auth_user_created-trigger insert phone uit raw_user_meta_data, en een
 * botsing op profiles_phone_unique (of de E164-check) rolt daar de HELE
 * auth-aanmaak terug. Door telefoon weg te laten is die terugrol
 * structureel onmogelijk in plaats van afgehandeld; de klant vult telefoon
 * later zelf in via /app/profiel.
 */

export interface CustomerProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  memberCode: string;
}

export interface FindOrCreateCustomerInput {
  email: string;
  /** Tweede invoer van hetzelfde adres; moet na normalisatie exact matchen. */
  emailRepeat: string;
  firstName: string;
  lastName: string;
}

export type FindOrCreateFailReason =
  | "email_mismatch"
  | "invalid_email"
  | "missing_name"
  /**
   * Auth-user bestaat (of is net aangemaakt) maar de profielrij ontbreekt.
   * Kan alleen bij legacy-users van voor de trigger-installatie; het
   * ensureProfile-vangnet kan dit niet helen (member_code NOT NULL zonder
   * default), dus dit is een expliciete fout voor handmatig herstel.
   */
  | "profile_missing";

export type FindOrCreateCustomerResult =
  | { ok: true; created: boolean; profile: CustomerProfile }
  | { ok: false; reason: FindOrCreateFailReason };

export interface CustomerDeps {
  db: {
    /** Exacte, case-insensitieve match op het genormaliseerde adres. */
    findProfileByEmail(emailNormalized: string): Promise<CustomerProfile | null>;
    getProfileById(id: string): Promise<CustomerProfile | null>;
  };
  auth: {
    /**
     * auth.admin.createUser met email_confirm: false. De
     * on_auth_user_created-trigger maakt synchroon (zelfde transactie) de
     * profielrij plus member_code aan. Retourneert { duplicate: true } bij
     * een al geregistreerd adres (email_exists / 422); andere fouten mogen
     * throwen (de action-wrapper vangt die af).
     */
    createUser(args: {
      email: string;
      firstName: string;
      lastName: string;
    }): Promise<{ userId: string } | { duplicate: true }>;
  };
  /** Alleen bij een echte aanmaak, nooit bij het vinden van een bestaande klant. */
  emitCustomerCreated(profileId: string): Promise<void>;
}

/**
 * Trim + lowercase. GoTrue normaliseert e-mail zelf ook naar lowercase, dus
 * zoeken en aanmaken op de genormaliseerde vorm garandeert dat
 * "Jan@GMAIL.com " en "jan@gmail.com" dezelfde klant zijn.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// Bewust simpel: het echte bewijs van een werkend adres is de OTP-login of
// de geopende betaallink, niet een regex. Dit vangt alleen evidente
// vergissingen (ontbrekende @, spaties, geen domein-punt).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function findOrCreateCustomerCore(
  deps: CustomerDeps,
  input: FindOrCreateCustomerInput,
): Promise<FindOrCreateCustomerResult> {
  // Server-side dubbel-invoer-barriere. Vergelijking op de genormaliseerde
  // vorm: case- en witruimteverschillen kunnen mail niet omleiden en GoTrue
  // slaat toch lowercase op; de barriere richt zich op karakter-typo's.
  const email = normalizeEmail(input.email);
  const emailRepeat = normalizeEmail(input.emailRepeat);
  if (!email || email !== emailRepeat) {
    return { ok: false, reason: "email_mismatch" };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, reason: "invalid_email" };
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) {
    return { ok: false, reason: "missing_name" };
  }

  // Zoek-eerst is een correctheidseis: bestaat het adres, dan is DIT de
  // klant en is aanmaken geblokkeerd.
  const existing = await deps.db.findProfileByEmail(email);
  if (existing) {
    return { ok: true, created: false, profile: existing };
  }

  const createRes = await deps.auth.createUser({ email, firstName, lastName });

  if ("duplicate" in createRes) {
    // Race: het adres is tussen zoeken en aanmaken geregistreerd (tweede
    // admin, of de klant zelf via OTP-signup). users_email_partial_key
    // garandeert dat er precies een auth-user is; re-search en geef die
    // terug. Geen fout: "geen dubbele klant" is ook op de race waterdicht.
    const raced = await deps.db.findProfileByEmail(email);
    if (raced) {
      return { ok: true, created: false, profile: raced };
    }
    return { ok: false, reason: "profile_missing" };
  }

  const profile = await deps.db.getProfileById(createRes.userId);
  if (!profile) {
    return { ok: false, reason: "profile_missing" };
  }

  await deps.emitCustomerCreated(profile.id);
  return { ok: true, created: true, profile };
}
