import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTrialSessionOptions } from "@/lib/trial-sessions";
import { isOpeningTrialActive } from "@/lib/opening-trial/period";
import { TrialBookingList } from "./TrialBookingList";

export const metadata: Metadata = {
  title: "Boek direct een Proefles | The Movement Club",
  description:
    "Kies zelf een sessie en boek direct een proefles bij The Movement Club in Loosdrecht.",
  alternates: { canonical: "/proefles/boeken" },
};

export const dynamic = "force-dynamic";

export default async function TrialBookingPage() {
  // Tijdens de gratis openingsperiode is de betaalde route niet aan de orde:
  // wie hier via een oude link belandt, gaat naar de gratis flow. Na de
  // einddatum werkt deze pagina weer gewoon. /proefles/code blijft altijd.
  if (await isOpeningTrialActive()) redirect("/proefles/gratis");

  const options = await getTrialSessionOptions({ withPrices: true });
  return <TrialBookingList options={options} mode="paid" />;
}
