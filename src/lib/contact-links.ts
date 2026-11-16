import type { ContactMethod } from "@/lib/analytics";

/**
 * Herkent een contactlink aan zijn href: tel:, mailto: of WhatsApp (wa.me,
 * api.whatsapp.com, whatsapp:). Alles anders is geen contactlink (null).
 * Gebruikt door de Portable Text-link-mark, zodat een link die Marlon in
 * Sanity toevoegt vanzelf `contact_click` vuurt (spec-conversiemeting.md).
 */
export function contactMethodFromHref(href: string | null | undefined): ContactMethod | null {
  if (!href) return null;
  const value = href.trim().toLowerCase();
  if (value.startsWith("tel:")) return "phone";
  if (value.startsWith("mailto:")) return "email";
  if (value.startsWith("whatsapp:")) return "whatsapp";
  if (/^https?:\/\/(www\.)?wa\.me(\/|$)/.test(value)) return "whatsapp";
  if (/^https?:\/\/(api|web)\.whatsapp\.com(\/|$)/.test(value)) return "whatsapp";
  return null;
}
