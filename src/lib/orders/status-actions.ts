"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { isValidOrderToken } from "@/lib/orders/payment-link-core";

/**
 * Statusbron voor de StatusPoller op de returnpagina's (workstream A).
 * Leest uitsluitend de database, gevuld door de Mollie-webhook; hier wordt
 * niets bij Mollie opgevraagd en niets gemuteerd. Elke action geeft alleen
 * een van drie uitkomsten terug, geen rijen, zodat de publieke varianten
 * (betaallink, proefles) niets lekken dat de pagina niet al toont.
 *
 *  - "pending": nog niet verwerkt, blijven pollen.
 *  - "done": terminaal en geslaagd (order activated, proefles paid).
 *  - "failed": terminaal en niet geslaagd, of geblokkeerd (paid met
 *    blocked_reason), verlopen, geannuleerd, onbekend.
 * De poller zelf onderscheidt done en failed niet; beide leiden tot een
 * refresh van de pagina, die de juiste copy toont.
 */
export type PollOutcome = "pending" | "done" | "failed";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function orderStatusToOutcome(status: string | null | undefined): PollOutcome {
  if (status === "activated") return "done";
  if (status === "pending" || status === "draft") return "pending";
  return "failed";
}

/** Eigen order van de ingelogde gebruiker (RLS via de user-client). */
export async function getOwnOrderStatus(orderId: string): Promise<PollOutcome> {
  if (!UUID_RE.test(orderId)) return "failed";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "failed";
  const { data, error } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (error) return "pending";
  return orderStatusToOutcome((data as { status: string } | null)?.status);
}

/** Order achter een betaallink; het token is de poort, zoals op /betaal/[token]. */
export async function getPaymentLinkStatus(token: string): Promise<PollOutcome> {
  if (!isValidOrderToken(token) || !isAdminConfigured()) return "failed";
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("status")
    .eq("token", token)
    .maybeSingle();
  if (error) return "pending";
  return orderStatusToOutcome((data as { status: string } | null)?.status);
}

/** Proeflesboeking op id, zoals /proefles/boeken/bedankt hem toont. */
export async function getTrialBookingStatus(trialId: string): Promise<PollOutcome> {
  if (!UUID_RE.test(trialId) || !isAdminConfigured()) return "failed";
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("trial_bookings")
    .select("status")
    .eq("id", trialId)
    .maybeSingle();
  if (error) return "pending";
  const status = (data as { status: string } | null)?.status;
  if (status === "paid") return "done";
  if (status === "pending") return "pending";
  return "failed";
}

const STATUS_TOKEN_RE = /^[0-9a-f]{64}$/;

/**
 * Gastcheckout (PR 2): status van een intent achter het status-token uit de
 * Mollie-redirect (?t=). De RPC checkout_intent_status geeft alleen status,
 * paid, paid_but_failed en e-mail terug; hier reduceren we dat verder tot de
 * drie poller-uitkomsten. Een converted intent is "done" (de order staat
 * dan minstens in pending en de webhook draait de keten); "failed" dekt
 * zowel afgebroken betalingen als betaald-maar-niet-afgerond, de pagina
 * maakt dat onderscheid zelf op paid_but_failed.
 */
export async function getCheckoutIntentStatus(statusToken: string): Promise<PollOutcome> {
  if (!STATUS_TOKEN_RE.test(statusToken) || !isAdminConfigured()) return "failed";
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("checkout_intent_status", {
    p_status_token: statusToken,
  });
  if (error) return "pending";
  const status = (data as { status?: string } | null)?.status;
  if (status === "converted") return "done";
  if (status === "draft" || status === "pending") return "pending";
  return "failed";
}
