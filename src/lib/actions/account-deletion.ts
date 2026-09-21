"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient as createBareClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events/emit";
import {
  cancelAccountDeletionRequest,
  requestAccountDeletionForMember,
} from "@/lib/account-deletion/service";

/**
 * Server actions van de ledenkant van de accountverwijdering (PR 3):
 * herauthenticatie met een e-mail-OTP en het indienen van het verzoek.
 * De kern (src/lib/account-deletion/) blijft onaangeraakt; dit bestand
 * roept alleen requestAccountDeletionForMember aan.
 *
 * Herauthenticatie: dezelfde 6-cijferige code als de login
 * (spec-otp-login.md), aangevraagd op het adres van de ingelogde sessie
 * (nooit een adres uit clientinvoer) en server-side geverifieerd met
 * Sb-Forwarded-For, zoals verifyLoginOtp in src/lib/actions/auth.ts.
 * Apple staat een bevestigingsstap toe zolang die niet onnodig moeilijk
 * is; een code naar het bekende adres is dezelfde drempel als inloggen.
 */

export type SendCodeResult = { ok: true } | { ok: false; error: string };

export async function sendAccountDeletionCode(): Promise<SendCodeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // COPY: confirm met Marlon
  if (!user?.email) return { ok: false, error: "Je bent uitgelogd." };

  const { error } = await supabase.auth.signInWithOtp({
    email: user.email,
    options: { shouldCreateUser: false },
  });
  if (error) {
    console.error("[sendAccountDeletionCode] signInWithOtp", error.code, error.status);
    // COPY: confirm met Marlon
    const msg =
      error.code === "over_email_send_rate_limit" || error.status === 429
        ? "Er is net een code verstuurd. Wacht een minuut en probeer het dan opnieuw."
        : "De code kon niet verstuurd worden. Probeer het opnieuw.";
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export type ConfirmDeletionResult =
  | {
      ok: true;
      deletionId: string;
      purgeAfter: string;
      requestedAt: string;
      /** Laatste dag van het opgezegde abonnement; null als het account direct is gesloten. */
      closesOn: string | null;
      revoked: {
        bookings: number;
        waitlist: number;
        ptSessions: number;
        guestBookings: number;
        devices: number;
        creditsForfeited: number;
      };
    }
  | { ok: false; reason: "code" | "membership_active" | "staff_role" | "other"; error: string };

export async function confirmAccountDeletion(input: {
  code: string;
  reason: string;
}): Promise<ConfirmDeletionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    // COPY: confirm met Marlon
    return { ok: false, reason: "other", error: "Je bent uitgelogd." };
  }

  const token = input.code.replace(/\D/g, "");
  if (token.length === 0) {
    // COPY: confirm met Marlon
    return { ok: false, reason: "code", error: "Vul de code uit de mail in." };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("[confirmAccountDeletion] Supabase env ontbreekt");
    // COPY: confirm met Marlon
    return { ok: false, reason: "other", error: "Verwijderen is tijdelijk niet beschikbaar." };
  }

  // Echte client-IP voor de rate-limit van Supabase; zie verifyLoginOtp.
  const h = await headers();
  const clientIp = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;
  const authClient = createBareClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(clientIp ? { global: { headers: { "Sb-Forwarded-For": clientIp } } } : {}),
  });

  const { data, error } = await authClient.auth.verifyOtp({
    email: user.email,
    token,
    type: "email",
  });

  // De code moet bij DEZE sessie horen: een geldige code van een ander
  // account (zelfde browser, ander adres) mag nooit dit account verwijderen.
  if (error || !data.session || data.session.user.id !== user.id) {
    await emitEvent({
      type: "auth.otp_failed",
      actorType: "member",
      actorId: user.id,
      subjectType: "profile",
      subjectId: user.id,
      payload: { reason: error?.code ?? "no_session", context: "account_deletion" },
    });
    // COPY: confirm met Marlon
    const msg =
      error?.code === "over_request_rate_limit" || error?.status === 429
        ? "Te veel pogingen. Wacht even en probeer het dan opnieuw."
        : "Onjuiste of verlopen code. Controleer de code of vraag een nieuwe aan.";
    return { ok: false, reason: "code", error: msg };
  }

  // De verificatie leverde een nieuwe sessie op voor dezelfde gebruiker;
  // die zetten we niet in de cookies: het verzoek hieronder eindigt met
  // een globale sign-out (de kern bant de auth-user), dus er is geen
  // sessie meer om te bewaren.
  const result = await requestAccountDeletionForMember(user.id, input.reason, supabase);
  if (!result.ok) {
    // COPY: confirm met Marlon
    if (result.reason === "membership_active") {
      return {
        ok: false,
        reason: "membership_active",
        error: "Je lidmaatschap loopt nog. Zeg het eerst op; daarna kun je je account verwijderen.",
      };
    }
    if (result.reason === "staff_role") {
      return {
        ok: false,
        reason: "staff_role",
        error: "Dit is een teamaccount. Neem contact op met Marlon.",
      };
    }
    return { ok: false, reason: "other", error: "Je profiel is niet gevonden." };
  }

  // Direct gesloten (geen lopend abonnement): de kern heeft de auth-user
  // geband; dan ook deze sessie dicht, overal. Wacht de sluiting op de
  // einddatum, dan blijft het lid gewoon ingelogd tot die dag.
  if (!result.closesOn) {
    await supabase.auth.signOut({ scope: "global" });
  }
  revalidatePath("/app/profiel");

  const freeze = result.freeze;
  return {
    ok: true,
    deletionId: result.row.id,
    purgeAfter: result.row.purge_after,
    requestedAt: result.row.requested_at,
    closesOn: result.closesOn,
    revoked: {
      bookings: freeze?.bookingsCancelled ?? 0,
      waitlist: freeze?.waitlistRemoved ?? 0,
      ptSessions: freeze?.ptBookingsCancelled ?? 0,
      guestBookings: freeze?.guestBookingsCancelled ?? 0,
      devices: (freeze?.deviceTokensRevoked ?? 0) + (freeze?.pushTokensRemoved ?? 0),
      creditsForfeited: freeze?.creditsForfeited ?? 0,
    },
  };
}

