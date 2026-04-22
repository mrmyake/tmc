"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Calendar, Users, User, Settings, Menu, X, Pause } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const NAV: NavItem[] = [
  { href: "/app/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/admin/rooster", label: "Rooster", icon: Calendar },
  { href: "/app/admin/leden", label: "Leden", icon: Users },
  { href: "/app/admin/pauzes", label: "Pauzes", icon: Pause },
  { href: "/app/admin/trainers", label: "Trainers", icon: User },
  { href: "/app/admin/instellingen", label: "Instellingen", icon: Settings },
];

interface AdminSidebarProps {
  firstName: string;
}

export function AdminSidebar({ firstName }: AdminSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href: string): boolean {
    if (href === "/app/admin") return pathname === "/app/admin";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
      {/* Mobile/tablet toggle — hidden on desktop where the sidebar is always visible */}
      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? "Sluit menu" : "Open menu"}
        aria-expanded={mobileOpen}
        className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 flex items-center justify-center bg-bg-elevated border border-[color:var(--ink-500)] text-text"
      >
        {mobileOpen ? <X size={18} strokeWidth={1.5} /> : <Menu size={18} strokeWidth={1.5} />}
      </button>

      {/* Backdrop on mobile */}
      {mobileOpen && (
        <button
          aria-label="Sluit menu"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden fixed inset-0 z-30 bg-bg/55 backdrop-blur-sm"
        />
      )}

      <aside
        aria-label="Admin navigatie"
        className={`fixed lg:static top-0 left-0 bottom-0 w-64 lg:w-60 bg-bg border-r border-[color:var(--ink-500)] flex flex-col z-40 transition-transform duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="px-6 pt-8 pb-10 border-b border-[color:var(--ink-500)]">
          <Link
            href="/app/admin"
            className="flex items-center gap-3"
            onClick={() => setMobileOpen(false)}
          >
            <span
              aria-hidden
              className="font-[family-name:var(--font-playfair)] text-xs tracking-[0.12em] border border-accent/40 text-accent px-2 py-0.5"
            >
              TMC
            </span>
            <span className="tmc-eyebrow">Admin</span>
          </Link>
        </div>

        <nav className="flex-1 px-4 py-6 flex flex-col gap-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
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
        </nav>

        <div className="px-6 py-6 border-t border-[color:var(--ink-500)]">
          <span className="tmc-eyebrow block mb-1.5">Ingelogd als</span>
          <p className="text-text text-sm">{firstName}</p>
          <Link
            href="/app"
            className="mt-3 inline-block text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent transition-colors"
          >
            Naar member-app
          </Link>
        </div>
      </aside>
    </>
  );
}
