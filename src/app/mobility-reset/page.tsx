import type { Metadata } from "next";
import { MobilityResetContent } from "./MobilityResetContent";
import { getSiteImages } from "../../../sanity/lib/fetch";

export const metadata: Metadata = {
  title: "7 Dagen Mobility Reset | Gratis Video Serie",
  description:
    "Elke dag een korte video van trainer Marlon. Beweeg beter in een week. Gratis en vrijblijvend.",
  alternates: { canonical: "/mobility-reset" },
};

export default async function MobilityResetPage() {
  const images = await getSiteImages();
  return <MobilityResetContent thumb={images.mobilityResetThumb} />;
}
