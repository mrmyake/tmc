"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  CalendarDays,
  CalendarPlus,
  Home,
  UserCircle,
} from "lucide-react";
import { TRAINER_HOME, TRAINER_LANDING } from "@/lib/auth/safe-next";
import { AvatarDropdown, type Role } from "./AvatarDropdown";

interface NavItem {
  href: string;
  label: string;
  labelMobile?: string;
  icon: typeof CalendarDays;
  /** Alleen zichtbaar voor admins en PT-trainers (fix/trainer-pt-scope). */
  pt?: boolean;
  /** Alleen zichtbaar als de PT-items verborgen zijn. */
  nonPtOnly?: boolean;
  /** Alleen actief op exact dit pad (voor de Home-tab). */
  exact?: boolean;
}

// PT-agenda PR D: Agenda toegevoegd als primaire trainer-landing-tab.
// PT-agenda PR C3 bouwde /app/trainer/boeken al maar liet 'm nav-loos
// (bewust, buiten C3-scope); Boeken hier meenemen sluit dat gat.
// fix/trainer-pt-scope: Agenda en Boeken zijn PT-ingangen en verschijnen
// alleen voor admins en PT-trainers. Een trainer zonder PT krijgt in plaats
// daarvan een Home-tab naar de trainer-home (eigen lessen, uren).
const ITEMS: NavItem[] = [
  {
    href: TRAINER_HOME,
    label: "Home",
    icon: Home,
    nonPtOnly: true,
    exact: true,
  },
  {
    href: TRAINER_LANDING,
    label: "Agenda",
    icon: Calendar,
    pt: true,
  },
  {
    href: "/app/trainer/boeken",
    label: "Boeken",
    icon: CalendarPlus,
    pt: true,
  },
  {
    href: "/app/trainer/sessies",
    label: "Mijn sessies",
    labelMobile: "Sessies",
    icon: CalendarDays,
  },
  {
    href: "/app/profiel",
    label: "Profiel",
    icon: UserCircle,
  },
];

interface TrainerNavProps {
  firstName: string;
  role: Role;
  /** Admin of PT-trainer: toont Agenda en Boeken, logo naar de agenda. */
  ptTrainer: boolean;
}

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function TrainerNav({ firstName, role, ptTrainer }: TrainerNavProps) {
  const pathname = usePathname();
  const items = ITEMS.filter((item) =>
    ptTrainer ? !item.nonPtOnly : !item.pt,
  );
  const logoHref = ptTrainer ? TRAINER_LANDING : TRAINER_HOME;

  return (
    <>
      {/* Desktop top nav */}
      <header className="hidden md:block sticky top-0 z-40 bg-bg/95 backdrop-blur-sm border-b border-[color:var(--ink-500)]/60">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link
              href={logoHref}
              className="font-[family-name:var(--font-playfair)] text-xl text-text hover:text-accent transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)]"
            >
              The Movement Club
            </Link>

            <nav
              aria-label="Trainer-navigatie"
              className="flex items-center gap-1"
            >
              {items.map((item) => {
                const active = isActive(pathname, item);
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
              activeContext="trainer"
            />
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Trainer-navigatie"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-bg/95 backdrop-blur-sm border-t border-[color:var(--ink-500)]/60 safe-bottom"
      >
        <ul className={items.length === 4 ? "grid grid-cols-4" : "grid grid-cols-3"}>
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item);
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
