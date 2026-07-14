"use client";

import { useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";
import {
  searchCustomers,
  type CustomerSearchRow,
} from "@/lib/admin/customer-actions";
import type { CustomerProfile } from "@/lib/admin/customer-core";
import type { PtCreditSummary } from "@/lib/admin/pt-credit-summary";
import { formatShortDate } from "@/lib/format-date";

interface KlantPaneelProps {
  customer: CustomerProfile | null;
  creditSummary: PtCreditSummary | null;
  onSelect: (profile: CustomerProfile) => void;
  onClear: () => void;
  onSwitchToIntake: () => void;
}

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

function toCustomerProfile(row: CustomerSearchRow): CustomerProfile {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    memberCode: row.memberCode,
  };
}

/**
 * PT-agenda C2, linkerkolom: zoek een bestaande klant (hergebruikt
 * searchCustomers, zelfde patroon als KlantStap.tsx in de
 * betaalverzoeken-wizard) en toon het PT/duo-tegoedsaldo. Marlon zet dit
 * saldo in bij het boeken met credits; het is hier puur informatief.
 */
export function KlantPaneel({
  customer,
  creditSummary,
  onSelect,
  onClear,
  onSwitchToIntake,
}: KlantPaneelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerSearchRow[]>([]);
  const [searching, startSearch] = useTransition();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      startSearch(async () => {
        const rows = await searchCustomers(q);
        setResults(rows);
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  if (customer) {
    return (
      <div className="bg-bg-elevated border border-[color:var(--ink-500)] p-6">
        <span className="tmc-eyebrow block mb-4">Klant</span>
        <div className="flex items-center gap-3 mb-5">
          <span
            aria-hidden
            className="w-10 h-10 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm font-medium shrink-0"
          >
            {initials(customer.firstName, customer.lastName)}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-text text-base truncate">
              {customer.firstName} {customer.lastName}
            </span>
            <span className="block text-text-muted text-xs truncate">
              {customer.email}
            </span>
          </span>
        </div>

        <div className="border-t border-[color:var(--ink-500)]/60 pt-4">
          {/* COPY: confirm met Marlon */}
          <span className="tmc-eyebrow block mb-2">PT-tegoed</span>
          {!creditSummary ? (
            <p className="text-text-muted text-sm">Laden...</p>
          ) : !creditSummary.pt && !creditSummary.duo ? (
            // COPY: confirm met Marlon
            <p className="text-text-muted text-sm">
              Geen PT-tegoed bij deze klant.
            </p>
          ) : (
            <dl className="flex flex-col gap-2 text-sm">
              {creditSummary.pt && (
                <div className="flex items-center justify-between">
                  {/* COPY: confirm met Marlon */}
                  <dt className="text-text-muted">1-op-1</dt>
                  <dd className="text-text">
                    {creditSummary.pt.creditsRemaining}{" "}
                    {creditSummary.pt.creditsRemaining === 1 ? "credit" : "credits"}
                    {creditSummary.pt.expiresAt && (
                      <span className="text-text-muted">
                        {" "}
                        · tot {formatShortDate(new Date(creditSummary.pt.expiresAt))}
                      </span>
                    )}
                  </dd>
                </div>
              )}
              {creditSummary.duo && (
                <div className="flex items-center justify-between">
                  {/* COPY: confirm met Marlon */}
                  <dt className="text-text-muted">Duo</dt>
                  <dd className="text-text">
                    {creditSummary.duo.creditsRemaining}{" "}
                    {creditSummary.duo.creditsRemaining === 1 ? "credit" : "credits"}
                    {creditSummary.duo.expiresAt && (
                      <span className="text-text-muted">
                        {" "}
                        · tot {formatShortDate(new Date(creditSummary.duo.expiresAt))}
                      </span>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>

        <button
          type="button"
          onClick={onClear}
          className="mt-5 text-xs font-medium uppercase tracking-[0.14em] text-text-muted hover:text-accent transition-colors cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          Andere klant kiezen
        </button>
      </div>
    );
  }

  return (
    <div className="bg-bg-elevated border border-[color:var(--ink-500)] p-6">
      <h2 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-1">
        {/* COPY: confirm met Marlon */}
        Zoek een klant
      </h2>
      <p className="text-text-muted text-sm mb-5">
        {/* COPY: confirm met Marlon */}
        Zoek op naam, e-mail of telefoon.
      </p>

      <div className="relative">
        <Search
          size={16}
          strokeWidth={1.5}
          aria-hidden
          className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek op naam, e-mail of telefoon"
          className="w-full bg-bg border border-[color:var(--ink-500)] pl-11 pr-4 py-3.5 text-sm text-text focus:outline-none focus:border-accent"
        />
      </div>

      {searching && <p className="text-text-muted text-xs mt-3">Zoeken...</p>}

      {!searching && results.length > 0 && (
        <div className="mt-3 border border-[color:var(--ink-500)] divide-y divide-[color:var(--ink-500)]">
          {results.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => onSelect(toCustomerProfile(row))}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bg transition-colors cursor-pointer"
            >
              <span
                aria-hidden
                className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-medium shrink-0"
              >
                {initials(row.firstName, row.lastName)}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-text truncate">
                  {row.firstName} {row.lastName}
                </span>
                <span className="block text-xs text-text-muted truncate">
                  {row.email}
                  {row.phone ? ` · ${row.phone}` : ""}
                </span>
              </span>
              {/* COPY: confirm met Marlon */}
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-accent shrink-0">
                Kies
              </span>
            </button>
          ))}
        </div>
      )}

      {!searching && query.trim().length >= 2 && results.length === 0 && (
        // COPY: confirm met Marlon
        <p className="text-text-muted text-xs mt-3">
          Geen klant gevonden op dit zoekwoord.
        </p>
      )}

      <div className="flex items-center gap-4 my-6">
        <span className="flex-1 h-px bg-[color:var(--ink-500)]" />
        {/* COPY: confirm met Marlon */}
        <span className="text-text-muted text-xs uppercase tracking-[0.14em]">
          of
        </span>
        <span className="flex-1 h-px bg-[color:var(--ink-500)]" />
      </div>

      <button
        type="button"
        onClick={onSwitchToIntake}
        className="inline-flex items-center gap-2 text-sm text-text font-medium px-4 py-3 border border-dashed border-[color:var(--ink-500)] hover:border-accent hover:text-accent transition-colors cursor-pointer"
      >
        {/* COPY: confirm met Marlon */}
        + Nieuwe klant zonder account (intake)
      </button>
    </div>
  );
}
