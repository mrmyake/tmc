import type { Metadata } from "next";
import { getCatalogue, type CatalogueRow } from "@/lib/catalogue";
import { BetaalverzoekWizard } from "./_components/BetaalverzoekWizard";
import { FAMILIES, FREQUENCIES, PRODUCT_SLUGS, planSlug } from "./lib";

export const metadata: Metadata = {
  title: "Admin · Betaalverzoeken | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Zelfde opzet als /abonnement en /app/producten: geen eigen revalidate
// nodig, de catalogus-fetch zelf is los getagd + gecached
// (src/lib/catalogue.ts).
export default async function BetaalverzoekenPage() {
  const catalogue = await getCatalogue();

  const plans: Record<string, CatalogueRow> = {};
  for (const family of FAMILIES) {
    for (const frequency of FREQUENCIES) {
      const slug = planSlug(family, frequency);
      const row = catalogue.get(slug);
      if (row && row.purchasable) plans[slug] = row;
    }
  }

  const products: Record<string, CatalogueRow> = {};
  for (const slug of PRODUCT_SLUGS) {
    const row = catalogue.get(slug);
    if (row && row.purchasable) products[slug] = row;
  }

  const extendedAccessAddon = catalogue.get("extended_access") ?? null;
  const signupFee = catalogue.get("signup_fee") ?? null;

  return (
    <BetaalverzoekWizard
      plans={plans}
      products={products}
      extendedAccessAddon={extendedAccessAddon}
      signupFee={signupFee}
    />
  );
}
