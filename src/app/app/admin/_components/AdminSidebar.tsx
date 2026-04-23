"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Users,
  User,
  Settings,
  Megaphone,
  Pause,
  ExternalLink,
} from "lucide-react";

type IconType = typeof LayoutDashboard;

interface NavItem {
  href: string;
  label: string;
  icon: IconType;
}

interface ExternalItem {
  href: string;
  label: string;
  icon: IconType;
  external: true;
}

/**
 * Sidebar per spec §3.4: bovenin dagelijks gebruik (Dashboard, Rooster,
 * Leden, Trainers), daarna horizontal rule, daaronder secondary items.
 * Pauzes + Aankondigingen + Instellingen zijn bestaande, werkende
 * features — die blijven in de secondary sectie. Rapportage is nog
 * niet gebouwd en staat niet in de sidebar (spec: "don't add empty
 * shell now"). Content↗ opent /studio in nieuw tabblad.
 */
const DAILY: NavItem[] = [
  { href: "/app/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/admin/rooster", label: "Rooster", icon: Calendar },
  { href: "/app/admin/leden", label: "Leden", icon: Users },
  { href: "/app/admin/trainers", label: "Trainers", icon: User },
];

const SECONDARY: NavItem[] = [
  { href: "/app/admin/pauzes", label: "Pauzes", icon: Pause },
  {
    href: "/app/admin/aankondigingen",
    label: "Aankondigingen",
    icon: Megaphone,
  },
  { href: "/app/admin/instellingen", label: "Instellingen", icon: Settings },
];

const EXTERNAL: ExternalItem[] = [
  { href: "/studio", label: "Content", icon: ExternalLink, external: true },
];

export function AdminSidebar() {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/app/admin") return pathname === "/app/admin";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside
      aria-label="Admin navigatie"
      className="w-60 bg-bg border-r border-[color:var(--ink-500)] flex flex-col shrink-0"
    >
      <nav className="flex-1 px-4 pt-6 flex flex-col gap-1">
        {DAILY.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center gap-3 px-4 py-3 text-sm transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${
                active
                  ? "bg-bg-elevated text-text"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-2 bottom-2 w-px bg-accent"
                />
              )}
              <Icon size={16} strokeWidth={1.5} aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        })}

        <div
          aria-hidden
          className="my-4 mx-4 h-px bg-[color:var(--ink-500)]/60"
        />

        {SECONDARY.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center gap-3 px-4 py-3 text-sm transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${
                active
                  ? "bg-bg-elevated text-text"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-2 bottom-2 w-px bg-accent"
                />
              )}
              <Icon size={16} strokeWidth={1.5} aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {EXTERNAL.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-text-muted hover:text-text transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)]"
            >
              <span>{item.label}</span>
              <Icon size={14} strokeWidth={1.5} aria-hidden />
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
