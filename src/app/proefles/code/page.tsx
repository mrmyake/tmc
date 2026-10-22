import type { Metadata } from "next";
import { getTrialSessionOptions } from "@/lib/trial-sessions";
import { readTrialCodeCookie } from "@/lib/trial-codes/server";
import { lookupUsableTrialCodeScope } from "@/lib/trial-codes/lookup";
import { loadVisitorSlotPicker } from "@/lib/trial-codes/vrij-trainen-query";
import { resolveAttribution } from "@/lib/attribution/params";
import { CodeFlow, type CodeSoort } from "./CodeFlow";

export const metadata: Metadata = {
  title: "Proefles met proefcode | The Movement Club",
  description:
    "Heb je een proefcode gekregen? Vul die in en boek gratis je proefles bij The Movement Club in Loosdrecht.",
  alternates: { canonical: "/proefles/code" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Codeflow (spec-community-growth.md §1 "Proefcodes"). De sessielijst is
 * dezelfde als in de betaalde flow, beperkt tot de scope van de code en
 * zonder prijzen; bij scope vrij trainen de slotkiezer. Bij scope all kiest
 * de bezoeker eerst zelf (groepsles of vrij trainen) en houdt ?soort=les|vrij
 * die keuze vast, zoals op /proefles/gratis; zonder of met een onbekende
 * soort toont de pagina de keuzestap. Bij elke andere scope wordt soort
 * genegeerd. Het cookie bewijst alleen een recente geldige codecheck
 * en bevat de scope niet: die zoeken we hier bij elke render opnieuw op in
 * de database. De betaling wordt uitsluitend bij het boeken overgeslagen,
 * door tmc.redeem_trial_code, dat de scope opnieuw controleert.
 */
export default async function TrialCodePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const dagRaw = sp.dag;
  const dag = Array.isArray(dagRaw) ? dagRaw[0] : dagRaw;
  // Advertentie- en campagneparameters uit de URL (spec-marketing-attribution.md);
  // de codestap ververst dezelfde URL, dus ze blijven staan tot de boeking.
  const attribution = resolveAttribution(sp, "/proefles/code");

  const code = await readTrialCodeCookie();
  const scope = code ? await lookupUsableTrialCodeScope(code) : null;
  const soortRaw = Array.isArray(sp.soort) ? sp.soort[0] : sp.soort;
  const soort: CodeSoort | null =
    scope === "all" ? (soortRaw === "les" || soortRaw === "vrij" ? soortRaw : null) : null;
  // Vrij trainen heeft geen sessielijst maar een slotkiezer (dagstrip en
  // kwartierraster); alle andere scopes tonen de gefilterde sessielijst.
  // Bij all bepaalt de keuze van de bezoeker welke van de twee we laden.
  const showList = scope !== null && scope !== "vrij_trainen" && (scope !== "all" || soort === "les");
  const showSlots = scope === "vrij_trainen" || (scope === "all" && soort === "vrij");
  const [options, slotData] = await Promise.all([
    showList && scope ? getTrialSessionOptions({ withPrices: false, scope }) : Promise.resolve([]),
    showSlots ? loadVisitorSlotPicker(dag) : Promise.resolve(null),
  ]);
  return (
    <CodeFlow
      options={options}
      slotData={slotData}
      code={scope ? code : null}
      scope={scope}
      soort={soort}
      attribution={attribution}
    />
  );
}
