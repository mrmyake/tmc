import type { Metadata } from "next";
import { HuisregelsContent } from "./HuisregelsContent";

export const metadata: Metadata = {
  title: "Huisregels",
  description:
    "De studio is klein en dat is precies de bedoeling. Onze huisregels zorgen ervoor dat het voor iedereen prettig blijft.",
  alternates: { canonical: "/huisregels" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Huisregels | The Movement Club",
    description:
      "De studio is klein en dat is precies de bedoeling. Onze huisregels zorgen ervoor dat het voor iedereen prettig blijft.",
  },
};

export default function HuisregelsPage() {
  return <HuisregelsContent />;
}
