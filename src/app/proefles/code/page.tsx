import type { Metadata } from "next";
import { getTrialSessionOptions } from "@/lib/trial-sessions";
import { readTrialCodeCookie } from "@/lib/trial-codes/server";
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
 * dezelfde als in de betaalde flow, zonder prijzen. Het cookie bewijst
 * alleen een recente geldige codecheck; de betaling wordt uitsluitend bij
 * het boeken overgeslagen, door tmc.redeem_trial_code.
 */
export default async function TrialCodePage() {
  const [options, code] = await Promise.all([
    getTrialSessionOptions({ withPrices: false }),
    readTrialCodeCookie(),
  ]);
  return <CodeFlow options={options} hasValidCookie={code !== null} />;
}
