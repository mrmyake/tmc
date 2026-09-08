"use server";

import { createClient } from "@/lib/supabase/server";
import { revealAccessPin } from "@/lib/access/reveal";

export type RevealMyPinResult =
  | { ok: true; pin: string }
  | { ok: false; error: string };

/**
 * Onthult de deurcode van het ingelogde lid. Geeft uitsluitend auth.uid()
 * door aan revealAccessPin (spec-akiles-access.md, "Onthullen"); de PIN
 * wordt nergens gelogd, opgeslagen of in een event gezet, ook hier niet.
 */
export async function revealMyAccessPin(): Promise<RevealMyPinResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // COPY: confirm met Marlon
    return { ok: false, error: "Je bent niet ingelogd." };
  }

  const result = await revealAccessPin(user.id);
  if (result.ok) return { ok: true, pin: result.pin };

  switch (result.reason) {
    case "no_credentials":
      // COPY: confirm met Marlon
      return { ok: false, error: "Er is nog geen deurcode voor je aangemaakt. Dat gebeurt automatisch zodra je abonnement actief is; duurt het langer dan een dag, laat het ons weten." };
    case "no_access":
      // COPY: confirm met Marlon
      return { ok: false, error: "Je deurtoegang is op dit moment niet actief." };
    case "not_configured":
      // COPY: confirm met Marlon
      return { ok: false, error: "De deurcode is tijdelijk niet op te halen. Probeer het later opnieuw." };
    case "akiles_error":
    default:
      // COPY: confirm met Marlon
      return { ok: false, error: "Ophalen lukte niet. Probeer het zo nog eens." };
  }
}
