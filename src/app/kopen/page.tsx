import type { Metadata } from "next";
import { getCatalogue, type CatalogueRow } from "@/lib/catalogue";
import { PRODUCT_SLUGS } from "@/lib/product-groups";
import {
  clientCheckoutIdentity,
  profileCompleteForCheckout,
} from "@/lib/checkout/profile-complete";
import { KopenCheckout } from "./KopenCheckout";

export const metadata: Metadata = {
  title: "Koop een rittenkaart of PT-pakket | The Movement Club",
  description:
    "Koop direct een 10-rittenkaart voor groepslessen of een personal-training-pakket, zonder abonnement.",
  alternates: { canonical: "/kopen" },
};

/**
 * Publieke productcheckout: rittenkaart en PT-/Duo-pakketten zonder
 * abonnement. Niet auth-gated. Drie stappen, zelfde patroon als
 * /abonnement (kies, identificeer, betaal), maar zonder families of
 * frequenties: de vijf slugs uit PRODUCT_SLUGS, prijzen live uit
 * tmc.catalogue, nooit client-side berekend. De identificatiestap is de
 * signup; wie al ingelogd is met een compleet profiel slaat die over, wie
 * ingelogd is met een onvolledig profiel ziet alleen de gegevens.
 *
 * Geen eigen revalidate: auth.getUser() maakt deze route sowieso
 * dynamisch, en de catalogus-fetch is los getagd + 1u gecached, zelfde
 * opzet als /abonnement.
 */
export default async function KopenPage() {
  const [identity, catalogue] = await Promise.all([
    profileCompleteForCheckout(),
    getCatalogue(),
  ]);

  const products: Record<string, CatalogueRow> = {};
  for (const slug of PRODUCT_SLUGS) {
    // getCatalogue() filtert al op is_active; purchasable blijft de
    // tweede poort, net als op /app/producten.
    const row = catalogue.get(slug);
    if (row && row.purchasable) products[slug] = row;
  }

  return (
    <KopenCheckout
      products={products}
      identity={clientCheckoutIdentity(identity)}
    />
  );
}
