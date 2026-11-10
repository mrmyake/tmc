import { resolveMollieApiKey, type MollieMode } from "@/lib/mollie";

/**
 * Kan er in DEZE omgeving online betaald worden voor een factuur van deze
 * modus? Dezelfde regels als getMollieClient (src/lib/mollie.ts), maar zonder
 * client te bouwen en zonder een foutmelding te loggen: ontbreekt de key, is
 * hij van de verkeerde omgeving (de live-key werkt alleen op productie) of heeft
 * hij de verkeerde prefix, dan is online betalen hier niet beschikbaar.
 * Typisch geval: een LIVE-factuur geopend op een preview.
 */
export function onlinePaymentAvailable(
  isTest: boolean,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const mode: MollieMode = isTest ? "test" : "live";
  return resolveMollieApiKey(mode, env).ok;
}
