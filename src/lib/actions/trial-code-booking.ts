"use server";

import { cookies, headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { sendNotification } from "@/lib/ntfy";
import { formatWeekdayDate, formatTimeRange } from "@/lib/format-date";
import TrialCodeConfirmation from "@/emails/trial_code_confirmation";

/**
 * Community-growth PR D: bezoekers met een code van Marlon boeken zelf een
 * gratis groepsles via /proefles/code. UI plus deze server actions bovenop
 * de bestaande RPC's uit PR B (tmc.redeem_trial_code) — geen migraties,
 * geen wijziging aan trial_codes/redeem_trial_code/book_class_session.
 *
 * Codeopslag tussen stap a (invoeren) en c (bevestigen): httpOnly cookie,
 * alleen de code zelf, nooit sessiegegevens, nooit in de URL.
 */

const COOKIE_NAME = "tmc_trial_code";
const COOKIE_TTL_SECONDS = 30 * 60;

// In-memory rate limit, per Vercel-instance. Zwakker dan een gedeelde
// store (meerdere instances delen geen teller), maar zonder nieuwe
// migratie of infra-provisioning en voldoende afschrikking tegen een
// naïeve geautomatiseerde poging op deze schaal.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const attemptsByIp = new Map<string, { count: number; windowStart: number }>();

function pruneRateLimitMap(now: number) {
  if (attemptsByIp.size < 2000) return;
  for (const [key, entry] of attemptsByIp) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) attemptsByIp.delete(key);
  }
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  pruneRateLimitMap(now);
  const entry = attemptsByIp.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    attemptsByIp.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_ATTEMPTS;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
}

function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .trim();
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.themovementclub.nl";
}

// COPY: confirm met Marlon
const GENERIC_INVALID_MESSAGE = "Deze code is niet geldig.";
// COPY: confirm met Marlon
const EXPIRED_MESSAGE = "Deze code is verlopen.";
// COPY: confirm met Marlon
const RATE_LIMITED_MESSAGE = "Te veel pogingen. Probeer het later opnieuw.";

export type ValidateTrialCodeResult =
  | { ok: true; pillar: string | null }
  | { ok: false; message: string };

/**
 * Stap a: valideert de code read-only (bestaat, status active, niet
 * verlopen) en zet bij succes de httpOnly cookie. Elke afwijzing behalve
 * verlopen krijgt dezelfde neutrale tekst — verklapt niet of een code
 * bestaat maar al gebruikt of ingetrokken is.
 */
export async function validateTrialCode(
  rawCode: string,
): Promise<ValidateTrialCodeResult> {
  const ip = await clientIp();
  if (isRateLimited(ip)) {
    return { ok: false, message: RATE_LIMITED_MESSAGE };
  }

  const code = normalizeCode(rawCode);
  if (!code) {
    return { ok: false, message: GENERIC_INVALID_MESSAGE };
  }

  const admin = createAdminClient();
  const { data: trialCode, error } = await admin
    .from("trial_codes")
    .select("pillar, status, expires_at")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    console.error("[validateTrialCode] query failed", error);
    return { ok: false, message: GENERIC_INVALID_MESSAGE };
  }
  if (!trialCode || trialCode.status !== "active") {
    return { ok: false, message: GENERIC_INVALID_MESSAGE };
  }
  if (new Date(trialCode.expires_at) <= new Date()) {
    return { ok: false, message: EXPIRED_MESSAGE };
  }

  const store = await cookies();
  store.set(COOKIE_NAME, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_TTL_SECONDS,
  });

  return { ok: true, pillar: trialCode.pillar };
}

async function clearTrialCodeCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export type RedeemTrialCodeBookingResult =
  | {
      ok: true;
      className: string;
      whenLabel: string;
      cancelToken: string;
    }
  | {
      ok: false;
      // 'restart' stuurt terug naar stap a (code kwijt/ongeldig geworden),
      // 'retry_session' stuurt terug naar de sessiekiezer, 'retry_form'
      // blijft op het formulier.
      step: "restart" | "retry_session" | "retry_form";
      message: string;
    };

interface RedeemInput {
  sessionId: string;
  name: string;
  email: string;
  phone: string;
}

// COPY: confirm met Marlon
const REDEEM_REASON: Record<
  string,
  { step: "restart" | "retry_session" | "retry_form"; message: string }
> = {
  code_not_active: { step: "restart", message: GENERIC_INVALID_MESSAGE },
  code_expired: { step: "restart", message: EXPIRED_MESSAGE },
  code_not_found: { step: "restart", message: GENERIC_INVALID_MESSAGE },
  capacity_full: {
    step: "retry_session",
    message: "Deze les raakte net vol. Kies een andere sessie.",
  },
  session_not_found: {
    step: "retry_session",
    message: "Deze sessie bestaat niet meer. Kies een andere sessie.",
  },
  session_not_scheduled: {
    step: "retry_session",
    message: "Deze sessie is niet meer beschikbaar. Kies een andere sessie.",
  },
  session_in_past: {
    step: "retry_session",
    message: "Deze sessie is al voorbij. Kies een andere sessie.",
  },
  missing_fields: {
    step: "retry_form",
    message: "Vul alle velden in.",
  },
};

