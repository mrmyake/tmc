"use server";

import { cookies, headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const COOKIE_NAME = "tmc_admin_unlock";
const LOCK_TTL_SECONDS = 5 * 60;

/** Echte client-IP: op Vercel is de eerste entry van x-forwarded-for
 *  het IP van de bezoeker. */
async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
}

/**
 * Ontgrendel admin-modus op de tablet. Verifieert PIN tegen bcrypt-hash
 * in booking_settings. Bij succes: httpOnly cookie met 5-min TTL.
 *
 * Deze action is publiek aanroepbaar (tablet zonder auth). Brute-force
 * wordt afgeremd via tmc.register_checkin_pin_attempt: per IP tien
 * pogingen per venster, daarna vijftien minuten lockout. Het IP is dat
 * van het studiowifi, dus iedereen op de tablet deelt een teller; een
 * goede PIN reset hem. Ingelogde staf heeft de PIN niet nodig
 * (requireStaff() accepteert ook een stafsessie), vandaar de hint in de
 * lockout-melding.
 */
export async function unlockAdminMode(
  pin: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!/^[0-9]{4,6}$/.test(pin.trim())) {
    return { ok: false, message: "PIN is 4-6 cijfers." };
  }

  const admin = createAdminClient();
  const ip = await clientIp();

  const { data: attempt, error: attemptError } = await admin.rpc(
    "register_checkin_pin_attempt",
    { p_ip: ip },
  );
  if (attemptError) {
    // Fail-closed: zonder werkende teller geen verify.
    console.error("[unlockAdminMode] throttle RPC", attemptError);
    return { ok: false, message: "Er ging iets mis." };
  }
  if (!attempt?.allowed) {
    const minutes = Math.max(
      1,
      Math.ceil((attempt?.retry_after_seconds ?? 900) / 60),
    );
    return {
      ok: false,
      // COPY: confirm met Marlon
      message: `Te veel foute pogingen. Probeer het over ${minutes} ${minutes === 1 ? "minuut" : "minuten"} opnieuw. Ingelogde staf kan intussen gewoon doorwerken via de normale login.`,
    };
  }

  const { data, error } = await admin.rpc("verify_admin_checkin_pin", {
    p_pin: pin.trim(),
  });

  if (error) {
    console.error("[unlockAdminMode] RPC", error);
    return { ok: false, message: "Er ging iets mis." };
  }
  if (!data) {
    return { ok: false, message: "Onjuiste PIN." };
  }

  // Goede PIN: teller weg, zodat het gedeelde studiowifi-IP niet met
  // oude foute pogingen blijft zitten.
  const { error: resetError } = await admin
    .from("checkin_pin_attempts")
    .delete()
    .eq("ip", ip);
  if (resetError) {
    console.error("[unlockAdminMode] teller-reset", resetError);
  }

  const store = await cookies();
  store.set(COOKIE_NAME, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LOCK_TTL_SECONDS,
  });

  return { ok: true };
}

export async function lockAdminMode(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * Server-side check of admin-modus ontgrendeld is. Gebruikt in server
 * actions die admin-rechten vereisen binnen de tablet-context.
 */
export async function isAdminUnlocked(): Promise<boolean> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value === "1";
}
