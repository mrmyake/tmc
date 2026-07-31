import "server-only";
import type { createClient } from "@/lib/supabase/server";

/** De cookie-aware SSR-client; RLS draait als de ingelogde gebruiker. */
type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Acquisition-attributie op tmc.profiles, first-touch-wint.
 *
 * Waarom hier en niet in de trigger: `tmc.handle_new_auth_user()` hangt op
 * AFTER INSERT ON auth.users en vuurt dus exact één keer per account, bij
 * aanmaak. Een latere login insert geen auth.users-rij, dus die trigger
 * ziet 'm nooit. De ON CONFLICT-tak daar is in de praktijk onbereikbaar
 * (geen enkel pad maakt een profiles-rij vóór de auth.users-rij), en de
 * lege acquisition-velden komen niet dóór die tak maar doordat er ná
 * account-aanmaak nooit meer naar deze kolommen geschreven werd. Deze
 * functie is dat ontbrekende pad. De trigger blijft ongewijzigd.
 *
 * COALESCE bewaakt first-touch: een al gevuld veld wordt nooit
 * overschreven, ook niet door een latere campagne.
 */

/** Lege string telt als afwezig — anders zou '' de COALESCE-bescherming
 *  omzeilen door het veld te "vullen" met niets. */
const MAX_LEN = 128;

function clean(value: string | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, MAX_LEN);
}

/** Onparseerbaar → null, nooit throwen. */
function cleanTimestamp(value: string | undefined | null): string | null {
  const raw = clean(value);
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

export interface AcquisitionInput {
  acquisitionSource?: string;
  acquisitionMedium?: string;
  acquisitionCampaign?: string;
  acquisitionContent?: string;
  signupPath?: string;
  firstTouchAt?: string;
}

/**
 * Vult de zes acquisition-velden op het eigen profiel, alleen waar ze nog
 * leeg zijn. Scope komt uit RLS (`profiles_self_update`: auth.uid() = id)
 * plus de expliciete match op de geverifieerde sessie-user — nooit een
 * profile_id uit clientinvoer.
 *
 * Mag de login NOOIT blokkeren of laten falen: eigen try/catch, alleen
 * gelogd, flow gaat door. Zelfde contract als de ga_client_id-write in
 * createOrderAndCheckout.
 */
export async function recordAcquisitionOnLogin(
  supabase: ServerClient,
  userId: string,
  input: AcquisitionInput | undefined,
): Promise<void> {
  try {
    if (!input) return;

    const source = clean(input.acquisitionSource);
    const medium = clean(input.acquisitionMedium);
    const campaign = clean(input.acquisitionCampaign);
    const content = clean(input.acquisitionContent);
    const signupPath = clean(input.signupPath);
    const firstTouchAt = cleanTimestamp(input.firstTouchAt);

    // Niets bruikbaars meegekregen (de normale situatie bij een login
    // zonder campagne): geen query, geen ruis.
    if (!source && !medium && !campaign && !content && !signupPath && !firstTouchAt) {
      return;
    }

    // Alleen de nog-lege velden ophalen; wat al gevuld is blijft staan.
    // Dit is de COALESCE uit de spec, uitgevoerd als read-then-write omdat
    // PostgREST geen kolom-expressies in een update accepteert. Race-risico
    // is verwaarloosbaar (twee gelijktijdige logins van dezelfde user) en de
    // uitkomst blijft in alle gevallen een first-touch-waarde.
    const { data: current, error: readError } = await supabase
      .from("profiles")
      .select(
        "acquisition_source, acquisition_medium, acquisition_campaign, acquisition_content, signup_path, first_touch_at",
      )
      .eq("id", userId)
      .maybeSingle();
    if (readError || !current) {
      if (readError) console.error("[recordAcquisitionOnLogin] read", readError);
      return;
    }

    const patch: Record<string, string> = {};
    if (!current.acquisition_source && source) patch.acquisition_source = source;
    if (!current.acquisition_medium && medium) patch.acquisition_medium = medium;
    if (!current.acquisition_campaign && campaign)
      patch.acquisition_campaign = campaign;
    if (!current.acquisition_content && content)
      patch.acquisition_content = content;
    if (!current.signup_path && signupPath) patch.signup_path = signupPath;
    if (!current.first_touch_at && firstTouchAt)
      patch.first_touch_at = firstTouchAt;

    if (Object.keys(patch).length === 0) return;

    const { error: writeError } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", userId);
    if (writeError) {
      console.error("[recordAcquisitionOnLogin] write", writeError);
    }
  } catch (e) {
    console.error("[recordAcquisitionOnLogin] skipped", e);
  }
}
