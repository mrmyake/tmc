"use server";

import { requireAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { formatEuro } from "@/lib/crowdfunding-helpers";
import PaymentRequest from "@/emails/payment_request";

export type ResendPaymentRequestResult =
  | { ok: true; emailSent: boolean; payUrl: string }
  | { ok: false; error: string };

// COPY: confirm met Marlon
const REASON_COPY: Record<string, string> = {
  not_found: "Dit betaalverzoek bestaat niet (meer).",
  not_admin_request: "Dit is geen door jou aangemaakt betaalverzoek.",
  not_open: "Dit verzoek staat niet meer open; opnieuw versturen kan niet.",
  expired: "Deze link is verlopen. Maak een nieuw betaalverzoek via de wizard.",
  no_email: "Dit profiel heeft geen e-mailadres. Kopieer de link en deel hem zelf.",
};

/**
 * Stuurt de bestaande betaallink-mail opnieuw naar hetzelfde profiel-adres
 * (discovery-ws5-betaalverzoek-overzicht.md §4). HARDE EIS: nul writes op
 * tmc.orders of enige andere tabel. Het bestaande token en de bestaande
 * expires_at worden hergebruikt; er wordt geen nieuwe order gemint en geen
 * status/kolom aangeraakt. Dit is uitsluitend lezen plus een e-mail — zelfde
 * template en zelfde adresbron (profiles.email) als createPaymentRequest
 * (payment-request-actions.ts), maar zonder de order-insert.
 *
 * Ander-adres-resend en annuleren horen NIET hier: die zitten in de
 * vervolg-PR (Fable, PR B-veiligheid resp. race-guard).
 */
export async function resendPaymentRequest(
  orderId: string,
): Promise<ResendPaymentRequestResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.message };

  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("orders")
    .select(
      "id, profile_id, catalogue_slug, created_by, status, expires_at, first_charge_cents, recurring_cents, token",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) {
    return { ok: false, error: REASON_COPY.not_found };
  }
  if (order.created_by !== "admin") {
    return { ok: false, error: REASON_COPY.not_admin_request };
  }
  if (order.status !== "draft" && order.status !== "pending") {
    return { ok: false, error: REASON_COPY.not_open };
  }
  if (new Date(order.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: REASON_COPY.expired };
  }

  const [{ data: profile }, { data: item }] = await Promise.all([
    admin
      .from("profiles")
      .select("first_name, email")
      .eq("id", order.profile_id)
      .maybeSingle(),
    admin
      .from("catalogue")
      .select("display_name")
      .eq("slug", order.catalogue_slug)
      .maybeSingle(),
  ]);

  const payUrl = `${siteUrl()}/betaal/${order.token}`;

  if (!profile?.email) {
    return { ok: false, error: REASON_COPY.no_email };
  }

  const expiresAtLabel = new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(order.expires_at));

  await sendEmail({
    to: profile.email,
    toName: profile.first_name ?? undefined,
    subject: "Je betaalverzoek van The Movement Club", // COPY: confirm met Marlon
    react: PaymentRequest({
      firstName: profile.first_name ?? "",
      itemLabel: item?.display_name ?? order.catalogue_slug,
      amountEuro: formatEuro(Math.round(order.first_charge_cents / 100)),
      recurringEuro:
        order.recurring_cents != null
          ? formatEuro(Math.round(order.recurring_cents / 100))
          : null,
      payUrl,
      expiresAtLabel,
    }),
  });

  return { ok: true, emailSent: true, payUrl };
}
