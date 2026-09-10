"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CHECKIN_PIN_LENGTH } from "@/lib/check-in/constants";

const PIN_PATTERN = new RegExp(`^[0-9]{${CHECKIN_PIN_LENGTH}}$`);

/**
 * Admin-only: zet de gedeelde team-PIN voor tablet admin-modus.
 * Gaat via de set_admin_checkin_pin RPC die zelf is_admin() checkt +
 * bcrypt-hashed opslaat. Lengte vast op CHECKIN_PIN_LENGTH: /checkin
 * verstuurt de PIN automatisch zodra dat aantal cijfers is ingevoerd,
 * dus een andere lengte zou daar nooit meer kunnen inloggen.
 */
export async function setAdminCheckinPin(
  pin: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!PIN_PATTERN.test(pin)) {
    // COPY: confirm met Marlon
    return { ok: false, message: `PIN is ${CHECKIN_PIN_LENGTH} cijfers.` };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_admin_checkin_pin", {
    p_pin: pin,
  });
  if (error) {
    console.error("[setAdminCheckinPin]", error);
    return {
      ok: false,
      message:
        error.message.includes("Unauthorized")
          ? "Geen toegang."
          : `Opslaan mislukt: ${error.message} (${error.code ?? "?"})`,
    };
  }
  revalidatePath("/app/admin/instellingen");
  return { ok: true };
}
