"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, LogOut } from "lucide-react";
import { signOut } from "@/lib/actions/auth";

interface NavItem {
  href: string;
  label: string;
}

interface Props {
  firstName: string;
  isAdmin: boolean;
}

const BASE_NAV: NavItem[] = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/rooster", label: "Rooster" },
  { href: "/app/pt", label: "PT" },
  { href: "/app/boekingen", label: "Boekingen" },
  { href: "/app/abonnement", label: "Abonnement" },
  { href: "/app/profiel", label: "Profiel" },
];

export function AppNav({ firstName, isAdmin }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav: NavItem[] = [
    ...BASE_NAV,
    ...(isAdmin ? [{ href: "/app/admin", label: "Admin" }] : []),
  ];

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function isActive(href: string) {
    if (href === "/app") return pathname === "/app";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="sticky top-0 z-40 bg-bg/95 backdrop-blur-sm border-b border-bg-subtle">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link
            href="/app"
            className="font-[family-name:var(--font-playfair)] text-xl text-text hover:text-accent transition-colors"
          >
            The Movement Club
          </Link>

          <nav className="hidden lg:flex items-center gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2 text-sm uppercase tracking-[0.15em] transition-colors ${
                  isActive(item.href)
                    ? "text-accent"
                    : "text-text-muted hover:text-text"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-4">
            <span className="text-sm text-text-muted">
              Hoi, <span className="text-text">{firstName}</span>
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-text-muted hover:text-accent transition-colors cursor-pointer"
              >
                <LogOut size={14} />
                Uitloggen
              </button>
            </form>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Menu sluiten" : "Menu openen"}
            className="lg:hidden text-text hover:text-accent transition-colors cursor-pointer"
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden overflow-hidden border-t border-bg-subtle"
          >
            <div className="mx-auto max-w-7xl px-6 py-4 space-y-1">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-4 py-3 text-sm uppercase tracking-[0.15em] transition-colors ${
                    isActive(item.href)
                      ? "text-accent bg-bg-elevated"
                      : "text-text-muted hover:text-text hover:bg-bg-elevated/50"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <div className="pt-4 mt-2 border-t border-bg-subtle flex items-center justify-between px-4">
                <span className="text-sm text-text-muted">
                  Hoi, <span className="text-text">{firstName}</span>
                </span>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-text-muted hover:text-accent transition-colors cursor-pointer"
                  >
                    <LogOut size={14} />
                    Uitloggen
                  </button>
                </form>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
