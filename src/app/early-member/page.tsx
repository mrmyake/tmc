import type { Metadata } from "next";
import { getPublicClient } from "@/lib/supabase";
import { EarlyMemberContent, type PoolAvailability } from "./EarlyMemberContent";

// ISR: de "nog X van 40"-teller mag maximaal een minuut achterlopen.
export const revalidate = 60;

// COPY: concept — alle teksten op deze pagina bevestigen met Marlon.
export const metadata: Metadata = {
  title: "Early Member | The Movement Club Loosdrecht",
  description:
    "De studio opent 1 augustus. De eerste 40 leden per membership starten als Early Member — met voorwaarden die daarna niet meer terugkomen.",
  alternates: { canonical: "/early-member" },
  openGraph: {
    title: "Early Member | The Movement Club Loosdrecht",
    description:
      "De studio opent 1 augustus. De eerste 40 leden per membership starten als Early Member — met voorwaarden die daarna niet meer terugkomen.",
  },
};

async function getAvailability(): Promise<PoolAvailability[] | null> {
  const supabase = getPublicClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_early_member_availability");
  if (error || !data) {
    if (error) console.error("[early-member] availability fetch failed:", error);
    return null;
  }
  return data as PoolAvailability[];
}

export default async function EarlyMemberPage() {
  const availability = await getAvailability();
  return <EarlyMemberContent availability={availability} />;
}
