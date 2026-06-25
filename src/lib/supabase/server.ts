import { createClient as createSb } from "@supabase/supabase-js";

const schema = process.env.DB_SCHEMA ?? "tmc";

/**
 * Data/storage client for Server Components, Route Handlers and Server Actions.
 * Auth is now Lucia (not Supabase Auth), so this connects with the service-role
 * key scoped to the `tmc` schema. RLS is bypassed — authorization is enforced in
 * app code via validateRequest() + role checks. Async kept for call-site compat.
 *
 * ⚠️ Because RLS no longer scopes rows, member-facing queries MUST filter by the
 * authenticated user (e.g. .eq("profile_id", user.id)).
 */
export async function createClient() {
  return createSb(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema }, auth: { persistSession: false, autoRefreshToken: false } }
  );
}
