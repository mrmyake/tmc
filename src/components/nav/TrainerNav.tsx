"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, UserCircle } from "lucide-react";
import { AvatarDropdown, type Role } from "./AvatarDropdown";

interface NavItem {
  href: string;
  label: string;
  labelMobile?: string;
  icon: typeof CalendarDays;
}

const ITEMS: NavItem[] = [
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
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TrainerNav({ firstName, role }: TrainerNavProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop top nav */}
      <header className="hidden md:block sticky top-0 z-40 bg-bg/95 backdrop-blur-sm border-b border-[color:var(--ink-500)]/60">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link
              href="/app/trainer/sessies"
              className="font-[family-name:var(--font-playfair)] text-xl text-text hover:text-accent transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)]"
            >
              The Movement Club
            </Link>

            <nav
              aria-label="Trainer-navigatie"
              className="flex items-center gap-1"
            >
              {ITEMS.map((item) => {
                const active = isActive(pathname, item.href);
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
        <ul className="grid grid-cols-2">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
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
