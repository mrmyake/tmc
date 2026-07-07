import type { Metadata } from "next";
import { PrijzenContent } from "./PrijzenContent";

export const metadata: Metadata = {
  title: "Prijzen | The Movement Club Loosdrecht",
  description:
    "Alle tarieven op een rij: lidmaatschappen, personal training, programma's en losse bezoeken.",
  alternates: { canonical: "/prijzen" },
  openGraph: {
    title: "Prijzen | The Movement Club Loosdrecht",
    description:
      "Alle tarieven op een rij: lidmaatschappen, personal training, programma's en losse bezoeken.",
  },
};

export default function PrijzenPage() {
  return <PrijzenContent />;
}
