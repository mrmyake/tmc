import type { Metadata } from "next";
import { getTrialSessionOptions } from "@/lib/trial-sessions";
import { readTrialCodeCookie } from "@/lib/trial-codes/server";
import { lookupUsableTrialCodeScope } from "@/lib/trial-codes/lookup";
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
 * zonder prijzen. Het cookie bewijst alleen een recente geldige codecheck
 * en bevat de scope niet: die zoeken we hier bij elke render opnieuw op in
 * de database. De betaling wordt uitsluitend bij het boeken overgeslagen,
 * door tmc.redeem_trial_code, dat de scope opnieuw controleert.
 */
export default async function TrialCodePage() {
  const code = await readTrialCodeCookie();
  // Vrij trainen is in deze stand nog niet boekbaar via een code; dan
  // begint de bezoeker gewoon weer bij de codestap.
  const looked = code ? await lookupUsableTrialCodeScope(code) : null;
  const scope = looked === "vrij_trainen" ? null : looked;
  const options = scope ? await getTrialSessionOptions({ withPrices: false, scope }) : [];
  return <CodeFlow options={options} code={scope ? code : null} scope={scope} />;
}
