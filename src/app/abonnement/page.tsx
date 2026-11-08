import type { Metadata } from "next";
import { getCatalogue, type CatalogueRow } from "@/lib/catalogue";
import { getCancellationNoticeDays } from "@/lib/cancellation-notice";
import {
  clientCheckoutIdentity,
  profileCompleteForCheckout,
} from "@/lib/checkout/profile-complete";
import { AbonnementConfigurator } from "./AbonnementConfigurator";
import { FAMILIES, FREQUENCIES, planSlug } from "./lib";

export const metadata: Metadata = {
  title: "Kies je abonnement | The Movement Club",
  description:
    "Stel je abonnement samen: Groepslessen, Vrij Trainen of All Access, in het tempo dat bij je past.",
  alternates: { canonical: "/abonnement" },
};

// Geen eigen revalidate nodig: de root layout zet al revalidate = 60
// site-breed, en de catalogus-fetch zelf is los getagd + 1u gecached
// (src/lib/catalogue.ts), zelfde opzet als /prijzen.
//
// Geen campagnefase meer: de Early Member-actie is gesloten
// (fix/end-early-member-campaign, closes_at 2026-11-01). De configurator
// rekent uitsluitend met reguliere catalogusprijzen; server-side blijft
// tmc._compute_order_price de enige prijsbron en die weigert EM zelf op
// basis van tmc.early_member_pools.closes_at.
export default async function AbonnementPage() {
  // Ingelogd met een compleet profiel slaat stap 2 over; ingelogd met een
  // onvolledig profiel ziet stap 2 voorgevuld; anoniem ziet de OTP-stap.
  const [identity, catalogue] = await Promise.all([
    profileCompleteForCheckout(),
    getCatalogue(),
  ]);

  const plans: Record<string, CatalogueRow> = {};
  for (const family of FAMILIES) {
    for (const frequency of FREQUENCIES) {
      const slug = planSlug(family, frequency);
      const row = catalogue.get(slug);
      if (row && row.purchasable) plans[slug] = row;
    }
  }

  const extendedAccessAddon = catalogue.get("extended_access") ?? null;
  const signupFee = catalogue.get("signup_fee") ?? null;
  // Opzegtermijn uit dezelfde bron als request_membership_cancellation, voor
  // de bevestigingsstap (PayStage).
  const cancellationNoticeDays = await getCancellationNoticeDays();

  return (
    <AbonnementConfigurator
      plans={plans}
      extendedAccessAddon={extendedAccessAddon}
      signupFee={signupFee}
      identity={clientCheckoutIdentity(identity)}
      cancellationNoticeDays={cancellationNoticeDays}
    />
  );
}
