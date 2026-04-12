import type { Metadata } from "next";
import { OverContent } from "./OverContent";
import { getSiteImages } from "../../../sanity/lib/fetch";

export const metadata: Metadata = {
  title: "Over The Movement Club | Onze Filosofie & Trainer Marlon",
  description:
    "Ontdek het verhaal achter The Movement Club. Persoonlijke begeleiding door trainer Marlon in een luxe, besloten studio.",
  alternates: { canonical: "/over" },
  openGraph: {
    title: "Over The Movement Club | Onze Filosofie & Trainer Marlon",
    description:
      "Ontdek het verhaal achter The Movement Club. Persoonlijke begeleiding door trainer Marlon in een luxe, besloten studio.",
  },
};

export default async function OverPage() {
  const images = await getSiteImages();
  return (
    <OverContent
      marlonImage={images.overMarlon}
      hormoonprofielImage={images.hormoonprofiel}
      gallery={images.gallery}
    />
  );
}
