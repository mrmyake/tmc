"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";

interface FilterChipsProps {
  pillars: Pillar[];
}

export function FilterChips({ pillars }: FilterChipsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("pijler");

  function select(pillar: string | null) {
    const next = new URLSearchParams(searchParams);
    if (pillar) next.set("pijler", pillar);
    else next.delete("pijler");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const chipBase =
    "px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] border transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)]";
  const chipActive = "border-accent text-accent bg-accent/10";
  const chipIdle =
    "border-text-muted/30 text-text-muted hover:border-accent hover:text-accent";

  return (
    <div
      role="tablist"
      aria-label="Filter op discipline"
      className="flex flex-wrap items-center gap-2"
    >
      <span className="tmc-eyebrow mr-2 hidden md:inline">Discipline</span>
      <button
        type="button"
        role="tab"
        aria-selected={!active}
        onClick={() => select(null)}
        className={`${chipBase} ${!active ? chipActive : chipIdle}`}
      >
        Alles
      </button>
      {pillars.map((pillar) => {
        const isActive = active === pillar;
        return (
          <button
            key={pillar}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => select(pillar)}
            className={`${chipBase} ${isActive ? chipActive : chipIdle}`}
          >
            {PILLAR_LABELS[pillar]}
          </button>
        );
      })}
    </div>
  );
}
