import { Parser } from "htmlparser2";

/**
 * Linkregels voor mail-HTML. Gedeeld door de test (scripts/emails/) en de
 * prebuild-check (scripts/check-emails.mts). Geen React, geen netwerk, geen env.
 *
 * Regel: in de HTML-versie van een mail is een URL of kaal domein nooit
 * zichtbare tekst; elke link heeft een beschrijvende linktekst. De
 * plain-text-versie valt buiten deze regels.
 */

/** Hosts waar een href naartoe mag wijzen. */
export const ALLOWED_HOSTS = ["themovementclub.nl", "www.themovementclub.nl"];

/**
 * E-mailadressen die als zichtbare tekst mogen voorkomen. Elk ander adres in
 * zichtbare tekst valt onder de kaal-domeinregel.
 */
export const ALLOWED_VISIBLE_EMAILS = [
  "marlon@themovementclub.nl",
  "lid@themovementclub.nl", // fixture-adres in de tests
];

export interface LintOptions {
  /**
   * Auth-templates: een href die met een Supabase-template-variabele begint
   * (`{{ .ConfirmationURL }}`, `{{ .SiteURL }}`) is toegestaan, ook al wijst
   * de echte waarde naar Supabase.
   */
  allowTemplateVariableHrefs?: boolean;
}

export interface Violation {
  rule: "visible-url" | "bare-domain" | "empty-link-text" | "url-like-link-text" | "href-domain";
  message: string;
}

const SCHEME_OR_WWW = /(?:https?:\/\/|\bwww\.)/i;
// <naam>.<tld>: letters na de punt, dus "17,00", "1.5" en "okt. 2026" blijven buiten beeld.
const BARE_DOMAIN = /\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/i;

function stripAllowedEmails(text: string): string {
  let out = text;
  for (const email of ALLOWED_VISIBLE_EMAILS) {
    out = out.split(email).join(" ");
  }
  return out;
}

/** Eerste URL-achtige treffer in `text`, of null. */
export function findUrlLike(text: string): string | null {
  const cleaned = stripAllowedEmails(text);
  const scheme = cleaned.match(SCHEME_OR_WWW);
  if (scheme) return scheme[0];
  const bare = cleaned.match(BARE_DOMAIN);
  return bare ? bare[0] : null;
}

interface Anchor {
  href: string | null;
  text: string;
}

const SKIP_TAGS = new Set(["head", "style", "script", "title"]);

/** Zichtbare tekst (zonder head/style/script) en alle <a>-elementen. */
export function extractVisible(html: string): { text: string; anchors: Anchor[] } {
  const chunks: string[] = [];
  const anchors: Anchor[] = [];
  let skipDepth = 0;
  let current: Anchor | null = null;

  const parser = new Parser(
    {
      onopentag(name, attrs) {
        if (SKIP_TAGS.has(name)) skipDepth += 1;
        if (name === "a") {
          current = { href: attrs.href ?? null, text: "" };
          anchors.push(current);
        }
      },
      ontext(data) {
        if (skipDepth > 0) return;
        chunks.push(data);
        if (current) current.text += data;
      },
      onclosetag(name) {
        if (SKIP_TAGS.has(name)) skipDepth = Math.max(0, skipDepth - 1);
        if (name === "a") current = null;
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();

  return { text: chunks.join(" "), anchors };
}

function hrefViolation(href: string, options: LintOptions): string | null {
  const value = href.trim();
  if (value === "") return "lege href";
  if (options.allowTemplateVariableHrefs && /^\{\{\s*\.[A-Za-z]+\s*\}\}/.test(value)) {
    return null;
  }
  if (/^(mailto|tel):/i.test(value)) return null;
  let host: string;
  try {
    host = new URL(value).hostname.toLowerCase();
  } catch {
    return `href is geen absolute URL: ${value}`;
  }
  if (!ALLOWED_HOSTS.includes(host)) return `href wijst naar ${host}`;
  return null;
}

export function lintHtml(html: string, options: LintOptions = {}): Violation[] {
  const violations: Violation[] = [];
  const { text, anchors } = extractVisible(html);

  const hit = findUrlLike(text);
  if (hit) {
    const rule = SCHEME_OR_WWW.test(stripAllowedEmails(text)) ? "visible-url" : "bare-domain";
    violations.push({
      rule,
      message: `zichtbare tekst bevat "${hit}" (context: "${contextAround(text, hit)}")`,
    });
  }

  for (const anchor of anchors) {
    const label = anchor.text.replace(/\s+/g, " ").trim();
    if (label === "") {
      violations.push({ rule: "empty-link-text", message: `<a href="${anchor.href ?? ""}"> heeft geen linktekst` });
    } else if (findUrlLike(label)) {
      violations.push({ rule: "url-like-link-text", message: `linktekst lijkt op een URL: "${label}"` });
    }
    const problem = anchor.href === null ? "<a> zonder href" : hrefViolation(anchor.href, options);
    if (problem) violations.push({ rule: "href-domain", message: problem });
  }

  return violations;
}

function contextAround(text: string, hit: string): string {
  const flat = text.replace(/\s+/g, " ");
  const at = flat.toLowerCase().indexOf(hit.toLowerCase());
  if (at < 0) return flat.slice(0, 60);
  return flat.slice(Math.max(0, at - 25), at + hit.length + 25).trim();
}

/**
 * Supabase Auth-templates zijn Go-templates. Voor de lint vervangen we de
 * variabelen door dummywaarden en verwijderen we de if/else/end-tags (alle
 * takken blijven staan, zodat elke tak getoetst wordt).
 */
const TEMPLATE_DUMMIES: Record<string, string> = {
  SiteURL: "https://www.themovementclub.nl",
  ConfirmationURL: "https://www.themovementclub.nl/auth/v1/verify",
  RedirectTo: "https://www.themovementclub.nl/app",
  TokenHash: "tokenhash",
  Token: "123456",
  Email: "lid@themovementclub.nl",
  NewEmail: "lid@themovementclub.nl",
  OldEmail: "lid@themovementclub.nl",
};

export function fillAuthTemplate(source: string): string {
  return source
    .replace(/\{\{\s*(?:if|else if|else|end|with|range)\b[^}]*\}\}/g, "")
    .replace(/\{\{\s*\.([A-Za-z_.]+)\s*\}\}/g, (_m, name: string) => TEMPLATE_DUMMIES[name] ?? "Voorbeeld");
}

/**
 * Lint een Auth-template: href-controle op de ruwe bron (variabelen blijven
 * toegestaan), tekstcontrole op de ingevulde versie.
 */
export function lintAuthTemplate(source: string): Violation[] {
  const filled = fillAuthTemplate(source);
  const violations = lintHtml(filled, { allowTemplateVariableHrefs: true });
  // De href-controle van de ingevulde versie kijkt naar dummy-URL's op ons
  // eigen domein, dus die slaagt altijd; controleer de ruwe hrefs apart.
  const raw = extractVisible(source.replace(/\{\{\s*(?:if|else if|else|end|with|range)\b[^}]*\}\}/g, ""));
  for (const anchor of raw.anchors) {
    if (anchor.href === null) continue;
    const problem = hrefViolation(anchor.href, { allowTemplateVariableHrefs: true });
    if (problem && !violations.some((v) => v.rule === "href-domain" && v.message === problem)) {
      violations.push({ rule: "href-domain", message: problem });
    }
  }
  return violations;
}
