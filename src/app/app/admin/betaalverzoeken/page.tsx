import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/require-admin";
import { getCustomerProfileById, isUuid } from "@/lib/admin/customer-query";
import { getCatalogue, type CatalogueRow } from "@/lib/catalogue";
import { BetaalverzoekWizard } from "./_components/BetaalverzoekWizard";
import { BetaalverzoekTabs, type BetaalverzoekTab } from "./_components/BetaalverzoekTabs";
import { OverzichtPanel } from "./_components/overzicht/OverzichtPanel";
import { FAMILIES, FREQUENCIES, PRODUCT_SLUGS, planSlug } from "./lib";

export const metadata: Metadata = {
  title: "Admin · Betaalverzoeken | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function parseTab(value: string | undefined): BetaalverzoekTab {
  return value === "overzicht" ? "overzicht" : "nieuw";
}

// Zelfde opzet als /abonnement en /app/producten: geen eigen revalidate
// nodig, de catalogus-fetch zelf is los getagd + gecached
// (src/lib/catalogue.ts). Tabs zijn een URL-param (?tab=), zelfde patroon
// als /app/producten (?tab=kopen|tegoed) — de wizard hieronder is
// ongewijzigd, alleen de Tabs-balk staat ernaast.
export default async function BetaalverzoekenPage(props: {
  searchParams: Promise<{ tab?: string; group?: string; klant?: string }>;
}) {
  const searchParams = await props.searchParams;
  const tab = parseTab(searchParams.tab);

  if (tab === "overzicht") {
    return (
      <>
        <div className="px-6 md:px-10 lg:px-12 pt-6">
          <BetaalverzoekTabs active={tab} />
        </div>
        <OverzichtPanel groupParam={searchParams.group} />
      </>
    );
  }

  // ?klant=<profile_id>: klant voorgeselecteerd, wizard start bij Product.
  // Alleen een geldige UUID van een bestaand profiel telt; anders gewoon
  // starten bij stap Klant. De layout houdt non-admins al buiten, de gate
  // hier is nodig omdat de lookup via de service-role-client loopt.
  let initialCustomer = null;
  if (isUuid(searchParams.klant)) {
    const gate = await requireAdmin();
    if (gate.ok) initialCustomer = await getCustomerProfileById(searchParams.klant);
  }

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
    <>
      <div className="px-6 md:px-10 lg:px-12 pt-6">
        <BetaalverzoekTabs active={tab} />
      </div>
      <BetaalverzoekWizard
        initialCustomer={initialCustomer}
        plans={plans}
        products={products}
        extendedAccessAddon={extendedAccessAddon}
        signupFee={signupFee}
      />
    </>
  );
}
