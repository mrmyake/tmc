import type { Metadata } from "next";
import { getCatalogue, type CatalogueRow } from "@/lib/catalogue";
import { getCampaignWindow, isEarlyMemberActive } from "@/lib/campaign";
import { createClient } from "@/lib/supabase/server";
import { AbonnementConfigurator } from "./AbonnementConfigurator";
import { FAMILIES, FREQUENCIES, planSlug } from "./lib";

export const metadata: Metadata = {
  title: "Kies je abonnement | The Movement Club",
  description:
    "Stel je abonnement samen: Groepslessen, Vrij Trainen of All Access, in het tempo dat bij je past.",
  alternates: { canonical: "/abonnement" },
};

interface AbonnementPageProps {
  searchParams: Promise<{ devEm?: string }>;
}

// Geen eigen revalidate nodig: de root layout zet al revalidate = 60
// site-breed, en de catalogus-fetch zelf is los getagd + 1u gecached
// (src/lib/catalogue.ts), zelfde opzet als /prijzen.
export default async function AbonnementPage({
  searchParams,
}: AbonnementPageProps) {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    catalogue,
    campaignWindow,
    { devEm },
  ] = await Promise.all([
    supabase.auth.getUser(),
    getCatalogue(),
    getCampaignWindow(),
    searchParams,
  ]);

  // Render-only devEm-override voor het handmatig verifiëren van de EM-actie
  // (?devEm=true|false). Nooit een productie-pad: NODE_ENV is "production"
  // op elke Vercel-build, preview zowel als productie, dus deze tak is dood
  // zodra dit gedeployed is — alleen `next dev` lokaal kan hem raken.
  // campaign.ts en de echte gate blijven ongemoeid; dit overschrijft alleen
  // de emActive-prop die naar de configurator gaat. _compute_order_price
  // heeft sinds fix/campagne-fasering geen ondergrens meer, dus een
  // geforceerde devEm=true kan hooguit betekenen dat create_order de
  // reguliere prijs teruggeeft als closes_at intussen al is verstreken,
  // nooit een te vroege EM-order.
  const realEmActive = isEarlyMemberActive(campaignWindow);
  const emActive =
    process.env.NODE_ENV !== "production" && (devEm === "true" || devEm === "false")
      ? devEm === "true"
      : realEmActive;

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
