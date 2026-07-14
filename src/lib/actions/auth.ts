"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient as createBareClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type VerifyOtpResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

/**
 * Post-login landing per rol. Zelfde mapping als
 * src/app/auth/callback/route.ts (die route blijft bestaan voor
 * trainer-invites en de seed-workflow, dus de mapping leeft op twee
 * plekken; wijzig ze samen).
 *
 * PT-agenda PR D: zie de uitgebreide toelichting bij de tegenhanger in
 * auth/callback/route.ts.
 */
function roleRedirect(
  role: string | null | undefined,
  adminHasActiveTrainerRow: boolean,
): string {
  if (role === "admin") {
    return adminHasActiveTrainerRow ? "/app/trainer/agenda" : "/app/admin";
  }
  if (role === "trainer") return "/app/trainer/agenda";
  return "/app";
}

/**
 * Verifieert een 6-cijferige e-mail-OTP en zet de sessie-cookies.
 *
 * Waarom een server action en geen directe client-side verifyOtp:
 * 1. Mislukte pogingen moeten in de append-only audit-log
 *    (tmc.events) terechtkomen, en die schrijft alleen server-side.
 * 2. Supabase's IP-rate-limiting op verificatiepogingen werkt alleen
 *    als het echte client-IP meegaat. Server-side calls komen anders
 *    allemaal van het Vercel-IP, waardoor alle leden 1 gedeelde
 *    rate-limit-bucket zouden delen: kapotte brute-force-bescherming
 *    en het risico dat een druk ochtendblok zichzelf buitensluit.
 *    Daarom sturen we Sb-Forwarded-For mee; Supabase accepteert die
 *    header alleen met een secret key (nooit de anon key, anders zou
 *    elke browser zijn eigen IP kunnen spoofen) en alleen als
 *    IP Address Forwarding aanstaat in de projectinstellingen
 *    (aangezet op 2026-07-03, samen met deze feature).
 *
 * Brute-force-beleid (spec-otp-login.md, besluit 3): geen eigen
 * lockout-tabel. Een 6-cijferige code, 10 minuten geldig, met
 * Supabase's IP-limiet van 30 verificaties per 5 minuten geeft een
 * aanvaller maximaal ~60 pogingen per codevenster op 1M combinaties.
 * Restrisico: een aanvaller die per poging van IP wisselt omzeilt de
 * IP-limiet. Geaccepteerd op deze schaal; de korte expiry en de
 * codelengte houden de slaagkans ook dan verwaarloosbaar.
 */
/**
 * Alleen interne paths accepteren voor `next` (voorkom open-redirect).
 * Zelfde validatie als src/app/auth/callback/route.ts — wijzig ze samen.
 */
function safeNextPath(next: string | undefined | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next === "/app" ? null : next;
}

export async function verifyLoginOtp(
  email: string,
  token: string,
  next?: string,
): Promise<VerifyOtpResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedToken = token.replace(/\D/g, "");

  if (!normalizedEmail || normalizedToken.length === 0) {
    // COPY: confirm with Marlon
    return { ok: false, error: "Vul de code uit de mail in." };
  }

  // Echte client-IP: op Vercel is de eerste entry van x-forwarded-for
  // het IP van de bezoeker.
  const h = await headers();
  const clientIp =
    (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("[verifyLoginOtp] Supabase env ontbreekt");
    // COPY: confirm with Marlon
    return { ok: false, error: "Inloggen is tijdelijk niet beschikbaar." };
  }

  // Losse auth-client, uitsluitend voor de verify-call: de service key
  // is vereist om Sb-Forwarded-For geaccepteerd te krijgen. Geen
  // sessie-persistentie; de sessie gaat hieronder via de cookie-aware
  // SSR-client naar de browser.
  const authClient = createBareClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(clientIp
      ? { global: { headers: { "Sb-Forwarded-For": clientIp } } }
      : {}),
  });

  const { data, error } = await authClient.auth.verifyOtp({
    email: normalizedEmail,
    token: normalizedToken,
    type: "email",
  });

  if (error || !data.session) {
    // Audit-trail: koppel de mislukte poging aan het profiel als het
    // e-mailadres bekend is. Payload bewust zonder e-mail/IP (geen PII
    // in tmc.events, conventie uit emit.ts).
    const profileId = await lookupProfileId(normalizedEmail);
    await emitEvent({
      type: "auth.otp_failed",
      actorType: "member",
      actorId: profileId,
      subjectType: profileId ? "profile" : null,
      subjectId: profileId,
      payload: {
        reason: error?.code ?? "no_session",
        known_profile: profileId !== null,
      },
    });

    // COPY: confirm with Marlon
    const msg =
      error?.code === "over_request_rate_limit" || error?.status === 429
        ? "Te veel pogingen. Wacht even en probeer het dan opnieuw."
        : "Onjuiste of verlopen code. Controleer de code of vraag een nieuwe aan.";
    return { ok: false, error: msg };
  }

  // Sessie doorzetten naar de browser-cookies via de SSR-client.
  const supabase = await createClient();
  const { error: setError } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (setError) {
    console.error("[verifyLoginOtp] setSession faalde:", setError);
    // COPY: confirm with Marlon
    return { ok: false, error: "Er ging iets mis. Probeer het opnieuw." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.session.user.id)
    .maybeSingle();

  let adminHasActiveTrainerRow = false;
  if (profile?.role === "admin") {
    const { data: trainerRow } = await supabase
      .from("trainers")
      .select("id")
      .eq("profile_id", data.session.user.id)
      .eq("is_active", true)
      .maybeSingle();
    adminHasActiveTrainerRow = trainerRow !== null;
  }

  const safeNext = safeNextPath(next);
  return {
    ok: true,
    redirectTo:
      safeNext ?? roleRedirect(profile?.role, adminHasActiveTrainerRow),
  };
}

async function lookupProfileId(email: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    return data?.id ?? null;
  } catch {
    return null;
  }
}
