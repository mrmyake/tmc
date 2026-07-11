"use server";

import { requireAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const gate = await requireAdmin();
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
