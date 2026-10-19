import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { sendPushToProfile } from "@/lib/push";
import PaymentFailed from "@/emails/payment_failed";
import { formatEuro } from "@/lib/format";
import { siteUrl } from "@/lib/site-url";

/**
 * Mail plus push naar het lid bij een mislukte of gestorneerde incasso.
 * Gedeeld door de Mollie-webhook (status failed/expired/canceled op een
 * recurring betaling) en de chargeback-spiegel (src/lib/chargebacks/).
 * Fire-and-forget: throwt nooit.
 */
export async function notifyMemberPaymentFailed(args: {
  profileId: string;
  amountCents: number;
  planLabel: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("first_name, email")
      .eq("id", args.profileId)
      .maybeSingle();
    if (!profile?.email) return;
    await sendEmail({
      to: profile.email,
      toName: profile.first_name ?? undefined,
      subject: "Incasso niet gelukt",
      react: PaymentFailed({
        firstName: profile.first_name ?? "",
        amountEuro: formatEuro(Math.round(args.amountCents / 100)),
        planLabel: args.planLabel,
        siteUrl: siteUrl(),
      }),
    });

    // Los kanaal naast de e-mail: geldzaken verdienen een directe melding
    // in plaats van te wachten tot iemand zijn mail checkt.
    void sendPushToProfile(args.profileId, {
      title: "Incasso niet gelukt",
      body: `${formatEuro(Math.round(args.amountCents / 100))} voor ${args.planLabel} kon niet worden afgeschreven.`,
      data: { type: "payment_failed" },
    });
  } catch (err) {
    console.error("[notifyMemberPaymentFailed] skipped", err);
  }
}
