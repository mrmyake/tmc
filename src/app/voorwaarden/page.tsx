import type { Metadata } from "next";
import { VoorwaardenContent } from "./VoorwaardenContent";

export const metadata: Metadata = {
  title: "Algemene voorwaarden",
  description:
    "Deze voorwaarden gelden voor iedereen die traint bij The Movement Club.",
  alternates: { canonical: "/voorwaarden" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Algemene voorwaarden | The Movement Club",
    description:
      "Deze voorwaarden gelden voor iedereen die traint bij The Movement Club.",
  },
};

export default function VoorwaardenPage() {
  return <VoorwaardenContent />;
}
