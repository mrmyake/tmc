import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOpeningTrialPeriod } from "@/lib/opening-trial/period";
import { isOpeningPeriodActive } from "@/lib/opening-trial/rules";
import {
  getOpeningTrialSessionOptions,
  loadOpeningSlotPicker,
} from "@/lib/opening-trial/sessions";
import { OpeningTrialFlow } from "./OpeningTrialFlow";

export const metadata: Metadata = {
  title: "Gratis proefles in onze openingsperiode | The Movement Club",
  description:
    "Boek een gratis proefles bij The Movement Club in Loosdrecht: een groepsles of een uur vrij trainen, zolang onze openingsperiode loopt.",
  alternates: { canonical: "/proefles/gratis" },
};

export const dynamic = "force-dynamic";

/**
 * Gratis proefles in de openingsperiode (spec-community-growth.md par. 1
 * "Gratis openingsperiode"). Datumgestuurd: buiten de periode uit
 * tmc.booking_settings stuurt deze pagina terug naar /proefles (dat dan weer
 * de drie gewone kaarten toont). Twee takken via ?soort=: groepsles (de
 * sessielijst van de betaalde flow zonder prijzen, beperkt tot lessen met een
 * gratis plek) en vrij trainen (de bezoekersslotkiezer van de codeflow met
 * het openingsquotum in de beschikbaarheid). Alles is weergave; de RPC
 * tmc.book_opening_trial beslist bij het boeken.
 */
export default async function OpeningTrialPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const period = await getOpeningTrialPeriod();
  if (!isOpeningPeriodActive(period)) redirect("/proefles");

  const sp = await props.searchParams;
  const soortRaw = Array.isArray(sp.soort) ? sp.soort[0] : sp.soort;
  const soort = soortRaw === "vrij" ? "vrij" : "les";
  const dagRaw = Array.isArray(sp.dag) ? sp.dag[0] : sp.dag;

  const [options, slotData] = await Promise.all([
    soort === "les" ? getOpeningTrialSessionOptions() : Promise.resolve([]),
    soort === "vrij" ? loadOpeningSlotPicker(dagRaw) : Promise.resolve(null),
  ]);

  return (
    <OpeningTrialFlow
      soort={soort}
      options={options}
      slotData={slotData}
      periodEndAt={period?.endAt ?? null}
    />
  );
}
