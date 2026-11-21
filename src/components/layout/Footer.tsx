import Link from "next/link";
import { FOOTER_NAV_LINKS } from "@/lib/constants";
import { Container } from "./Container";
import { QuietLink } from "@/components/ui/QuietLink";
import type { SanitySettings } from "../../../sanity/lib/fetch";
import { toTelHref } from "@/lib/phone";
import { TrackedContactLink } from "@/components/ui/TrackedLink";
import { CookieSettingsButton } from "./CookieSettingsButton";

interface FooterProps {
  settings: SanitySettings;
}

export function Footer({ settings }: FooterProps) {
  return (
    <footer className="bg-bg-elevated">
      <div
        aria-hidden
        className="h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent"
      />
      <Container className="py-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-14 md:gap-12">
          <div>
            <Link
              href="/"
              className="font-[family-name:var(--font-playfair)] text-3xl text-text leading-none tracking-[-0.01em]"
            >
              The Movement{" "}
              <em className="not-italic text-accent">Club</em>
            </Link>
            <p className="mt-6 text-text-muted text-sm leading-relaxed max-w-xs">
              Boutique training studio in {settings.address.city}. Kleine
              groepen, echte coaching, patronen die blijven.
            </p>
          </div>

          <div className="space-y-10">
            <div>
              <h3 className="text-xs font-medium uppercase tracking-[0.2em] text-text-muted mb-5">
                Navigatie
              </h3>
              <ul className="space-y-3">
                {FOOTER_NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <QuietLink href={link.href}>{link.label}</QuietLink>
                  </li>
                ))}
                <li>
                  <QuietLink href="/proefles">Plan je proefles</QuietLink>
                </li>
              </ul>
            </div>

            <div>
              {/* COPY: confirm met Marlon, kolom met een kop voor drie links
                  heeft nu nog maar een link over sinds de lead magnets
                  tijdelijk verwijderd zijn, andere kop kan hier beter passen */}
              <h3 className="text-xs font-medium uppercase tracking-[0.2em] text-text-muted mb-5">
                {/* COPY: confirm met Marlon */}
                Kennismaken
              </h3>
              <ul className="space-y-3">
                <li>
                  <QuietLink href="/proefles">Plan je proefles</QuietLink>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-medium uppercase tracking-[0.2em] text-text-muted mb-5">
                Ook van Marlon
              </h3>
              {/* Intern pad: in elke modus van hormoonprofiel.com klopt de
                  bestemming (standalone stuurt /hormoonprofiel met 307
                  door naar hormoonprofiel.com). */}
              <QuietLink href="/hormoonprofiel">Hormoonprofiel</QuietLink>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-medium uppercase tracking-[0.2em] text-text-muted mb-5">
              Contact
            </h3>
            <address className="not-italic text-sm text-text-muted space-y-2">
              <p>{settings.address.street}</p>
              <p>
                {settings.address.postalCode} · {settings.address.city}
              </p>
              <p className="pt-3">
                <TrackedContactLink
                  method="email"
                  appearance="quiet"
                  href={`mailto:${settings.email}`}
                >
                  {settings.email}
                </TrackedContactLink>
              </p>
              <p>
                <TrackedContactLink
                  method="phone"
                  appearance="quiet"
                  href={toTelHref(settings.phone)}
                >
                  {settings.phone}
                </TrackedContactLink>
              </p>
            </address>
            {settings.instagramUrl && (
              <div className="mt-8">
                <QuietLink href={settings.instagramUrl} external>
                  Instagram
                </QuietLink>
              </div>
            )}
          </div>
        </div>

        <div className="mt-20 pt-8 border-t border-bg-subtle flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-text-muted">
          <p>
            &copy; {new Date().getFullYear()} {settings.studioName}. Alle
            rechten voorbehouden.
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <QuietLink href="/voorwaarden">Algemene voorwaarden</QuietLink>
            <QuietLink href="/huisregels">Huisregels</QuietLink>
            <QuietLink href="/onbegeleide-toegang">
              Onbegeleide toegang
            </QuietLink>
            <QuietLink href="/privacybeleid">Privacyverklaring</QuietLink>
            {/* COPY: confirm met Marlon */}
            <CookieSettingsButton>Cookie-instellingen</CookieSettingsButton>
            <p>
              KvK {settings.kvkNumber} · BTW {settings.btwNumber}
            </p>
          </div>
        </div>
      </Container>
    </footer>
  );
}
