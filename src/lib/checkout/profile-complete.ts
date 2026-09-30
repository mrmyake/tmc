import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  CHECKOUT_PROFILE_FIELDS,
  resolveCheckoutIdentity,
  type CheckoutIdentity,
  type CheckoutProfileRow,
} from "./profile-complete-core";

export type {
  CheckoutIdentity,
  CheckoutProfileField,
  CheckoutProfilePrefill,
} from "./profile-complete-core";

type SessionClient = Awaited<ReturnType<typeof createClient>>;

export type CheckoutIdentityResolution =
  | { status: "anonymous" }
  | (Exclude<CheckoutIdentity, { status: "anonymous" }> & { userId: string });

/**
 * De ene server-side check die bepaalt of een ingelogde bezoeker de
 * gegevensstap van de checkout mag overslaan. Gebruikt door
 * /abonnement/page.tsx en /kopen/page.tsx (voor de start-stage van de
 * configurator) en door createOrderAndCheckout (als poort vóór
 * create_order), zodat de pagina en de server action nooit een ander
 * oordeel hebben over hetzelfde profiel.
 *
 * Leest als de ingelogde user (RLS, eigen rij). Een leesfout of een
 * ontbrekende rij telt als onvolledig: liever een keer te veel de
 * gegevensstap dan een betaalstap die op de server strandt.
 */
export async function profileCompleteForCheckout(
  client?: SessionClient,
): Promise<CheckoutIdentityResolution> {
  const supabase = client ?? (await createClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "anonymous" };

  const { data, error } = await supabase
    .from("profiles")
    .select(CHECKOUT_PROFILE_FIELDS.join(","))
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    // Alleen de code: geen rij-inhoud, geen e-mail.
    console.error("[profileCompleteForCheckout] profiles read", error.code);
  }
  const profile = (data ?? null) as CheckoutProfileRow | null;
  const identity = resolveCheckoutIdentity(
    { id: user.id, email: user.email },
    profile,
  );
  if (identity.status === "anonymous") return identity;
  return { ...identity, userId: user.id };
}

/**
 * Wat naar de client-configurator gaat: dezelfde drie toestanden, zonder
 * user-id. Het e-mailadres en de voorvulling zijn de gegevens van de
 * ingelogde bezoeker zelf.
 */
export function clientCheckoutIdentity(
  resolution: CheckoutIdentityResolution,
): CheckoutIdentity {
  if (resolution.status === "anonymous") return resolution;
  const identity: CheckoutIdentity & { userId?: string } = { ...resolution };
  delete identity.userId;
  return identity;
}
