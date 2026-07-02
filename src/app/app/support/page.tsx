import Link from "next/link";
import { MessageCircle, Phone, Mail } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { TrackedContactLink } from "@/components/ui/TrackedLink";
import { SITE } from "@/lib/constants";

export const metadata = {
  title: "Support | The Movement Club",
  robots: { index: false, follow: false },
};

export default function SupportPage() {
  return (
    <Container className="py-16 md:py-20 max-w-3xl">
      <header className="mb-14">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
          Hulp nodig?
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-5xl md:text-7xl text-text leading-[1.02] tracking-[-0.02em]">
          Support.
        </h1>
        <p className="mt-6 text-text-muted text-lg max-w-xl">
          Vraag over je boeking, lidmaatschap of iets anders? We staan voor je
          klaar.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-14">
        <div className="relative bg-bg-elevated p-8">
          <div
            aria-hidden
            className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
          />
          <MessageCircle
            size={22}
            strokeWidth={1.5}
            className="text-accent mb-4"
            aria-hidden
          />
          <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-text leading-[1.05] tracking-[-0.02em] mb-2">
            WhatsApp
          </h2>
          <p className="text-text-muted text-sm leading-relaxed mb-6">
            Het snelste antwoord. Stuur ons een bericht, we reageren doorgaans
            dezelfde dag.
          </p>
          <TrackedContactLink
            method="whatsapp"
            // COPY: confirm with Marlon — SITE.whatsapp is nog een placeholder-nummer
            href={SITE.whatsapp}
            className="inline-flex items-center justify-center px-6 py-3 text-[11px] font-medium uppercase tracking-[0.18em] bg-accent text-bg hover:bg-accent-hover transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] cursor-pointer"
          >
            Stuur een bericht
          </TrackedContactLink>
        </div>

        <div className="relative bg-bg-elevated p-8">
          <div
            aria-hidden
            className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
          />
          <Phone
            size={22}
            strokeWidth={1.5}
            className="text-accent mb-4"
            aria-hidden
          />
          <h2 className="font-[family-name:var(--font-playfair)] text-2xl text-text leading-[1.05] tracking-[-0.02em] mb-2">
            Bellen of mailen
          </h2>
          <p className="text-text-muted text-sm leading-relaxed mb-6">
            Liever direct contact? Bel ons of stuur een e-mail.
          </p>
          <div className="space-y-3">
            <TrackedContactLink
              method="phone"
              // COPY: confirm with Marlon — SITE.phone is nog een placeholder-nummer
              href={`tel:${SITE.phone.replace(/\s+/g, "")}`}
              className="inline-flex items-center gap-2 text-text hover:text-accent transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] text-sm"
            >
              <Phone size={14} strokeWidth={1.5} aria-hidden />
              {SITE.phone}
            </TrackedContactLink>
            <TrackedContactLink
              method="email"
              href={`mailto:${SITE.email}`}
              className="inline-flex items-center gap-2 text-text hover:text-accent transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] text-sm"
            >
              <Mail size={14} strokeWidth={1.5} aria-hidden />
              {SITE.email}
            </TrackedContactLink>
          </div>
        </div>
      </div>

      <div className="border-t border-[color:var(--ink-500)]/60 pt-10">
        <h2 className="font-[family-name:var(--font-playfair)] text-2xl md:text-3xl text-text leading-[1.05] tracking-[-0.02em] mb-6">
          Veelgestelde vragen
        </h2>
        <div className="space-y-6">
          <div>
            <p className="text-text text-sm mb-1">
              Kan ik een boeking wijzigen of annuleren?
            </p>
            <p className="text-text-muted text-sm leading-relaxed">
              Ja, dat kan zelf via{" "}
              <Link
                href="/app/boekingen"
                className="text-accent hover:underline"
              >
                Mijn lessen
              </Link>
              , binnen de daar aangegeven termijn.
            </p>
          </div>
          <div>
            <p className="text-text text-sm mb-1">
              Ik wil mijn lidmaatschap pauzeren of opzeggen.
            </p>
            <p className="text-text-muted text-sm leading-relaxed">
              Regel dit via{" "}
              <Link
                href="/app/abonnement"
                className="text-accent hover:underline"
              >
                Lidmaatschap
              </Link>
              . Kom je er niet uit? Stuur ons gerust een bericht.
            </p>
          </div>
          <div>
            <p className="text-text text-sm mb-1">
              Ik heb een vraag die hier niet tussen staat.
            </p>
            <p className="text-text-muted text-sm leading-relaxed">
              Geen probleem — WhatsApp, bel of mail ons, we denken graag mee.
            </p>
          </div>
        </div>
      </div>
    </Container>
  );
}
