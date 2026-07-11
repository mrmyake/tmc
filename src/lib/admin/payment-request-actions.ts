"use server";

import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { emitEvent } from "@/lib/events/emit";
import { siteUrl } from "@/lib/site-url";
import { formatEuro } from "@/lib/crowdfunding-helpers";
import PaymentRequest from "@/emails/payment_request";

export interface CreatePaymentRequestInput {
  /** Doelprofiel (de klant). Moet al bestaan; on-behalf aanmaken is PR B. */
  profileId: string;
  /** tmc.catalogue slug: een plan (abonnement) of een product. */
  slug: string;
  extendedAccess?: boolean;
  commit24m?: boolean;
  /** Inschrijfkosten-waiver (overstap). Alleen effectief bij een abonnement. */
  waiveSignupFee?: boolean;
  /** Levensduur van de betaallink in dagen; de RPC klemt op 1 t/m 14. */
  expiresInDays?: number;
}

export type CreatePaymentRequestResult =
  | {
      ok: true;
      orderId: string;
      /** De betaallink, ook los bruikbaar voor een kopieerbare UI (PR C). */
      payUrl: string;
      expiresAt: string;
      firstChargeCents: number;
      recurringCents: number | null;
      /**
       * false als het profiel geen e-mailadres had (link blijft bruikbaar).
       * sendEmail zelf logt-en-slikt verzendfouten, die zie je in de logs.
       */
      emailSent: boolean;
    }
  | { ok: false; error: string };

// Vertaalt admin_create_order()'s {ok:false, reason} naar admin-taal.
const REASON_COPY: Record<string, string> = {
  profile_not_found: "Dit profiel bestaat niet.",
  existing_membership: "Dit lid heeft al een actief abonnement.",
  existing_open_order:
    "Er staat al een open abonnements-order voor dit lid. Rond die af of laat hem verlopen.",
  catalogue_row_not_found: "Dit item staat niet (meer) in de catalogus.",
  not_purchasable: "Dit item is niet direct verkoopbaar.",
  invalid_kind: "Dit item is niet als order te verkopen.",
  em_and_24m_exclusive:
    "Early Member en de 24-maanden-korting zijn niet te combineren.",
  commit_24m_not_offered:
    "24 maanden commitment is niet beschikbaar op dit abonnement.",
  extended_access_not_available:
    "Verlengde toegang is niet beschikbaar op dit abonnement.",
  invalid_product_options: "Deze opties zijn niet geldig voor dit product.",
  product_not_supported: "Dit product is niet via een order te verkopen.",
};

/**
 * WS-5 PR A: maakt via het ongewijzigde tmc.admin_create_order een order
 * plus token aan, bouwt daar de betaallink van, en mailt die naar de klant.
 * De klant betaalt altijd zelf via de link (SEPA-mandaat blijft bij de
 * klant); Marlon voltooit nooit een betaling.
 *
 * Dubbele gate, zelfde laagdeling als de RPC zelf documenteert:
 * requireAdmin() hier in TS, tmc.is_admin() in de RPC.
 */
export async function createPaymentRequest(
  input: CreatePaymentRequestInput,
): Promise<CreatePaymentRequestResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.message };

  try {
    // De RPC draait als de ingelogde admin: tmc.is_admin() leest auth.uid().
    const supabase = await createClient();
    const { data: result, error: rpcError } = await supabase.rpc(
      "admin_create_order",
      {
        p_profile_id: input.profileId,
        p_slug: input.slug,
        p_extended_access: input.extendedAccess ?? false,
        p_commit_24m: input.commit24m ?? false,
        // Early Member is bewust geen knop hier (buiten PR A-scope).
        p_early_member: false,
        p_waive_signup_fee: input.waiveSignupFee ?? false,
        p_expires_in_days: input.expiresInDays ?? 7,
      },
    );
    if (rpcError) {
      console.error("[createPaymentRequest] admin_create_order rpc", rpcError);
      return { ok: false, error: "Kon de order niet aanmaken." };
    }
    if (!result?.ok) {
      return {
        ok: false,
        error: REASON_COPY[result?.reason] ?? "Kon de order niet aanmaken.",
      };
    }

    const orderId = result.order_id as string;
    const token = result.token as string;
    const firstChargeCents = result.first_charge_cents as number;
    const recurringCents = (result.recurring_cents ?? null) as number | null;
    const expiresAt = result.expires_at as string;
    const payUrl = `${siteUrl()}/betaal/${token}`;

    await emitEvent({
      type: "order.created",
      actorType: "admin",
      actorId: gate.userId,
      subjectType: "order",
      subjectId: orderId,
      payload: {
        profile_id: input.profileId,
        order_id: orderId,
        slug: input.slug,
        first_charge_cents: firstChargeCents,
        created_via: "payment_link",
      },
    });

    // Klantgegevens en catalogusnaam voor de mail; service-role omdat dit
    // buiten de sessie van de admin om alleen-lezen data is.
    const admin = createAdminClient();
    const [{ data: profile }, { data: item }] = await Promise.all([
      admin
        .from("profiles")
        .select("first_name, email")
        .eq("id", input.profileId)
        .maybeSingle(),
      admin
        .from("catalogue")
        .select("display_name")
        .eq("slug", input.slug)
        .maybeSingle(),
    ]);

    let emailSent = false;
    if (profile?.email) {
      const expiresAtLabel = new Intl.DateTimeFormat("nl-NL", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(expiresAt));
      // sendEmail logt-en-slikt fouten zelf; de link blijft altijd bruikbaar.
      await sendEmail({
        to: profile.email,
        toName: profile.first_name ?? undefined,
        subject: "Je betaalverzoek van The Movement Club", // COPY: confirm met Marlon
        react: PaymentRequest({
          firstName: profile.first_name ?? "",
          itemLabel: item?.display_name ?? input.slug,
          amountEuro: formatEuro(Math.round(firstChargeCents / 100)),
          recurringEuro:
            recurringCents !== null
              ? formatEuro(Math.round(recurringCents / 100))
              : null,
          payUrl,
          expiresAtLabel,
        }),
      });
      emailSent = true;
    } else {
      console.error(
        "[createPaymentRequest] profiel zonder e-mail, geen mail verstuurd",
        input.profileId,
      );
    }

    return {
      ok: true,
      orderId,
      payUrl,
      expiresAt,
      firstChargeCents,
      recurringCents,
      emailSent,
    };
  } catch (e) {
    console.error("[createPaymentRequest]", e);
    return { ok: false, error: "Er ging iets mis. Probeer opnieuw." };
  }
}
