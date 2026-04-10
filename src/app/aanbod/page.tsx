import type { Metadata } from "next";
import { AanbodContent } from "./AanbodContent";

export const metadata: Metadata = {
  title: "Trainingsaanbod | Personal Training & Small Group",
  description:
    "Van personal training tot mobility sessions. Ontdek ons aanbod en vind de training die bij jou past.",
  alternates: { canonical: "/aanbod" },
  openGraph: {
    title: "Trainingsaanbod | Personal Training & Small Group | The Movement Club",
    description:
      "Van personal training tot mobility sessions. Ontdek ons aanbod en vind de training die bij jou past.",
  },
};

export default function AanbodPage() {
  return <AanbodContent />;
}