export type CancelDeletionResult = { ok: true } | { ok: false; error: string };

/**
 * Intrekken van een open verzoek door het lid zelf. Kan alleen zolang de
 * sluiting nog op de einddatum wacht (step_status.freeze = 'pending'): tot
 * dan is er niets ingetrokken, dus intrekken is volledig. Na de sluiting
 * is het lid geband en komt hij hier niet meer; wat dan nog kan is een
 * admin-handeling. Eigenaarschap via RLS self-read: de rij wordt met de
 * cookie-client van het lid gelezen, nooit met een id uit clientinvoer.
 */
export async function cancelAccountDeletion(): Promise<CancelDeletionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // COPY: confirm met Marlon
  if (!user) return { ok: false, error: "Je bent uitgelogd." };

  const { data: open } = await supabase
    .from("account_deletions")
    .select("id, step_status")
    .eq("profile_id", user.id)
    .in("status", ["requested", "in_progress", "blocked"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // COPY: confirm met Marlon
  if (!open) return { ok: false, error: "Er staat geen verzoek open." };
  const freeze = (open.step_status as { freeze?: string } | null)?.freeze;
  if (freeze !== "pending") {
    // COPY: confirm met Marlon
    return {
      ok: false,
      error: "Je account is al afgesloten; intrekken kan nu alleen via Marlon.",
    };
  }

  const r = await cancelAccountDeletionRequest(open.id, { actorType: "member", actorId: user.id });
  if (!r.ok) {
    // COPY: confirm met Marlon
    return { ok: false, error: "Intrekken lukte niet. Probeer het opnieuw." };
  }
  revalidatePath("/app/profiel");
  revalidatePath("/app/profiel/verwijderen");
  return { ok: true };
}
