import type { Metadata } from "next";
import { MobilityResetContent } from "./MobilityResetContent";

export const metadata: Metadata = {
  title: "7 Dagen Mobility Reset | Gratis Video Serie",
  description:
    "Elke dag een korte video van trainer Marlon. Beweeg beter in een week. Gratis en vrijblijvend.",
  alternates: { canonical: "/mobility-reset" },
};

export default function MobilityResetPage() {
  return <MobilityResetContent />;
}
