import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { NAV_LINKS } from "@/lib/constants";
import { Container } from "./Container";
import type { SanitySettings } from "../../../sanity/lib/fetch";

interface FooterProps {
  settings: SanitySettings;
}

function QuietLink({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  const classes =
    "group relative inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:text-text";
  const underline = (
    <span
      aria-hidden
      className="pointer-events-none absolute left-0 right-0 -bottom-0.5 h-px origin-left scale-x-0 bg-accent transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] group-hover:scale-x-100"
    />
  );

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
      >
        <span className="relative">
          {children}
          {underline}
        </span>
        <ArrowUpRight
          size={14}
          strokeWidth={1.5}
          className="transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        />
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      <span className="relative">
        {children}
        {underline}
      </span>
    </Link>
  );
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
              <h4 className="text-xs font-medium uppercase tracking-[0.2em] text-text-muted mb-5">
                Navigatie
              </h4>
              <ul className="space-y-3">
                {NAV_LINKS.map((link) => (
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
              <h4 className="text-xs font-medium uppercase tracking-[0.2em] text-text-muted mb-5">
                Gratis starten
              </h4>
              <ul className="space-y-3">
                <li>
                  <QuietLink href="/beweeg-beter">Beweeg Beter guide</QuietLink>
                </li>
                <li>
                  <QuietLink href="/mobility-reset">
                    7-Dagen Mobility Reset
                  </QuietLink>
                </li>
                <li>
                  <QuietLink href="/mobility-check">
                    Gratis Mobility Check
                  </QuietLink>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-medium uppercase tracking-[0.2em] text-text-muted mb-5">
                Ook van Marlon
              </h4>
              <QuietLink href="https://hormoonprofiel.com" external>
                Hormoonprofiel.com
              </QuietLink>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-medium uppercase tracking-[0.2em] text-text-muted mb-5">
              Contact
            </h4>
            <address className="not-italic text-sm text-text-muted space-y-2">
              <p>{settings.address.street}</p>
              <p>
                {settings.address.postalCode} · {settings.address.city}
              </p>
              <p className="pt-3">
                <QuietLink href={`mailto:${settings.email}`}>
                  {settings.email}
                </QuietLink>
              </p>
              <p>
                <QuietLink href={`tel:${settings.phone.replace(/\s/g, "")}`}>
                  {settings.phone}
                </QuietLink>
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
          <p>
            KvK {settings.kvkNumber} · BTW {settings.btwNumber}
          </p>
        </div>
      </Container>
    </footer>
  );
}
