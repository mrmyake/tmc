import { createBrowserClient } from "@supabase/ssr";

/**
 * Cookie-aware Supabase client voor client-components en realtime
 * subscriptions. Leest sessies uit de cookies die de server heeft gezet
 * via proxy.ts / server client. Gebruik in "use client" files.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
