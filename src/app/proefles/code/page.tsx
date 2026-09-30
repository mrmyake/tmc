import type { Metadata } from "next";
import { getTrialSessionOptions } from "@/lib/trial-sessions";
import { readTrialCodeCookie } from "@/lib/trial-codes/server";
import { lookupUsableTrialCodeScope } from "@/lib/trial-codes/lookup";
import { loadVisitorSlotPicker } from "@/lib/trial-codes/vrij-trainen-query";
import { CodeFlow } from "./CodeFlow";

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
 * zonder prijzen; bij scope vrij trainen de slotkiezer. Het cookie bewijst alleen een recente geldige codecheck
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

  const code = await readTrialCodeCookie();
  const scope = code ? await lookupUsableTrialCodeScope(code) : null;
  // Vrij trainen heeft geen sessielijst maar een slotkiezer (dagstrip en
  // kwartierraster); alle andere scopes tonen de gefilterde sessielijst.
  const options =
    scope && scope !== "vrij_trainen"
      ? await getTrialSessionOptions({ withPrices: false, scope })
      : [];
  const slotData = scope === "vrij_trainen" ? await loadVisitorSlotPicker(dag) : null;
  return (
    <CodeFlow options={options} slotData={slotData} code={scope ? code : null} scope={scope} />
  );
}
