import { MessageCircle } from "lucide-react";

/**
 * Domme knop: de href komt uit de query (toWhatsAppHref, server-only).
 * Zonder href wordt er niets gerenderd; het telefoonnummer blijft dan als
 * tekst zichtbaar in de rij.
 */
export function WhatsAppButton({
  href,
  name,
}: {
  href: string | null;
  name: string;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      // COPY: confirm met Marlon
      aria-label={`WhatsApp naar ${name}`}
      // COPY: confirm met Marlon
      title="Open WhatsApp"
      className="inline-flex items-center gap-1.5 border border-[color:var(--ink-500)] text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted px-3 py-2 hover:text-accent hover:border-accent transition-colors"
    >
      <MessageCircle size={12} strokeWidth={1.5} aria-hidden />
      {/* COPY: confirm met Marlon */}
      WhatsApp
    </a>
  );
}
