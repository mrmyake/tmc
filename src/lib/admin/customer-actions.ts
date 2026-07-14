"use server";

import { requireAdmin } from "@/lib/admin/require-admin";
import { requireTrainerOrAdmin } from "@/lib/admin/require-trainer-or-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events/emit";
import {
  findOrCreateCustomerCore,
  type CustomerDeps,
  type CustomerProfile,
  type FindOrCreateCustomerInput,
} from "./customer-core";

/**
 * WS-5 PR B: on-behalf klant-aanmaak plus klant-zoeken voor de
 * Nieuw-betaalverzoek-wizard (PR C). De kernlogica en de invarianten
 * (zoek-eerst, dubbel-invoer-barriere, race-afhandeling) staan in
 * customer-core.ts; dit bestand levert alleen de echte deps en de
 * requireAdmin-gates.
 *
 * Aanmaken loopt UITSLUITEND via auth.admin.createUser (email_confirm:
 * false): het profiel MOET aan een auth.users-rij hangen (FK) en de
 * e-mail-uniciteit leeft alleen daar (users_email_partial_key). Een directe
 * profiel-insert zou die uniciteit omzeilen (profiles.email is niet uniek)
 * en is hier dus verboden terrein. De on_auth_user_created-trigger maakt de
 * profielrij plus member_code synchroon aan.
 *
 * Toegang van het aangemaakte account: geen wachtwoord, geen sessie,
 * onbevestigd adres. Het kan precies twee dingen: de betaallink ontvangen
 * en betalen (token-route uit PR A, geen login nodig) en later zelf via
 * OTP inloggen. Die eerste OTP-verificatie is het natuurlijke
 * bevestigingsmoment (zelfde GoTrue-pad als de normale OTP-signup) en landt
 * gegarandeerd op DIT account: e-mail is uniek op auth-niveau, dus geen
 * tweede account, geen split.
 */

const PROFILE_COLUMNS = "id, first_name, last_name, email, member_code";

interface ProfileRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  member_code: string;
}

function toCustomerProfile(row: ProfileRow): CustomerProfile {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    memberCode: row.member_code,
  };
}

/** Escapet LIKE-wildcards; zelfde aanpak als likePattern in members-query.ts. */
function escapeLike(value: string): string {
  return value.replace(/[%_]/g, (m) => `\\${m}`);
}

export type FindOrCreateCustomerActionResult =
  | { ok: true; created: boolean; profile: CustomerProfile }
  | { ok: false; error: string };

// COPY: confirm met Marlon
const FAIL_COPY: Record<string, string> = {
  email_mismatch:
    "De twee ingevoerde e-mailadressen komen niet overeen. Controleer het adres en voer het twee keer identiek in.",
  invalid_email: "Dit is geen geldig e-mailadres.",
  missing_name: "Voornaam en achternaam zijn verplicht.",
  profile_missing:
    "Er bestaat een account voor dit adres maar het profiel ontbreekt. Neem contact op met de beheerder.",
  generic: "Kon de klant niet aanmaken. Probeer opnieuw.",
};

/**
 * Vindt een bestaande klant op het genormaliseerde e-mailadres, of maakt er
 * anders een aan via de auth-laag. Retourneert altijd het profiel-id waar de
 * wizard direct createPaymentRequest (PR A) op kan aanroepen.
 *
 * Dubbele gate-laagdeling zoals PR A: requireAdmin() hier; de RPC die erna
 * komt (admin_create_order) gate't zelf nogmaals via tmc.is_admin().
 */
export async function findOrCreateCustomer(
  input: FindOrCreateCustomerInput,
): Promise<FindOrCreateCustomerActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.message };

  try {
    const admin = createAdminClient();

    const deps: CustomerDeps = {
      db: {
        async findProfileByEmail(emailNormalized) {
          // ilike zonder wildcards = exacte, case-insensitieve match.
          // profiles.email is niet uniek (de uniciteit leeft op auth.users),
          // dus deterministisch de oudste rij bij een theoretische dubbele.
          const { data, error } = await admin
            .from("profiles")
            .select(PROFILE_COLUMNS)
            .ilike("email", escapeLike(emailNormalized))
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle<ProfileRow>();
          if (error) throw error;
          return data ? toCustomerProfile(data) : null;
        },
        async getProfileById(id) {
          const { data, error } = await admin
            .from("profiles")
            .select(PROFILE_COLUMNS)
            .eq("id", id)
            .maybeSingle<ProfileRow>();
          if (error) throw error;
          return data ? toCustomerProfile(data) : null;
        },
      },
      auth: {
        async createUser({ email, firstName, lastName }) {
          // email_confirm: false — Marlon heeft het adres niet geverifieerd,
          // dus het als bevestigd markeren zou onwaar zijn. De eerste
          // OTP-login bevestigt het adres alsnog. Geen phone in de metadata
          // (zie customer-core.ts: trigger-terugrol-valkuil).
          const { data, error } = await admin.auth.admin.createUser({
            email,
            email_confirm: false,
            user_metadata: {
              first_name: firstName,
              last_name: lastName,
              signup_path: "admin_wizard",
            },
          });
          if (error) {
            // GoTrue: bestaand adres geeft email_exists (HTTP 422).
            if (error.code === "email_exists" || error.status === 422) {
              return { duplicate: true };
            }
            throw error;
          }
          if (!data.user) {
            throw new Error("createUser gaf geen user terug");
          }
          return { userId: data.user.id };
        },
      },
      async emitCustomerCreated(profileId) {
        // Zelfde event-vorm als de walk-in (check-in/actions.ts), andere source.
        await emitEvent({
          type: "member.created",
          actorType: "admin",
          actorId: gate.userId,
          subjectType: "profile",
          subjectId: profileId,
          payload: { profile_id: profileId, source: "admin_wizard" },
        });
      },
    };

    const result = await findOrCreateCustomerCore(deps, input);
    if (!result.ok) {
      if (result.reason === "profile_missing") {
        console.error(
          "[findOrCreateCustomer] auth-user zonder profielrij (legacy?), handmatig herstel nodig",
          { email: input.email.trim().toLowerCase() },
        );
      }
      return { ok: false, error: FAIL_COPY[result.reason] ?? FAIL_COPY.generic };
    }
    return result;
  } catch (e) {
    console.error("[findOrCreateCustomer]", e);
    return { ok: false, error: FAIL_COPY.generic };
  }
}

