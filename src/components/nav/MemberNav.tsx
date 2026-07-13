"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  ClipboardList,
  Home,
  MoreHorizontal,
  ShoppingBag,
} from "lucide-react";
import { AvatarDropdown, type Role } from "./AvatarDropdown";
import { MemberMoreMenu } from "./MemberMoreMenu";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Calendar;
  /** Alleen voor "Home": exacte match i.p.v. prefix, anders zou elke
   * /app/**-route ook Home als actief markeren. */
  exact?: boolean;
}

/**
 * Nav-cleanup: exact 5 vaste tabs (was 6 basisitems plus een conditionele
 * 7e voor "Vrij trainen" — ruim boven de bottom-tab 5-item-vuistregel, zie
 * discovery-navigatie-structuur.md punt 9). Alle segment-/conditionele
 * items (Profiel, Account en instellingen, Schema, PT, Support, en een
 * link terug naar de marketingsite) zitten nu achter "Meer"
 * (MemberMoreMenu). "Vrij trainen" heeft bewust geen eigen tab meer — die
 * ingang loopt via de bestaande link op /app/rooster.
 */
const FIXED_ITEMS: NavItem[] = [
  {
    href: "/app",
    // COPY: confirm met Marlon
    label: "Home",
    icon: Home,
    exact: true,
  },
  {
    href: "/app/rooster",
    label: "Rooster",
    icon: Calendar,
  },
  {
    href: "/app/boekingen",
    // COPY: confirm met Marlon — paginatitel blijft "Mijn boekingen"
    label: "Boekingen",
    icon: ClipboardList,
  },
  {
    href: "/app/producten",
    // COPY: confirm met Marlon
    label: "Producten",
    icon: ShoppingBag,
  },
];

// Routes die vanuit het "Meer"-menu bereikbaar zijn — gebruikt om de
// Meer-tab zelf als actief te markeren wanneer je op zo'n pagina bent.
const MEER_ROUTE_PREFIXES = [
  "/app/profiel",
  "/app/abonnement",
  "/app/facturen",
  "/app/schema",
  "/app/pt",
  "/app/support",
];

interface MemberNavProps {
  firstName: string;
  role: Role;
  eligibleForSchema: boolean;
  eligibleForPt: boolean;
}

function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function isMeerActive(pathname: string): boolean {
  return MEER_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function MemberNav({
  firstName,
  role,
  eligibleForSchema,
  eligibleForPt,
}: MemberNavProps) {
  const pathname = usePathname();
  const meerActive = isMeerActive(pathname);

  return (
    <>
      {/* Desktop top-nav */}
      <header className="hidden md:block sticky top-0 z-40 bg-bg/95 backdrop-blur-sm border-b border-[color:var(--ink-500)]/60">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link
              href="/app"
              className="font-[family-name:var(--font-playfair)] text-xl text-text hover:text-accent transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)]"
            >
              The Movement Club
            </Link>

            <nav
              aria-label="Hoofdnavigatie"
              className="flex items-center gap-1"
            >
              {FIXED_ITEMS.map((item) => {
                const active = isItemActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${
                      active
                        ? "text-accent"
                        : "text-text-muted hover:text-text"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <MemberMoreMenu
                align="down"
                eligibleForSchema={eligibleForSchema}
                eligibleForPt={eligibleForPt}
                triggerClassName={`px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] cursor-pointer ${
                  meerActive
                    ? "text-accent"
                    : "text-text-muted hover:text-text"
                }`}
              >
                {/* COPY: confirm met Marlon */}
                Meer
              </MemberMoreMenu>
            </nav>

            <AvatarDropdown
              firstName={firstName}
              role={role}
              activeContext="member"
            />
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar — altijd exact 5 tabs, zie FIXED_ITEMS. */}
      <nav
        aria-label="Hoofdnavigatie"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-bg/95 backdrop-blur-sm border-t border-[color:var(--ink-500)]/60 safe-bottom"
      >
        <ul className="grid grid-cols-5">
          {FIXED_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(pathname, item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 py-3 text-[10px] font-medium uppercase tracking-[0.14em] transition-colors duration-300 ${
                    active ? "text-accent" : "text-text-muted"
                  }`}
                >
                  <Icon size={18} strokeWidth={1.5} aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <MemberMoreMenu
              align="up"
              eligibleForSchema={eligibleForSchema}
              eligibleForPt={eligibleForPt}
              triggerClassName={`w-full flex flex-col items-center gap-1 py-3 text-[10px] font-medium uppercase tracking-[0.14em] transition-colors duration-300 cursor-pointer ${
                meerActive ? "text-accent" : "text-text-muted"
              }`}
            >
              <MoreHorizontal size={18} strokeWidth={1.5} aria-hidden />
              {/* COPY: confirm met Marlon */}
              Meer
            </MemberMoreMenu>
          </li>
        </ul>
      </nav>
    </>
  );
}
