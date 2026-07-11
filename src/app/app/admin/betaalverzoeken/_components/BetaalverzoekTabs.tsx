"use client";

import Link from "next/link";

export type BetaalverzoekTab = "nieuw" | "overzicht";

const clubEase = "ease-[cubic-bezier(0.2,0.7,0.1,1)]";

function Tab({
  label,
  active,
  href,
}: {
  label: string;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      role="tab"
      aria-selected={active}
      aria-current={active ? "page" : undefined}
      className={`group relative inline-block py-3 text-[11px] font-medium uppercase tracking-[0.2em] transition-colors duration-300 ${clubEase} ${
        active ? "text-text" : "text-text-muted"
      }`}
    >
      {label}
      <span
        aria-hidden
        className={`pointer-events-none absolute left-0 right-0 bottom-0 h-px origin-left bg-accent transition-transform duration-300 ${clubEase} ${
          active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
        }`}
      />
    </Link>
  );
}

export function BetaalverzoekTabs({ active }: { active: BetaalverzoekTab }) {
  return (
    <nav
      role="tablist"
      aria-label="Betaalverzoeken-weergave"
      className="flex items-center gap-10 border-b border-[color:var(--ink-500)]/50"
    >
      {/* COPY: confirm met Marlon */}
      <Tab
        label="Nieuw verzoek"
        active={active === "nieuw"}
        href="/app/admin/betaalverzoeken"
      />
      {/* COPY: confirm met Marlon */}
      <Tab
        label="Overzicht"
        active={active === "overzicht"}
        href="/app/admin/betaalverzoeken?tab=overzicht"
      />
    </nav>
  );
}
