import type { Metadata } from "next";
import { getCatalogue, type CatalogueRow } from "@/lib/catalogue";
import { getCampaignDeadline, getCampaignPhase } from "@/lib/campaign";
import { createClient } from "@/lib/supabase/server";
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
export default async function AbonnementPage() {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    catalogue,
    campaignDeadlineIso,
  ] = await Promise.all([
    supabase.auth.getUser(),
    getCatalogue(),
    getCampaignDeadline(),
  ]);

  const emActive =
    getCampaignPhase(new Date(campaignDeadlineIso)) === "open-em";

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

  return (
    <AbonnementConfigurator
      plans={plans}
      extendedAccessAddon={extendedAccessAddon}
      signupFee={signupFee}
      emActive={emActive}
      loggedIn={Boolean(user)}
    />
  );
}
