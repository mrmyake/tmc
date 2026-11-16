import "server-only";
import { cookies } from "next/headers";
import {
  ACTIE_COOKIE,
  ACTIE_TTL_SECONDS,
  buildActieCookieValue,
  parseActieCookieValue,
} from "./core";

/**
 * Het enige cookie van de actieflow (spec-proefles-funnel.md, B1): de
 * ondertekende slug van de actiepagina, 24 uur, httpOnly, sameSite lax,
 * secure in productie (zoals het proefcode-cookie, zodat lokaal ontwikkelen
 * over http blijft werken). Het bevat nooit een code. Het bewijst alleen dat
 * deze browser via een actiepagina binnenkwam; of de les gratis is beslist
 * bij het boeken uitsluitend tmc.redeem_trial_code.
 *
 * Sleutel: de service-role-sleutel, alleen server-side, met een eigen prefix
 * in de ondertekende tekst (core.ts).
 */

function secret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export async function setActieCookie(slug: string): Promise<boolean> {
  const built = buildActieCookieValue(slug, secret(), nowSeconds());
  if (!built) return false;
  const store = await cookies();
  store.set(ACTIE_COOKIE, built.value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACTIE_TTL_SECONDS,
  });
  return true;
}

/** De slug uit een echt, niet-verlopen cookie, anders null. */
export async function readActieCookie(): Promise<string | null> {
  const store = await cookies();
  return parseActieCookieValue(store.get(ACTIE_COOKIE)?.value, secret(), nowSeconds());
}

export async function clearActieCookie(): Promise<void> {
  const store = await cookies();
  store.delete(ACTIE_COOKIE);
}
