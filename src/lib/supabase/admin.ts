import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_TIMEOUT_MS, fetchWithTimeout } from "@/lib/outbound-timeouts";

/**
 * Non-throwing check of de service-role env-vars aanwezig zijn. Bedoeld voor
 * publieke, geprerenderde pagina's (homepage-teaser, /rooster) zodat een build
 * op een branch zonder Supabase-env niet hard faalt: zonder env tonen die
 * pagina's hun lege staat en vult ISR het rooster zodra de env wél aanwezig is
 * (productie). API-/cron-/admin-paden blijven hard falen via createAdminClient.
 */
export function isAdminConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * Service-role client — gebruik UITSLUITEND in server-side API routes /
 * cron / admin endpoints. Bypasst RLS. Nooit exposen aan de browser.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase admin client vereist NEXT_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createServiceClient(url, serviceKey, {
    db: { schema: process.env.DB_SCHEMA ?? "tmc" },
    auth: { persistSession: false, autoRefreshToken: false },
    // Timeout per verzoek (3a-bis, outbound-timeouts.ts): een hangende
    // database komt als { error } terug, nooit als throw.
    global: { fetch: fetchWithTimeout(SUPABASE_TIMEOUT_MS) },
  }) as unknown as SupabaseClient;
}
