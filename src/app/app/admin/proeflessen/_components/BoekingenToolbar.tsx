"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search, X } from "lucide-react";
import type { TrialBookingPeriod } from "@/lib/admin/trial-bookings-query";

// COPY: confirm met Marlon
const PERIOD_LABEL: Record<TrialBookingPeriod, string> = {
  upcoming: "Komend",
  past: "Afgelopen",
  all: "Alles",
};

const PERIODS: TrialBookingPeriod[] = ["upcoming", "past", "all"];

interface BoekingenToolbarProps {
  period: TrialBookingPeriod;
  q: string;
  showCancelled: boolean;
}

/**
 * Zelfde opzet als ProeflessenToolbar: zoekveld, periode en de toggle voor
 * geannuleerde boekingen als URL-params (q, periode, geannuleerd). Zonder
 * params geldt Komend zonder annuleringen.
 */
export function BoekingenToolbar({ period, q, showCancelled }: BoekingenToolbarProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const [query, setQuery] = useState(q);
  // Nieuwe searchParam van buiten (reset-link, terugknop): lokale invoer
  // meenemen zonder effect (react.dev: state afleiden tijdens de render).
  const [syncedQ, setSyncedQ] = useState(q);
  if (syncedQ !== q) {
    setSyncedQ(q);
    setQuery(q);
  }

  function pushWith(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.push(qs ? `/app/admin/proeflessen?${qs}` : "/app/admin/proeflessen");
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    pushWith({ q: query.trim() || null });
  }

  const hasFilters = Boolean(q) || period !== "upcoming" || showCancelled;

  return (
    <div className="flex flex-col gap-4 mb-8">
      <form onSubmit={submitSearch} className="relative">
        <label htmlFor="boekingen-search" className="sr-only">
          {/* COPY: confirm met Marlon */}
          Zoek op naam, e-mail of telefoon
        </label>
        <Search
          size={16}
          strokeWidth={1.5}
          aria-hidden
          className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          id="boekingen-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // COPY: confirm met Marlon
          placeholder="Zoek op naam, e-mail of telefoon"
          className="w-full bg-bg-elevated border border-[color:var(--ink-500)] px-12 py-3.5 text-sm text-text focus:outline-none focus:border-accent"
        />
        {query && (
          <button
            type="button"
            aria-label="Wis zoekopdracht"
            onClick={() => {
              setQuery("");
              pushWith({ q: null });
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors cursor-pointer"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="inline-flex items-center gap-2">
          {/* COPY: confirm met Marlon */}
          <span className="tmc-eyebrow">Periode</span>
          <select
            value={period}
            onChange={(e) =>
              pushWith({ periode: e.target.value === "upcoming" ? null : e.target.value })
            }
            className="bg-bg-elevated border border-[color:var(--ink-500)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-text focus:outline-none focus:border-accent cursor-pointer"
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(e) => pushWith({ geannuleerd: e.target.checked ? "1" : null })}
            className="accent-[color:var(--accent)] cursor-pointer"
          />
          {/* COPY: confirm met Marlon */}
          <span className="tmc-eyebrow">Toon geannuleerd</span>
        </label>
        {hasFilters && (
          <Link
            href="/app/admin/proeflessen"
            className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent transition-colors"
          >
            {/* COPY: confirm met Marlon */}
            Reset filters
          </Link>
        )}
      </div>
    </div>
  );
}
