/**
 * Pure kern van de actiepagina's (spec-proefles-funnel.md): slugvorm, het
 * ondertekende cookie en het pijlerfilter. Zonder "server-only", zonder
 * next/headers en zonder database, zodat node:test hem direct laadt
 * (scripts/actie/core.test.mts). De server-only schil staat in cookie.ts en
 * lookup.ts.
 *
 * In dit bestand en in het cookie staat nooit een proefcode: het cookie
 * draagt alleen de slug. De code hangt in tmc.campaign_landings aan de slug
 * en wordt bij elk gebruik server-side opgezocht (B1).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { TrialCodeScope } from "@/lib/trial-codes/scope";

/** Zelfde vorm als de checks op campaign_landings.slug en trial_bookings.action_page. */
const SLUG_RE = /^[a-z0-9-]{1,64}$/;

export function isActieSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_RE.test(value);
}

export const ACTIE_COOKIE = "tmc_actie";
/** 24 uur: lang genoeg om later op de dag terug te komen en alsnog te boeken. */
export const ACTIE_TTL_SECONDS = 24 * 60 * 60;

export type ActiePillarFilter = "yoga_mobility" | "kettlebell" | "vrij_trainen";

export function isActiePillarFilter(value: unknown): value is ActiePillarFilter {
  return value === "yoga_mobility" || value === "kettlebell" || value === "vrij_trainen";
}

// Eigen prefix in de ondertekende tekst: een handtekening van het
// proefcode-cookie (zelfde sleutel) is zo nooit geldig als actie-cookie.
function sign(slug: string, expiresAt: number, secret: string): string {
  return createHmac("sha256", secret).update(`actie.${slug}.${expiresAt}`).digest("base64url");
}

/** Cookiewaarde `slug.verlooptijd.handtekening`, of null zonder sleutel of met een ongeldige slug. */
export function buildActieCookieValue(
  slug: string,
  secret: string,
  nowSeconds: number,
): { value: string; expiresAt: number } | null {
  if (!secret || !isActieSlug(slug)) return null;
  const expiresAt = nowSeconds + ACTIE_TTL_SECONDS;
  return { value: `${slug}.${expiresAt}.${sign(slug, expiresAt, secret)}`, expiresAt };
}

/** De slug uit een echt, niet-verlopen cookie, anders null. */
export function parseActieCookieValue(
  raw: string | null | undefined,
  secret: string,
  nowSeconds: number,
): string | null {
  if (!raw || !secret) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [slug, exp, sig] = parts;
  const expiresAt = Number(exp);
  if (!isActieSlug(slug) || !sig || !Number.isInteger(expiresAt)) return null;
  if (expiresAt <= nowSeconds) return null;
  const expected = Buffer.from(sign(slug, expiresAt, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return slug;
}

/**
 * Welke lijst of kiezer de boekingsstap toont voor een actiepagina: de scope
 * van de code, versmald tot het pijlerfilter van de slug als dat binnen de
 * scope valt. Past het filter niet bij de code (verkeerd ingerichte rij), dan
 * geldt de scope van de code. Dit is alleen weergave: tmc.redeem_trial_code
 * beslist bij het boeken op de scope van de code, nooit op het filter.
 */
export function displayScopeFor(
  codeScope: TrialCodeScope,
  pillarFilter: ActiePillarFilter | null,
): TrialCodeScope {
  if (!pillarFilter || pillarFilter === codeScope) return codeScope;
  if (codeScope === "all") return pillarFilter;
  if (codeScope === "group" && pillarFilter !== "vrij_trainen") return pillarFilter;
  return codeScope;
}
