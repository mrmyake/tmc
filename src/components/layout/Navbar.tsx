"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { NAV_LINKS } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { QuietLink } from "@/components/ui/QuietLink";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const chromeOpen = scrolled || mobileOpen;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${
        chromeOpen
          ? "bg-bg/70 backdrop-blur-md border-b border-bg-subtle"
          : "bg-transparent border-b border-transparent"
      }`}
    >
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
          <span className="font-medium text-[13px] uppercase tracking-[0.22em] hidden sm:inline">
            The Movement Club
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-10">
          {NAV_LINKS.map((link) => {
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
          <Button href="/proefles" className="ml-4">
            Plan je proefles
          </Button>
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

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.5, ease: [0.2, 0.7, 0.1, 1] }}
            className="md:hidden overflow-hidden bg-bg/70 backdrop-blur-md border-t border-bg-subtle"
          >
            <div className="px-6 py-10 flex flex-col gap-7">
              {NAV_LINKS.map((link, i) => {
                const isActive = pathname === link.href;
                return (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.5,
                      ease: [0.2, 0.7, 0.1, 1],
                      delay: i * 0.05 + 0.08,
                    }}
                  >
                    <QuietLink
                      href={link.href}
                      active={isActive}
                      ariaCurrent={isActive ? "page" : undefined}
                      className="text-xl pb-1"
                    >
                      {link.label}
                    </QuietLink>
                  </motion.div>
                );
              })}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.5,
                  ease: [0.2, 0.7, 0.1, 1],
                  delay: 0.3,
                }}
              >
                <Button href="/proefles" className="mt-2 w-full text-center">
                  Plan je proefles
                </Button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
