/**
 * De enige regel in de codebase voor "dit e-mailadres is een testadres":
 * het adres heeft een plus-tag waarin "test" voorkomt, hoofdletter-
 * ongevoelig. Het deel tussen de eerste "+" en de "@" telt, dus
 * naam+test@..., naam+conversietest@... en naam+TEST@... zijn testadressen;
 * test@..., tester@... en naam@test.nl niet.
 *
 * Gebruikt door de leadformulieren om hun ntfy-melding als test te
 * markeren (spec-membership-flow.md, ntfy-testprefix). Bewust puur en
 * zonder imports, zodat de regel los te testen is. Raakt geen is_test-
 * kolommen: die blijven hun eigen bron houden.
 */
export function isTestEmail(email: string | null | undefined): boolean {
  if (typeof email !== "string") return false;
  const at = email.lastIndexOf("@");
  if (at <= 0) return false;
  const local = email.slice(0, at);
  const plus = local.indexOf("+");
  if (plus < 0) return false;
  return local.slice(plus + 1).toLowerCase().includes("test");
}
