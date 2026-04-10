import type { Metadata } from "next";
import { ProeflesContent } from "./ProeflesContent";

export const metadata: Metadata = {
  title: "Boek een Proefles | Gratis & Vrijblijvend",
  description:
    "Boek een gratis proefles bij The Movement Club in Loosdrecht. Ervaar onze boutique studio en persoonlijke aanpak. Vrijblijvend en zonder verplichtingen.",
  alternates: { canonical: "/proefles" },
  openGraph: {
    title: "Boek een Proefles | Gratis & Vrijblijvend | The Movement Club",
    description:
      "Boek een gratis proefles bij The Movement Club in Loosdrecht. Ervaar onze boutique studio en persoonlijke aanpak.",
  },
};

export default function ProeflesPage() {
  return <ProeflesContent />;
}
