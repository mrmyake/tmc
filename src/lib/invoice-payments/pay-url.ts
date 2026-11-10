const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidPayToken(token: string): boolean {
  return UUID_RE.test(token);
}

/** De stabiele betaal-URL van een factuur; `site` zonder slash aan het eind. */
export function invoicePayUrl(site: string, token: string): string {
  return `${site.replace(/\/+$/, "")}/factuur/betalen/${token}`;
}
