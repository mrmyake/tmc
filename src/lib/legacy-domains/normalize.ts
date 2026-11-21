/** Host normaliseren: lowercase, poort eraf, trailing dot eraf, www. eraf. */
export function normalizeHost(rawHost: string | null | undefined): string {
  if (!rawHost) return "";
  let host = rawHost.trim().toLowerCase();
  // Poort eraf (IPv6-literals komen op deze sites niet voor).
  host = host.replace(/:\d+$/, "");
  host = host.replace(/\.$/, "");
  if (host.startsWith("www.")) host = host.slice(4);
  return host;
}

/**
 * Pad normaliseren voor matching: decoderen, lowercase, dubbele slashes
 * samenvoegen, trailing slash weg. De query string hoort niet in `pathname`
 * en wordt dus nooit meegenomen. De root blijft "/".
 */
export function normalizePath(rawPathname: string): string {
  let path = rawPathname.split("?")[0].split("#")[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    // Ongeldige percent-encoding: match op de ruwe waarde.
  }
  path = path.toLowerCase().replace(/\/{2,}/g, "/");
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/+$/, "");
  return path === "" ? "/" : path;
}
