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
 * Daarnaast syncen we de andere kant op: als het profile al een naam heeft
 * maar auth.users.raw_user_meta_data (nog) niet, zetten we 'm daar ook
 * neer. Dat zorgt dat email-templates `{{ .Data.first_name }}` kunnen
 * gebruiken voor member-specifieke begroetingen.
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

    await admin.from("profiles").upsert(
      {
        id: user.id,
        email: user.email,
        first_name: (meta.first_name as string) ?? "",
        last_name: (meta.last_name as string) ?? "",
      },
      { onConflict: "id", ignoreDuplicates: true },
    );

    // If the profile already had a name but metadata is empty (e.g. user
    // signed up via magic link with no name, then filled it in on /app/profiel
    // before we started syncing the other way), back-fill metadata now.
    if (!meta.first_name || !meta.last_name) {
      const { data: profile } = await admin
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.first_name || profile?.last_name) {
        await admin.auth.admin.updateUserById(user.id, {
          user_metadata: {
            first_name: profile.first_name ?? "",
            last_name: profile.last_name ?? "",
          },
        });
      }
    }
  } catch (e) {
    console.warn("[ensureProfile] fatal:", e);
  }
}
