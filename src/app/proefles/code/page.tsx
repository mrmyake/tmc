import { redirect } from "next/navigation";

/**
 * Proefcodes v2: de aparte codeflow is opgegaan in /proefles/boeken (veld
 * "Proefcode" in het boekformulier). Oude links naar /proefles/code (flyers,
 * Instagram) landen daar.
 */
export default function TrialCodePage() {
  redirect("/proefles/boeken");
}
