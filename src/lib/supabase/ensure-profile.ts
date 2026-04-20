import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "./admin";

/**
 * Zorgt dat er een profiles-rij bestaat voor deze auth-user. Idempotent.
 *
 * Normaal doet de `on_auth_user_created` trigger dit, maar:
 * - users die vóór migratie-install aangemaakt zijn hebben 'm gemist;
 * - admin-API signups kunnen de trigger skippen;
 * - toekomstige schema-migraties kunnen de trigger tijdelijk uitzetten.
 *
 * Deze helper draait server-side (service role) om de RLS insert-guard
 * te omzeilen; de browser-client kan zichzelf niet in de profiles tabel
 * plaatsen.
 */
export async function ensureProfile(user: User): Promise<void> {
  if (!user.email) return;

  try {
    const admin = createAdminClient();
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

    const { error } = await admin.from("profiles").upsert(
      {
        id: user.id,
        email: user.email,
        first_name: (meta.first_name as string) ?? "",
        last_name: (meta.last_name as string) ?? "",
      },
      { onConflict: "id", ignoreDuplicates: true }
    );

    if (error) {
      console.warn("[ensureProfile]", error.message);
    }
  } catch (e) {
    console.warn("[ensureProfile] fatal:", e);
  }
}
