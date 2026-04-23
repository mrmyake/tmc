"use client";

import Link from "next/link";
import { trackMyBookingsTabSwitch } from "@/lib/analytics";

export type BoekingenView = "komend" | "historie";

interface BoekingenTabsProps {
  active: BoekingenView;
  upcomingHref: string;
  historyHref: string;
}

const clubEase = "ease-[cubic-bezier(0.2,0.7,0.1,1)]";

function Tab({
  label,
  active,
  href,
  onClick,
  role,
}: {
  label: string;
  active: boolean;
  href: string;
  onClick: () => void;
  role: "tab";
}) {
  return (
    <Link
      href={href}
      scroll={false}
      role={role}
      aria-selected={active}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
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

export function BoekingenTabs({
  active,
  upcomingHref,
  historyHref,
}: BoekingenTabsProps) {
  return (
    <nav
      role="tablist"
      aria-label="Boekingen-weergave"
      className="flex items-center gap-10 border-b border-[color:var(--ink-500)]/50"
    >
      <Tab
        role="tab"
        label="Komend"
        active={active === "komend"}
        href={upcomingHref}
        onClick={() => trackMyBookingsTabSwitch("upcoming")}
      />
      <Tab
        role="tab"
        label="Historie"
        active={active === "historie"}
        href={historyHref}
        onClick={() => trackMyBookingsTabSwitch("history")}
      />
    </nav>
  );
}
