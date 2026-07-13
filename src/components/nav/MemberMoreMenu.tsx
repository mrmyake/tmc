"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  UserCircle,
  CreditCard,
  Dumbbell,
  Target,
  LifeBuoy,
  ExternalLink,
} from "lucide-react";

interface MemberMoreMenuProps {
  /** "down" voor de desktop top-nav (paneel opent onder de trigger), "up"
   * voor de mobiele bottom-tab-bar (paneel opent erboven, de balk zelf
   * staat fixed onderaan). */
  align: "up" | "down";
  eligibleForSchema: boolean;
  eligibleForPt: boolean;
  triggerClassName: string;
  children: React.ReactNode;
}

const ITEM_CLASS =
  "flex items-center gap-3 px-5 py-3.5 text-sm text-text-muted hover:text-accent hover:bg-bg/40 transition-colors duration-300";

/**
 * "Meer"-overloopmenu voor MemberNav (nav-cleanup): huisvest de items die
 * niet meer in de vaste 5-tab-balk passen (Profiel, Account en
 * instellingen, Schema, PT, Support, plus een link terug naar de
 * marketingsite). Zelfde interactiepatroon en styling als AvatarDropdown
 * (klik-buiten/Escape sluit, zelfde paneel-look) — bewust geen nieuwe stijl.
 */
export function MemberMoreMenu({
  align,
  eligibleForSchema,
  eligibleForPt,
  triggerClassName,
  children,
}: MemberMoreMenuProps) {
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

  const panelPosition =
    align === "up" ? "bottom-full right-0 mb-3" : "top-full right-0 mt-3";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={triggerClassName}
      >
        {children}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute ${panelPosition} min-w-[240px] bg-bg-elevated border border-[color:var(--ink-500)] text-text shadow-xl animate-tab-in z-50`}
        >
          <Link
            href="/app/profiel"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={ITEM_CLASS}
          >
            <UserCircle size={14} strokeWidth={1.5} aria-hidden />
            Profiel
          </Link>
          <Link
            href="/app/abonnement"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={ITEM_CLASS}
          >
            <CreditCard size={14} strokeWidth={1.5} aria-hidden />
            {/* COPY: confirm met Marlon */}
            Account en instellingen
          </Link>
          {eligibleForSchema && (
            <Link
              href="/app/schema"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={ITEM_CLASS}
            >
              <Dumbbell size={14} strokeWidth={1.5} aria-hidden />
              Schema
            </Link>
          )}
          {eligibleForPt && (
            <Link
              href="/app/pt"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={ITEM_CLASS}
            >
              <Target size={14} strokeWidth={1.5} aria-hidden />
              {/* COPY: confirm met Marlon */}
              PT
            </Link>
          )}
          <Link
            href="/app/support"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={ITEM_CLASS}
          >
            <LifeBuoy size={14} strokeWidth={1.5} aria-hidden />
            Support
          </Link>
          <div className="border-t border-[color:var(--ink-500)]/60" />
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={`${ITEM_CLASS} justify-between`}
          >
            {/* COPY: confirm met Marlon */}
            <span>themovementclub.nl</span>
            <ExternalLink size={14} strokeWidth={1.5} aria-hidden />
          </a>
        </div>
      )}
    </div>
  );
}
