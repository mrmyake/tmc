import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";

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
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
