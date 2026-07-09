"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown } from "lucide-react";
import { NAV_LINKS, AANBOD_DROPDOWN } from "@/lib/constants";
import type { CampaignPhase } from "@/lib/campaign";
import { Button } from "@/components/ui/Button";
import { QuietLink } from "@/components/ui/QuietLink";
import { CampaignTeaser } from "./CampaignTeaser";

interface NavbarProps {
  campaignPhase: CampaignPhase;
  campaignDeadline: string;
}

type AuthState = "unknown" | "out" | "in";

/**
 * Marketing navbar. No framer-motion — the mobile menu uses a CSS
 * grid-rows transition (0fr → 1fr) which smoothly animates the
 * collapsed container's natural height without JS. Menu items fade +
 * slide via `.tmc-fade-up` with staggered inline delays.
 */
export function Navbar({ campaignPhase, campaignDeadline }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [aanbodOpen, setAanbodOpen] = useState(false);
  const [mobileAanbodOpen, setMobileAanbodOpen] = useState(false);
  const [authState, setAuthState] = useState<AuthState>("unknown");
  const pathname = usePathname();
  const aanbodRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // rAF-batched scroll handler zodat de scrollY-read niet op elke
    // scroll-event een layout-thrash veroorzaakt. Passive listener blijft.
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > 50);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setAanbodOpen(false);
    setMobileAanbodOpen(false);
  }, [pathname]);

  // Auth-swap "Inloggen" → "Ga naar app": client-only check via het
  // lazy-imported browser-Supabase-client, zelfde patroon als
  // AuthListener.tsx. Bewust NIET server-side (cookies()/auth.getUser() in
  // de root layout) — dat zou de hele marketing-site van ISR
  // (revalidate=60) naar force-dynamic zetten. Het label rendert pas
  // zodra authState bekend is (zie de opacity-gate hieronder), zodat een
  // ingelogd lid nooit even "Inloggen" ziet flitsen.
  useEffect(() => {
    let mounted = true;
    import("@/lib/supabase/client")
      .then(({ createClient }) => {
        if (!mounted) return;
        return createClient().auth.getUser();
      })
      .then((result) => {
        if (mounted) setAuthState(result?.data.user ? "in" : "out");
      })
      .catch(() => {
        // Geen Supabase-config beschikbaar (of netwerkfout): val terug op
        // "Inloggen" i.p.v. de placeholder eeuwig onzichtbaar te laten.
        if (mounted) setAuthState("out");
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Aanbod-dropdown: sluit op klik buiten het paneel of Escape.
  useEffect(() => {
    if (!aanbodOpen) return;
    const onClick = (e: MouseEvent) => {
      if (aanbodRef.current && !aanbodRef.current.contains(e.target as Node)) {
        setAanbodOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAanbodOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [aanbodOpen]);

  const chromeOpen = scrolled || mobileOpen;
  // COPY: confirm met Marlon
  const utilityLabel = authState === "in" ? "Ga naar app" : "Inloggen";
  const utilityHref = authState === "in" ? "/app" : "/login";
  // COPY: confirm met Marlon
  const earlyMemberLabel = campaignPhase === "closed" ? "Word lid" : "Early Member";

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${
        chromeOpen
          ? "bg-bg/70 backdrop-blur-md border-b border-bg-subtle"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <CampaignTeaser phase={campaignPhase} deadline={campaignDeadline} />
      <nav className="mx-auto max-w-7xl px-6 lg:px-8 flex items-center justify-between h-20">
        <Link
          href="/"
          aria-label="The Movement Club, home"
          className="group flex items-center gap-3 text-text"
        >
          <span
            aria-hidden
            className="font-[family-name:var(--font-playfair)] text-xs tracking-[0.12em] border border-accent/40 text-accent px-2 py-0.5 transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] group-hover:border-accent"
          >
            TMC
          </span>
          <span className="font-medium text-[11px] sm:text-[13px] uppercase tracking-[0.18em] sm:tracking-[0.22em]">
            The Movement Club
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-10">
          {NAV_LINKS.map((link) => {
            if (link.label === "Aanbod") {
              return (
                <div key={link.href} ref={aanbodRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setAanbodOpen((v) => !v)}
                    aria-expanded={aanbodOpen}
                    aria-haspopup="true"
                    className="flex items-center gap-1.5 text-[15px] py-1 text-text-muted transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:text-text"
                  >
                    {link.label}
                    <ChevronDown
                      size={14}
                      strokeWidth={1.5}
                      className={`transition-transform duration-300 ${
                        aanbodOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {aanbodOpen && (
                    <div className="absolute left-0 top-full mt-3 min-w-[280px] border-t-2 border-accent bg-surface-light py-2 shadow-2xl">
                      {AANBOD_DROPDOWN.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setAanbodOpen(false)}
                          className="block px-4 py-2.5 text-sm text-on-light transition-colors hover:bg-accent/10"
                        >
                          {item.label}
                          {"sub" in item && item.sub && (
                            <span className="mt-0.5 block text-xs text-on-light-muted">
                              {item.sub}
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            if (link.label === "Early Member") {
              return (
                <QuietLink
                  key={link.href}
                  href={link.href}
                  className="text-[15px] py-1 text-accent"
                >
                  {earlyMemberLabel}
                </QuietLink>
              );
            }

            const isActive = pathname === link.href;
            return (
              <QuietLink
                key={link.href}
                href={link.href}
                active={isActive}
                ariaCurrent={isActive ? "page" : undefined}
                className="text-[15px] py-1"
              >
                {link.label}
              </QuietLink>
            );
          })}
          <span
            className={`ml-4 transition-opacity duration-300 ${
              authState === "unknown" ? "opacity-0" : "opacity-100"
            }`}
            aria-hidden={authState === "unknown"}
          >
            <QuietLink href={utilityHref} className="text-[15px] py-1">
              {utilityLabel}
            </QuietLink>
          </span>
          <Button href="/proefles">Plan je proefles</Button>
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden text-text p-2 -mr-2"
          aria-label={mobileOpen ? "Sluit menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? (
            <X size={24} strokeWidth={1.5} />
          ) : (
            <Menu size={24} strokeWidth={1.5} />
          )}
        </button>
      </nav>

      {/* Mobile menu — CSS grid-rows trick. Going 0fr → 1fr smoothly
          animates the child's natural height without JS. Inner div
          needs min-h-0 so the grid track can collapse to zero. */}
      <div
        className={`md:hidden grid overflow-hidden transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${
          mobileOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
        inert={!mobileOpen ? true : undefined}
      >
        <div className="min-h-0 bg-bg/70 backdrop-blur-md border-t border-bg-subtle">
          <div className="px-6 py-10 flex flex-col gap-7">
            {NAV_LINKS.map((link, i) => {
              const delay = mobileOpen ? `${i * 0.05 + 0.08}s` : "0s";
              const fadeClass = mobileOpen ? "tmc-fade-up" : "opacity-0";

              if (link.label === "Aanbod") {
                return (
                  <div key={link.href} style={{ animationDelay: delay }} className={fadeClass}>
                    <button
                      type="button"
                      onClick={() => setMobileAanbodOpen((v) => !v)}
                      aria-expanded={mobileAanbodOpen}
                      className="flex w-full items-center justify-between text-xl pb-1 text-text"
                    >
                      {link.label}
                      <ChevronDown
                        size={20}
                        strokeWidth={1.5}
                        className={`transition-transform duration-300 ${
                          mobileAanbodOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    <div
                      className={`grid overflow-hidden transition-[grid-template-rows] duration-400 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${
                        mobileAanbodOpen ? "grid-rows-[1fr] mt-3" : "grid-rows-[0fr]"
                      }`}
                    >
                      <div className="min-h-0 flex flex-col gap-4 border-l border-bg-subtle pl-4">
                        {AANBOD_DROPDOWN.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            className="text-base text-text-muted"
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              }

              if (link.label === "Early Member") {
                return (
                  <div key={link.href} style={{ animationDelay: delay }} className={fadeClass}>
                    <QuietLink href={link.href} className="text-xl pb-1 text-accent">
                      {earlyMemberLabel}
                    </QuietLink>
                  </div>
                );
              }

              const isActive = pathname === link.href;
              return (
                <div key={link.href} style={{ animationDelay: delay }} className={fadeClass}>
                  <QuietLink
                    href={link.href}
                    active={isActive}
                    ariaCurrent={isActive ? "page" : undefined}
                    className="text-xl pb-1"
                  >
                    {link.label}
                  </QuietLink>
                </div>
              );
            })}
            <div
              style={{
                animationDelay: mobileOpen
                  ? `${NAV_LINKS.length * 0.05 + 0.08}s`
                  : "0s",
              }}
              className={mobileOpen ? "tmc-fade-up" : "opacity-0"}
            >
              <span
                className={`block transition-opacity duration-300 ${
                  authState === "unknown" ? "opacity-0" : "opacity-100"
                }`}
                aria-hidden={authState === "unknown"}
              >
                <QuietLink href={utilityHref} className="text-xl pb-1">
                  {utilityLabel}
                </QuietLink>
              </span>
            </div>
            <div
              style={{ animationDelay: mobileOpen ? "0.35s" : "0s" }}
              className={mobileOpen ? "tmc-fade-up" : "opacity-0"}
            >
              <Button href="/proefles" className="mt-2 w-full text-center">
                Plan je proefles
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
