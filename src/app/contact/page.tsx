import type { Metadata } from "next";
import { ContactContent } from "./ContactContent";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Neem contact op met The Movement Club. Industrieweg 14P, Loosdrecht. Boek een proefles of stel je vraag.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact | The Movement Club Loosdrecht",
    description:
      "Neem contact op met The Movement Club. Industrieweg 14P, Loosdrecht. Boek een proefles of stel je vraag.",
  },
};

export default function ContactPage() {
  return <ContactContent />;
}
