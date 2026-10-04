"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search, X } from "lucide-react";
import type { TrialRequestStatusFilter } from "@/lib/admin/trial-requests-query";
import {
  TRIAL_REQUEST_STATUSES,
  TRIAL_REQUEST_STATUS_LABEL,
} from "@/lib/trial-requests/status";

// COPY: confirm met Marlon
const FILTER_LABEL: Record<"open" | "all", string> = {
  open: "Nieuw en benaderd",
  all: "Alles",
};

interface ProeflessenToolbarProps {
  status: TrialRequestStatusFilter;
  q: string;
}

/**
 * Zelfde opzet als ProefcodesToolbar: zoekveld en statusfilter als
 * URL-params. Zonder param geldt "open" (new plus contacted).
 */
export function ProeflessenToolbar({ status, q }: ProeflessenToolbarProps) {
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
    router.push(`/app/admin/proeflessen?${next.toString()}`);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    pushWith({ q: query.trim() || null });
  }

  const hasFilters = Boolean(q) || status !== "open";

  return (
    <div className="flex flex-col gap-4 mb-8">
      <form onSubmit={submitSearch} className="relative">
        <label htmlFor="proeflessen-search" className="sr-only">
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
          id="proeflessen-search"
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

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2">
          {/* COPY: confirm met Marlon */}
          <span className="tmc-eyebrow">Status</span>
          <select
            value={status}
            onChange={(e) =>
              pushWith({ status: e.target.value === "open" ? null : e.target.value })
            }
            className="bg-bg-elevated border border-[color:var(--ink-500)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-text focus:outline-none focus:border-accent cursor-pointer"
          >
            <option value="open">{FILTER_LABEL.open}</option>
            {TRIAL_REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TRIAL_REQUEST_STATUS_LABEL[s]}
              </option>
            ))}
            <option value="all">{FILTER_LABEL.all}</option>
          </select>
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
