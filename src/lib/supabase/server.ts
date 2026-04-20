import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Cookie-aware Supabase client voor Server Components, Route Handlers
 * en Server Actions. Respecteert RLS — leest/schrijft als de ingelogde
 * user. Next 16: cookies() is async.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components mogen geen cookies zetten. De proxy regelt
            // de refresh; hier silent negeren is safe.
          }
        },
      },
    }
  );
}
