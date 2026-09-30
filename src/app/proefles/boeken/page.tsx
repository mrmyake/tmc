import type { Metadata } from "next";
import { getTrialSessionOptions } from "@/lib/trial-sessions";
import { TrialBookingList } from "./TrialBookingList";

export const metadata: Metadata = {
  title: "Boek direct een Proefles | The Movement Club",
  description:
    "Kies zelf een sessie en boek direct een proefles bij The Movement Club in Loosdrecht.",
  alternates: { canonical: "/proefles/boeken" },
};

export const dynamic = "force-dynamic";

export default async function TrialBookingPage() {
  const options = await getTrialSessionOptions({ withPrices: true });
  return <TrialBookingList options={options} mode="paid" />;
}