/**
 * Stap c: verzilvert de code via tmc.redeem_trial_code (service-role
 * client, dezelfde RPC en foutafhandelings-conventie als redeem_trial_code
 * zelf: jsonb {ok,reason}, geen exceptions voor verwachte weigeringen).
 * pillar_mismatch hoort in deze UI nooit voor te komen (de sessiekiezer
 * filtert al op de pillar van de code) — dat behandelen we als bug: loggen
 * en een generieke fout tonen, geen aparte copy.
 */
export async function redeemTrialCodeBooking(
  input: RedeemInput,
): Promise<RedeemTrialCodeBookingResult> {
  const store = await cookies();
  const code = store.get(COOKIE_NAME)?.value;

  if (!code) {
    // COPY: confirm met Marlon
    return {
      ok: false,
      step: "restart",
      message: "Je code is verlopen. Vul 'm opnieuw in.",
    };
  }

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  if (!input.sessionId || !name || !email || !phone) {
    return {
      ok: false,
      step: "retry_form",
      // COPY: confirm met Marlon
      message: "Vul alle velden in.",
    };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("redeem_trial_code", {
    p_code: code,
    p_session_id: input.sessionId,
    p_name: name,
    p_email: email,
    p_phone: phone,
  });

  if (error) {
    console.error("[redeemTrialCodeBooking] rpc failed", error);
    return {
      ok: false,
      step: "retry_form",
      // COPY: confirm met Marlon
      message: "Boeken lukte niet. Probeer het opnieuw.",
    };
  }

  const result = data as {
    ok: boolean;
    reason?: string;
    trial_booking_id?: string;
    cancel_token?: string;
    session_id?: string;
    session_start_at?: string;
  };

  if (!result.ok) {
    if (result.reason === "pillar_mismatch") {
      // Kan alleen als de sessiekiezer een verkeerde pillar toonde: bug,
      // geen normale weigering.
      console.error(
        "[redeemTrialCodeBooking] unexpected pillar_mismatch",
        { sessionId: input.sessionId },
      );
      return {
        ok: false,
        step: "retry_session",
        // COPY: confirm met Marlon
        message: "Deze sessie past niet bij je code. Kies een andere sessie.",
      };
    }

    const known = REDEEM_REASON[result.reason ?? ""];
    if (known?.step === "restart") {
      await clearTrialCodeCookie();
    }
    return {
      ok: false,
      step: known?.step ?? "retry_form",
      message:
        known?.message ??
        // COPY: confirm met Marlon
        "Boeken lukte niet. Probeer het opnieuw.",
    };
  }

  // Verzilverd. Cookie opruimen: eenmalig gebruikt, klaar.
  await clearTrialCodeCookie();

  const { data: session } = await admin
    .from("class_sessions")
    .select(
      `
        start_at, end_at,
        class_type:class_types(name),
        trainer:trainers(display_name)
      `,
    )
    .eq("id", input.sessionId)
    .maybeSingle();

  type ClassTypeRel = { name: string } | { name: string }[] | null;
  type TrainerRel = { display_name: string } | { display_name: string }[] | null;
  const classTypeRaw = session?.class_type as ClassTypeRel;
  const trainerRaw = session?.trainer as TrainerRel;
  const className = Array.isArray(classTypeRaw)
    ? (classTypeRaw[0]?.name ?? "Proefles")
    : (classTypeRaw?.name ?? "Proefles");
  const trainerName = Array.isArray(trainerRaw)
    ? (trainerRaw[0]?.display_name ?? "coach")
    : (trainerRaw?.display_name ?? "coach");

  const startAt = session?.start_at
    ? new Date(session.start_at)
    : result.session_start_at
      ? new Date(result.session_start_at)
      : new Date();
  const endAt = session?.end_at ? new Date(session.end_at) : startAt;
  const whenLabel = `${formatWeekdayDate(startAt)} · ${formatTimeRange(startAt, endAt)}`;
  const cancelToken = result.cancel_token ?? "";
  const cancelUrl = `${siteUrl()}/proefles/annuleren/${cancelToken}`;

  void sendEmail({
    to: email,
    toName: name.split(" ")[0],
    subject: `Je proefles staat vast: ${className} · ${whenLabel}`,
    react: TrialCodeConfirmation({
      firstName: name.split(" ")[0] ?? "",
      className,
      trainerName,
      whenLabel,
      cancelUrl,
    }),
  });

  void sendNotification(
    "Proefles geboekt via code!",
    `${name} (${email})\nTel: ${phone}\n${className} · ${whenLabel}\nCode: ${code}`,
    "ticket,muscle",
  );

  return {
    ok: true,
    className,
    whenLabel,
    cancelToken,
  };
}
