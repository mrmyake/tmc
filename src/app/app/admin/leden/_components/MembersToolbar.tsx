"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import type { MemberSort, MemberStatus } from "@/lib/admin/members-query";

interface MembersToolbarProps {
  q: string;
  status: MemberStatus | "all";
  plan: string;
  inactive: boolean;
  sort: MemberSort;
}

const STATUS_LABEL: Record<MemberStatus | "all", string> = {
  all: "Alle statussen",
  active: "Actief",
  paused: "Gepauzeerd",
  cancellation_requested: "Opzegverzoek",
  cancelled: "Opgezegd",
  expired: "Verlopen",
  payment_failed: "Betaling gefaald",
  pending: "In afwachting",
  none: "Geen abonnement",
};

const PLAN_LABEL: Record<string, string> = {
  all: "Alle abbo's",
  vrij_trainen: "Vrij trainen",
  yoga_mobility: "Yoga & mobility",
  kettlebell: "Kettlebell",
  all_inclusive: "All-inclusive",
  ten_ride_card: "10-rittenkaart",
  pt_package: "PT-pakket",
  twelve_week_program: "12-weken programma",
  kids: "Kids",
  senior: "Senior",
};

export function MembersToolbar({
  q,
  status,
  plan,
  inactive,
  sort,
}: MembersToolbarProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const [query, setQuery] = useState(q);

  // Keep input in sync when the URL changes externally (back/forward).
  useEffect(() => {
    setQuery(q);
  }, [q]);

  function pushWith(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    // Any filter change returns to page 1.
    if (!("page" in patch)) next.delete("page");
    // Preserve sort always.
    if (sort) next.set("sort", sort);
    router.push(`/app/admin/leden?${next.toString()}`);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    pushWith({ q: query.trim() || null });
  }

  function resetAll() {
    router.push("/app/admin/leden");
  }

  const hasFilters =
    Boolean(q) || status !== "all" || plan !== "all" || inactive;

  return (
    <div className="flex flex-col gap-4 mb-8">
      <form onSubmit={submitSearch} className="relative">
        <label htmlFor="members-search" className="sr-only">
          Zoek op naam of email
        </label>
        <Search
          size={16}
          strokeWidth={1.5}
          aria-hidden
          className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          id="members-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek op naam of email"
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

      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Status"
          value={status}
          options={Object.entries(STATUS_LABEL)}
          onChange={(v) => pushWith({ status: v === "all" ? null : v })}
        />
        <FilterSelect
          label="Abonnement"
          value={plan}
          options={Object.entries(PLAN_LABEL)}
          onChange={(v) => pushWith({ plan: v === "all" ? null : v })}
        />
        <button
          type="button"
          onClick={() => pushWith({ inactive: inactive ? null : "1" })}
          aria-pressed={inactive}
          className={`inline-flex items-center gap-2 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.18em] border transition-colors duration-300 cursor-pointer ${
            inactive
              ? "border-accent text-accent"
              : "border-text-muted/30 text-text-muted hover:border-accent hover:text-accent"
          }`}
        >
          <span
            aria-hidden
            className={`w-1.5 h-1.5 rounded-full ${
              inactive ? "bg-accent" : "bg-text-muted"
            }`}
          />
          Inactief &gt; 30 dagen
        </button>
        {hasFilters && (
          <Link
            href="/app/admin/leden"
            onClick={(e) => {
              e.preventDefault();
              resetAll();
            }}
            className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent transition-colors"
          >
            Reset filters
          </Link>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <span className="tmc-eyebrow">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-bg-elevated border border-[color:var(--ink-500)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-text focus:outline-none focus:border-accent cursor-pointer"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
