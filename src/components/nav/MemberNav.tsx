"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  ClipboardList,
  CreditCard,
  DoorOpen,
  UserCircle,
} from "lucide-react";
import { AvatarDropdown, type Role } from "./AvatarDropdown";

interface NavItem {
  href: string;
  label: string;
  /** Kortere label voor mobiele bottom-tab bar — 5 items in 4 grid-cols krap. */
  labelMobile?: string;
  icon: typeof Calendar;
  /** Pathname-prefixes die deze item als actief markeren. */
  matchPrefixes: string[];
}

const BASE_ITEMS: NavItem[] = [
  {
    href: "/app/rooster",
    label: "Rooster",
    icon: Calendar,
    matchPrefixes: ["/app/rooster", "/app"],
  },
  {
    href: "/app/boekingen",
    label: "Mijn lessen",
    labelMobile: "Lessen",
    icon: ClipboardList,
    matchPrefixes: ["/app/boekingen"],
  },
  {
    href: "/app/abonnement",
    label: "Lidmaatschap",
    labelMobile: "Abbo",
    icon: CreditCard,
    matchPrefixes: ["/app/abonnement", "/app/facturen"],
  },
  {
    href: "/app/profiel",
    label: "Profiel",
    icon: UserCircle,
    matchPrefixes: ["/app/profiel"],
  },
];

const VRIJ_TRAINEN_ITEM: NavItem = {
  href: "/app/vrij-trainen",
  label: "Vrij trainen",
  labelMobile: "Vrij",
  icon: DoorOpen,
  matchPrefixes: ["/app/vrij-trainen"],
};

interface MemberNavProps {
  firstName: string;
  role: Role;
  eligibleForVrijTrainen: boolean;
}

function isItemActive(pathname: string, item: NavItem): boolean {
  // `/app/rooster` moet ook matchen op de bare `/app` root voor het
  // geval de redirect nog niet is uitgevoerd. Andere items hebben
  // strikte prefix-matches.
  if (item.href === "/app/rooster") {
    if (pathname === "/app") return true;
  }
  return (
    pathname === item.href || pathname.startsWith(`${item.href}/`)
  );
}

export function MemberNav({
  firstName,
  role,
  eligibleForVrijTrainen,
}: MemberNavProps) {
  const pathname = usePathname();
  // Vrij trainen tussen Rooster en Mijn lessen — logisch volgorde qua
  // "booking surface". Alleen tonen als de user's plan 'vrij_trainen'
  // covert zodat we niet-eligible members niet verleiden tot klikken.
  const items: NavItem[] = eligibleForVrijTrainen
    ? [BASE_ITEMS[0], VRIJ_TRAINEN_ITEM, ...BASE_ITEMS.slice(1)]
    : BASE_ITEMS;
  const mobileGridCols = items.length === 5 ? "grid-cols-5" : "grid-cols-4";

  return (
    <>
      {/* Desktop top-nav */}
      <header className="hidden md:block sticky top-0 z-40 bg-bg/95 backdrop-blur-sm border-b border-[color:var(--ink-500)]/60">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link
              href="/app/rooster"
              className="font-[family-name:var(--font-playfair)] text-xl text-text hover:text-accent transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)]"
            >
              The Movement Club
            </Link>

            <nav
              aria-label="Hoofdnavigatie"
              className="flex items-center gap-1"
            >
              {items.map((item) => {
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
            </nav>

            <AvatarDropdown
              firstName={firstName}
              role={role}
              activeContext="member"
            />
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Hoofdnavigatie"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-bg/95 backdrop-blur-sm border-t border-[color:var(--ink-500)]/60 safe-bottom"
      >
        <ul className={`grid ${mobileGridCols}`}>
          {items.map((item) => {
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
                  {item.labelMobile ?? item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
