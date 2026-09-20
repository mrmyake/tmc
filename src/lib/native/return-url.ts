/**
 * Terugkeer naar de native app na een Mollie-betaling (workstream A,
 * spec-ios-app.md; discovery in PR #191).
 *
 * De app laadt de live site via server.url en opent de Mollie-checkout in
 * een in-app browser (@capacitor/browser). Een https-redirectUrl zou daar
 * in de SFSafariViewController landen, zonder de sessiecookies van de
 * webview, en de gebruiker in het sheet laten hangen. Daarom krijgt een
 * betaling die vanuit de app start een redirectUrl op het custom scheme
 * hieronder; iOS en Android openen daarop de app en de listener
 * (DeepLinkHandler) navigeert de webview naar het pad. Mollie accepteert
 * custom URL schemes in redirectUrl (docs "Integrating Mollie in your
 * mobile app"). Geen universal links: die vereisen het associated-domains-
 * entitlement uit workstream C.
 *
 * Geen "server-only": de server actions bouwen de URL, de client parseert
 * hem. De client stuurt alleen het doel ("web" of "app") mee, nooit een
 * URL, zodat een aanvraag geen willekeurige redirect kan kiezen.
 */

/** Zelfde waarde als appId in capacitor.config.ts en CFBundleURLSchemes in Info.plist. */
export const APP_URL_SCHEME = "nl.themovementclub.app";

export type ReturnTarget = "web" | "app";

export function isReturnTarget(value: unknown): value is ReturnTarget {
  return value === "web" || value === "app";
}

/**
 * Bouwt de redirectUrl voor Mollie. `path` begint met "/" en mag een query
 * dragen; op "app" wordt het `nl.themovementclub.app://app/abonnement/...`,
 * dus het eerste padsegment wordt de host van de custom URL en
 * appUrlToPath() zet dat weer terug.
 */
export function buildReturnUrl(siteBase: string, path: string, target: ReturnTarget | undefined): string {
  if (!path.startsWith("/")) throw new Error(`buildReturnUrl: pad hoort met / te beginnen: ${path}`);
  if (target === "app") return `${APP_URL_SCHEME}:/${path}`;
  return `${siteBase}${path}`;
}

/**
 * Van een binnenkomende custom-scheme-URL naar een intern pad, of null als
 * de URL niet van ons is of niet veilig te navigeren is. Alleen paden met
 * één leidende slash; "//" (open redirect) en andere schemes vallen af.
 */
export function appUrlToPath(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${APP_URL_SCHEME}:`) return null;
  // new URL("nl.themovementclub.app://app/x?y") geeft host "app", pathname "/x".
  const path = `/${parsed.host}${parsed.pathname}${parsed.search}`;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (path === "/") return null;
  return path;
}
