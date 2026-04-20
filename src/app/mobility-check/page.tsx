import type { Metadata } from "next";
import { MobilityCheckContent } from "./MobilityCheckContent";

export const metadata: Metadata = {
  title: "Gratis Mobility Check | 20 Minuten Screening met Marlon",
  description:
    "Ontdek hoe je beweegt. Gratis 20-minuten mobility screening met trainer Marlon in onze studio in Loosdrecht.",
  alternates: { canonical: "/mobility-check" },
};

export default function MobilityCheckPage() {
  return <MobilityCheckContent />;
}
