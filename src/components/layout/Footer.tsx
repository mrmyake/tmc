import Link from "next/link";
import { NAV_LINKS, SITE } from "@/lib/constants";
import { Container } from "./Container";

export function Footer() {
  return (
    <footer className="bg-bg-elevated border-t border-bg-subtle">
      <Container className="py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {/* Brand */}
          <div>
            <Link
              href="/"
              className="font-[family-name:var(--font-playfair)] text-2xl text-text"
            >
              {SITE.name}
            </Link>
            <p className="mt-4 text-text-muted text-sm leading-relaxed">
              Boutique training studio in Loosdrecht.
              <br />
              Persoonlijk. Exclusief. Resultaatgericht.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="text-xs font-medium uppercase tracking-[0.2em] text-accent mb-6">
              Navigatie
            </h4>
            <ul className="space-y-3">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-text-muted hover:text-text transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/proefles"
                  className="text-sm text-accent hover:text-accent-hover transition-colors"
                >
                  Boek een proefles
                </Link>
              </li>
            </ul>
            <h4 className="text-xs font-medium uppercase tracking-[0.2em] text-accent mb-4 mt-8">
              Gratis starten
            </h4>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/beweeg-beter"
                  className="text-sm text-text-muted hover:text-text transition-colors"
                >
                  Beweeg Beter Guide
                </Link>
              </li>
              <li>
                <Link
                  href="/mobility-reset"
                  className="text-sm text-text-muted hover:text-text transition-colors"
                >
                  7-Dagen Mobility Reset
                </Link>
              </li>
              <li>
                <Link
                  href="/mobility-check"
                  className="text-sm text-text-muted hover:text-text transition-colors"
                >
                  Gratis Mobility Check
                </Link>
              </li>
            </ul>
            <h4 className="text-xs font-medium uppercase tracking-[0.2em] text-accent mb-4 mt-8">
              Ook van Marlon
            </h4>
            <a
              href={SITE.hormoonprofiel}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-text-muted hover:text-text transition-colors"
            >
              Hormoonprofiel.com →
            </a>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-xs font-medium uppercase tracking-[0.2em] text-accent mb-6">
              Contact
            </h4>
            <address className="not-italic text-sm text-text-muted space-y-2">
              <p>{SITE.address.street}</p>
              <p>
                {SITE.address.zip} {SITE.address.city}
              </p>
              <p className="pt-2">
                <a
                  href={`mailto:${SITE.email}`}
                  className="hover:text-text transition-colors"
                >
                  {SITE.email}
                </a>
              </p>
              <p>
                <a
                  href={`tel:${SITE.phone.replace(/\s/g, "")}`}
                  className="hover:text-text transition-colors"
                >
                  {SITE.phone}
                </a>
              </p>
            </address>
            <div className="mt-6">
              <a
                href={SITE.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-text-muted hover:text-accent transition-colors"
                aria-label="Instagram"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-16 pt-8 border-t border-bg-subtle flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-text-muted">
          <p>
            &copy; {new Date().getFullYear()} {SITE.name}. Alle rechten
            voorbehouden.
          </p>
          <p>
            KvK: {SITE.kvk} &middot; BTW: {SITE.btw}
          </p>
        </div>
      </Container>
    </footer>
  );
}
