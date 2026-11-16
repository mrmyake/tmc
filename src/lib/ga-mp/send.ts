import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GA_MEASUREMENT_ID,
  MP_ENDPOINT,
  normalizeAdConsent,
  type AdConsent,
  type MpPayload,
} from "./core";

/**
 * Gedeelde server-kant van de Measurement Protocol-events (purchase en
 * trial_booked). Contract, gelijk voor beide (spec-conversiemeting.md):
 *
 * - Niets hier throwt. Analytics mag nooit een betaling, boeking of
 *   formulier laten falen; een fout levert alleen console.error op.
 * - De MP-URL bevat het api_secret en wordt daarom nooit gelogd, net zo min
 *   als de respons-body. Alleen een label, een id en de status.
 * - Zonder GA4_API_SECRET wordt het event stil overgeslagen.
 */

export type MpSendResult = "sent" | "skipped" | "failed";

export interface MpSendDeps {
  apiSecret?: string | undefined;
  fetchImpl?: typeof fetch;
}

export async function postMpEvent(
  payload: MpPayload,
  label: string,
  ref: string,
  deps: MpSendDeps = {},
): Promise<MpSendResult> {
  try {
    const apiSecret = "apiSecret" in deps ? deps.apiSecret : process.env.GA4_API_SECRET;
    if (!apiSecret) {
      // Config ontbreekt (bv. lokale dev): stil overslaan, nooit falen.
      console.warn(`[${label}] GA4_API_SECRET ontbreekt, overgeslagen`);
      return "skipped";
    }
    const fetchImpl = deps.fetchImpl ?? fetch;
    const res = await fetchImpl(
      `${MP_ENDPOINT}?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${encodeURIComponent(apiSecret)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) {
      console.error(`[${label}] MP-status ${res.status} voor ${ref}`);
      return "failed";
    }
    return "sent";
  } catch (e) {
    // Alleen de naam van de fout: een fetch-fout kan de URL (met het
    // api_secret) in zijn message of cause dragen.
    console.error(`[${label}] MP-verzoek mislukt voor ${ref}`, errorName(e));
    return "failed";
  }
}

function errorName(e: unknown): string {
  return e instanceof Error ? e.name : "onbekende fout";
}

type AdConsentTable = "orders" | "trial_bookings";

/**
 * Leest ad_consent met een EIGEN select, nooit samen met andere kolommen.
 * Zo kan een ontbrekende kolom (de migratie is nog niet gepusht) alleen tot
 * een gelogde fout en "unknown" leiden, nooit tot een gemist event: de
 * select van de bestaande kolommen staat hier los van.
 */
export async function readAdConsent(
  admin: SupabaseClient,
  table: AdConsentTable,
  id: string,
  label: string,
): Promise<AdConsent> {
  try {
    const { data, error } = await admin
      .from(table)
      .select("ad_consent")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error(`[${label}] ad_consent lezen mislukt (${table} ${id})`, error);
      return "unknown";
    }
    return normalizeAdConsent((data as { ad_consent?: unknown } | null)?.ad_consent);
  } catch (e) {
    console.error(`[${label}] ad_consent lezen gooide (${table} ${id})`, e);
    return "unknown";
  }
}

/**
 * Schrijft ad_consent met een EIGEN update, nooit samen met ga_client_id of
 * andere kolommen, om dezelfde reden als readAdConsent. Een mislukte update
 * wordt alleen gelogd.
 */
export async function writeAdConsent(
  admin: SupabaseClient,
  table: AdConsentTable,
  id: string,
  value: unknown,
  label: string,
): Promise<boolean> {
  try {
    const { error } = await admin
      .from(table)
      .update({ ad_consent: normalizeAdConsent(value) })
      .eq("id", id);
    if (error) {
      console.error(`[${label}] ad_consent schrijven mislukt (${table} ${id})`, error);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[${label}] ad_consent schrijven gooide (${table} ${id})`, e);
    return false;
  }
}
