import type { Metadata } from "next";
import { OnbegeleideToegangContent } from "./OnbegeleideToegangContent";

export const metadata: Metadata = {
  title: "Voorwaarden onbegeleide toegang",
  description:
    "Met onbegeleide toegang kun je in de studio trainen op momenten dat er geen trainer aanwezig is. Dit zijn de afspraken die daarbij horen.",
  alternates: { canonical: "/onbegeleide-toegang" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Voorwaarden onbegeleide toegang | The Movement Club",
    description:
      "Met onbegeleide toegang kun je in de studio trainen op momenten dat er geen trainer aanwezig is. Dit zijn de afspraken die daarbij horen.",
  },
};

export default function OnbegeleideToegangPage() {
  return <OnbegeleideToegangContent />;
}
