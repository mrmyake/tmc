import type { Metadata } from "next";
import { PrivacybeleidContent } from "./PrivacybeleidContent";

export const metadata: Metadata = {
  title: "Privacyverklaring",
  description:
    "Hoe The Movement Club omgaat met jouw persoonsgegevens — op de website, in de member-app en in de studio.",
  alternates: { canonical: "/privacybeleid" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Privacyverklaring | The Movement Club",
    description:
      "Hoe The Movement Club omgaat met jouw persoonsgegevens — op de website, in de member-app en in de studio.",
  },
};

export default function PrivacybeleidPage() {
  return <PrivacybeleidContent />;
}
