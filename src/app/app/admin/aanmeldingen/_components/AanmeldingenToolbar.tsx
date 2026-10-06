"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search, X } from "lucide-react";
import {
  SIGNUP_STATUS_LABEL,
  type SignupSource,
  type SignupStatus,
} from "@/lib/email-signups/status";

interface AanmeldingenToolbarProps {
  q: string;
  source: string;
  status: SignupStatus | "all";
  showHidden: boolean;
  sources: SignupSource[];
}

const STATUSES = Object.keys(SIGNUP_STATUS_LABEL) as SignupStatus[];

/**
 * Zelfde opzet als de toolbars van proefcodes en proeflessen: zoekveld,
 * bron- en statusfilter en de toggle voor afgemelde adressen als
 * URL-params (q, bron, status, afgemeld).
 */
export function AanmeldingenToolbar({
  q,
  source,
  status,
  showHidden,
  sources,
}: AanmeldingenToolbarProps) {
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
    router.push(qs ? `/app/admin/aanmeldingen?${qs}` : "/app/admin/aanmeldingen");
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    pushWith({ q: query.trim() || null });
  }

  const hasFilters = Boolean(q) || source !== "all" || status !== "all" || showHidden;

  return (
    <div className="flex flex-col gap-4 mb-8">
      <form onSubmit={submitSearch} className="relative">
        <label htmlFor="aanmeldingen-search" className="sr-only">
          {/* COPY: confirm met Marlon */}
          Zoek op e-mail of naam
        </label>
        <Search
          size={16}
          strokeWidth={1.5}
          aria-hidden
          className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          id="aanmeldingen-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // COPY: confirm met Marlon
          placeholder="Zoek op e-mail of naam"
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
          <span className="tmc-eyebrow">Bron</span>
          <select
            value={source}
            onChange={(e) => pushWith({ bron: e.target.value === "all" ? null : e.target.value })}
            className="bg-bg-elevated border border-[color:var(--ink-500)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-text focus:outline-none focus:border-accent cursor-pointer"
          >
            {/* COPY: confirm met Marlon */}
            <option value="all">Alle bronnen</option>
            {sources.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-2">
          {/* COPY: confirm met Marlon */}
          <span className="tmc-eyebrow">Status</span>
          <select
            value={status}
            onChange={(e) => pushWith({ status: e.target.value === "all" ? null : e.target.value })}
            className="bg-bg-elevated border border-[color:var(--ink-500)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-text focus:outline-none focus:border-accent cursor-pointer"
          >
            {/* COPY: confirm met Marlon */}
            <option value="all">Alle statussen</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {SIGNUP_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => pushWith({ afgemeld: e.target.checked ? "1" : null })}
            className="accent-[color:var(--accent)] cursor-pointer"
          />
          {/* COPY: confirm met Marlon */}
          <span className="tmc-eyebrow">Toon afgemeld</span>
        </label>
        {hasFilters && (
          <Link
            href="/app/admin/aanmeldingen"
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
