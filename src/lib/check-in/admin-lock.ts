"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const COOKIE_NAME = "tmc_admin_unlock";
const LOCK_TTL_SECONDS = 5 * 60;

/**
 * Ontgrendel admin-modus op de tablet. Verifieert PIN tegen bcrypt-hash
 * in booking_settings. Bij succes: httpOnly cookie met 5-min TTL.
 *
 * Deze action is publiek aanroepbaar (tablet zonder auth). Rate-limit
 * via PIN-hash-verify zelf — elk attempt doet een bcrypt-roundtrip,
 * wat brute-force onaantrekkelijk maakt.
 */
export async function unlockAdminMode(
  pin: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!/^[0-9]{4,6}$/.test(pin.trim())) {
    return { ok: false, message: "PIN is 4-6 cijfers." };
  }

  const admin = createAdminClient();
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
