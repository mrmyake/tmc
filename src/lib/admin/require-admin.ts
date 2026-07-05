import "server-only";
import { createClient } from "@/lib/supabase/server";

export type RequireAdminResult =
  | { ok: true; userId: string }
  | { ok: false; message: string };

/**
 * Gedeelde admin-gate voor alle admin server actions. Was tot voor kort
 * 12x apart gedefinieerd; elke wijziging aan de gate moest 12x handmatig
 * worden doorgevoerd, met risico dat een kopie werd overgeslagen.
 */
export async function requireAdmin(): Promise<RequireAdminResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // COPY: confirm met Marlon
  if (!user) return { ok: false, message: "Je bent uitgelogd." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    // COPY: confirm met Marlon
    return { ok: false, message: "Geen toegang." };
  }
  return { ok: true, userId: user.id };
}
