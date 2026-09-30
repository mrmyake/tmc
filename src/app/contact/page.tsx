import type { Metadata } from "next";
import { ContactContent } from "./ContactContent";
import { getTrainerPresenceWindows } from "@/lib/trainer-presence";

// De aanwezigheid van Marlon komt uit de database; ISR houdt hem vers.
export const revalidate = 300;

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

export default async function ContactPage() {
  const presence = await getTrainerPresenceWindows();
  return <ContactContent presence={presence} />;
}
