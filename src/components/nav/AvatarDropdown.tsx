"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, User } from "lucide-react";
import { signOut } from "@/lib/actions/auth";

/**
 * Role-aware avatar dropdown. Gebruikt in MemberNav, TrainerNav en
 * AdminHeader. Toont de context-switcher alleen als de user daadwerkelijk
 * naar een andere context mag + niet al in die context zit.
 *
 * Role-model: single-string `profiles.role` (member/trainer/admin).
 * Admin is een superset (heeft ook toegang tot trainer- en rooster-
 * views). Niet-admins hebben geen switcher.
 */

export type Role = "member" | "trainer" | "admin";
export type ActiveContext = "member" | "trainer" | "admin";

interface AvatarDropdownProps {
  firstName: string;
  role: Role;
  activeContext: ActiveContext;
  /**
   * Optioneel: overschrijf label (niet gebruikt voor switcher-logic).
   * Handig als de admin-header het anders wil labelen.
   */
  labelOverride?: string;
}

interface SwitchTarget {
  label: string;
  href: string;
}

function targetsFor(role: Role, active: ActiveContext): SwitchTarget[] {
  // Alleen admin heeft toegang tot meerdere contexts. Trainer-only en
  // member-only zien geen switcher.
  if (role !== "admin") return [];
  const all: Record<ActiveContext, SwitchTarget> = {
    admin: { label: "Admin cockpit", href: "/app/admin" },
    trainer: { label: "Trainer view", href: "/app/trainer/sessies" },
    member: { label: "Member view", href: "/app/rooster" },
  };
  return (["admin", "trainer", "member"] as ActiveContext[])
    .filter((ctx) => ctx !== active)
    .map((ctx) => all[ctx]);
}

export function AvatarDropdown({
  firstName,
  role,
  activeContext,
  labelOverride,
}: AvatarDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const switchTargets = targetsFor(role, activeContext);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] cursor-pointer"
      >
        <span className="text-text-muted">
          {labelOverride ?? "Hoi,"}{" "}
          <span className="text-text">{firstName}</span>
        </span>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          aria-hidden
          className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-3 min-w-[240px] bg-bg-elevated border border-[color:var(--ink-500)] text-text shadow-xl animate-tab-in z-50"
        >
          <Link
            href="/app/profiel"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-5 py-3.5 text-sm text-text-muted hover:text-accent hover:bg-bg/40 transition-colors duration-300"
          >
            <User size={14} strokeWidth={1.5} aria-hidden />
            Mijn profiel
          </Link>

          {switchTargets.length > 0 && (
            <>
              <div className="border-t border-[color:var(--ink-500)]/60" />
              <div className="px-5 pt-3 pb-1 tmc-eyebrow text-text-muted/80">
                Schakel naar
              </div>
              {switchTargets.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="block px-5 py-3 text-sm text-text-muted hover:text-accent hover:bg-bg/40 transition-colors duration-300"
                >
                  {t.label}
                </Link>
              ))}
            </>
          )}

          <div className="border-t border-[color:var(--ink-500)]/60" />
          <form action={signOut}>
            <button
              type="submit"
              role="menuitem"
              className="w-full flex items-center gap-3 px-5 py-3.5 text-sm text-text-muted hover:text-accent hover:bg-bg/40 transition-colors duration-300 cursor-pointer"
            >
              <LogOut size={14} strokeWidth={1.5} aria-hidden />
              Uitloggen
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