export interface CustomerSearchRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  memberCode: string;
  role: string;
}

/**
 * Vrij zoeken voor de wizard-UI: naam, e-mail of telefoon. Alleen-lezen.
 * Bewust ZONDER role-filter (een trainer kan ook iets kopen); de rol gaat
 * mee in het resultaat zodat de wizard kan tonen wie het is. De
 * aanmaak-blokkade hangt NIET hieraan maar aan de exacte e-mailmatch in
 * findOrCreateCustomer.
 */
export async function searchCustomers(
  query: string,
): Promise<CustomerSearchRow[]> {
  // C3: admin of actieve trainer. Het PT-boek-scherm (KlantPaneel) leunt
  // hierop; zoeken is alleen-lezen. Aanmaken (findOrCreateCustomer) en
  // e-mailcorrectie blijven admin-only.
  const gate = await requireTrainerOrAdmin();
  if (!gate.ok) return [];

  // Komma's en haakjes breken de PostgREST or()-syntax; eruit filteren is
  // veiliger dan quoten en die tekens komen in naam/e-mail/telefoon toch
  // niet zinvol voor.
  const q = query.trim().replace(/[,()]/g, "");
  if (q.length < 2) return [];

  const pattern = `%${escapeLike(q)}%`;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, first_name, last_name, email, phone, member_code, role")
    .or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`,
    )
    .order("last_name", { ascending: true })
    .limit(20);
  if (error) {
    console.error("[searchCustomers]", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    memberCode: row.member_code,
    role: row.role,
  }));
}

// ----------------------------------------------------------------------------
// Directe e-mailcorrectie op een bestaand account (lifecycle fase 2B)
// ----------------------------------------------------------------------------

export type CorrectEmailResult =
  | { ok: true; message: string; newEmail: string }
  | { ok: false; message: string; reason?: string };

/**
 * Corrigeert het login-adres van een bestaand account. De volledige
 * synchronisatie (auth.users.email + auth.identities + tmc.profiles.email)
 * en de PR B-strengheid (genormaliseerd zoek-eerst, weigeren bij een
 * bestaand ander account) zitten in EEN transactie in de definer-RPC
 * tmc.admin_correct_customer_email; deze action is de dunne
 * requireAdmin-schil met audit-log. profiles.email voedt de
 * betaallink-mails, dus na deze correctie gaan resends naar het nieuwe
 * adres.
 */
export async function correctCustomerEmail(input: {
  profileId: string;
  newEmail: string;
}): Promise<CorrectEmailResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, message: gate.message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_correct_customer_email", {
    p_profile_id: input.profileId,
    p_new_email: input.newEmail,
  });

  if (error) {
    console.error("[correctCustomerEmail] rpc failed", error);
    return {
      ok: false,
      // COPY: confirm met Marlon
      message: "De e-mailcorrectie kon niet worden uitgevoerd. Probeer het opnieuw.",
    };
  }

  const result = data as {
    ok: boolean;
    reason?: string;
    old_email?: string;
    new_email?: string;
    already_current?: boolean;
    email?: string;
  } | null;

  if (!result?.ok) {
    const messages: Record<string, string> = {
      // COPY: confirm met Marlon
      email_exists:
        "Dit e-mailadres hoort al bij een ander account; de correctie is geweigerd.",
      invalid_email: "Dit is geen geldig e-mailadres.",
      user_not_found: "Account niet gevonden.",
      sso_user: "Dit account logt in via een externe provider; het adres kan hier niet gewijzigd worden.",
    };
    return {
      ok: false,
      reason: result?.reason,
      message:
        messages[result?.reason ?? ""] ??
        `De correctie is geweigerd (${result?.reason ?? "onbekende reden"}).`,
    };
  }

  if (result.already_current) {
    return {
      ok: true,
      // COPY: confirm met Marlon
      message: "Dit account gebruikt dit e-mailadres al.",
      newEmail: result.email ?? input.newEmail,
    };
  }

  const admin = createAdminClient();
  await admin.from("admin_audit_log").insert({
    admin_id: gate.userId,
    action: "email_corrected",
    target_type: "profile",
    target_id: input.profileId,
    details: {
      old_email: result.old_email ?? null,
      new_email: result.new_email ?? null,
    },
  });

  return {
    ok: true,
    // COPY: confirm met Marlon
    message: `E-mailadres bijgewerkt naar ${result.new_email}. Login en betaallink-mails gebruiken vanaf nu dit adres.`,
    newEmail: result.new_email ?? input.newEmail,
  };
}
