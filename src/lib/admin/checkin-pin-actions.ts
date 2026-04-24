"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin-only: zet de gedeelde team-PIN voor tablet admin-modus.
 * Gaat via de set_admin_checkin_pin RPC die zelf is_admin() checkt +
 * bcrypt-hashed opslaat.
 */
export async function setAdminCheckinPin(
  pin: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!/^[0-9]{4,6}$/.test(pin)) {
    return { ok: false, message: "PIN is 4-6 cijfers." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_admin_checkin_pin", {
    p_pin: pin,
  });
  if (error) {
    console.error("[setAdminCheckinPin]", error);
    return {
      ok: false,
      message: error.message.includes("Unauthorized")
        ? "Geen toegang."
        : "Opslaan mislukt.",
    };
  }
  revalidatePath("/app/admin/instellingen");
  return { ok: true };
}
