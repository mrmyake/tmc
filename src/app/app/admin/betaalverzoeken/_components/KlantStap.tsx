"use client";

import { useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { AdminField, AdminInput } from "@/components/ui/AdminField";
import {
  searchCustomers,
  findOrCreateCustomer,
  type CustomerSearchRow,
} from "@/lib/admin/customer-actions";
import type { CustomerProfile } from "@/lib/admin/customer-core";

interface KlantStapProps {
  onSelect: (profile: CustomerProfile) => void;
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
 * WS-5 PR C, stap 1. searchCustomers en findOrCreateCustomer (PR B) blijven
 * de bron van waarheid; deze stap spiegelt alleen hun regels client-side
 * zodat een admin niet per ongeluk kan proberen een duplicaat te maken.
 *
 * De "geen dubbele klant"-blokkade is dus een UX-vangrail, geen vervanging:
 * findOrCreateCustomer kan altijd nog een bestaand profiel teruggeven i.p.v.
 * aanmaken (race, of een adres dat de zoekactie net miste), en dat resultaat
 * wordt hier als "deze klant bestaat al" getoond, niet als foutmelding.
 */
export function KlantStap({ onSelect }: KlantStapProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerSearchRow[]>([]);
  const [searching, startSearch] = useTransition();

  const [showNewForm, setShowNewForm] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [emailRepeat, setEmailRepeat] = useState("");
  const [creating, startCreate] = useTransition();
  const [createError, setCreateError] = useState<string | null>(null);
  const [foundExisting, setFoundExisting] = useState<CustomerProfile | null>(
    null,
  );

  // Debounced search, zelfde patroon als de tablet-zoekfunctie in
  // checkin/_components/AdminPanel.tsx.
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

  const emailNormalized = email.trim().toLowerCase();
  const emailRepeatNormalized = emailRepeat.trim().toLowerCase();
  // Client-side spiegel van de server-side dubbel-invoer-eis in
  // findOrCreateCustomerCore: pas actief bij exacte, genormaliseerde match.
  const emailsMatch =
    emailNormalized.length > 0 && emailNormalized === emailRepeatNormalized;
  const canCreate =
    firstName.trim().length > 0 && lastName.trim().length > 0 && emailsMatch;

  function submitNewCustomer() {
    setCreateError(null);
    setFoundExisting(null);
    startCreate(async () => {
      const res = await findOrCreateCustomer({
        firstName,
        lastName,
        email,
        emailRepeat,
      });
      if (!res.ok) {
        setCreateError(res.error);
        return;
      }
      if (!res.created) {
        // Server vond een bestaand profiel op dit e-mailadres: geen
        // duplicaat gemaakt. Toon dat als resultaat, geen foutstaat.
        setFoundExisting(res.profile);
        return;
      }
      onSelect(res.profile);
    });
  }

  return (
    <div className="bg-bg-elevated border border-[color:var(--ink-500)] p-6">
      <h2 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-1">
        Zoek een klant
      </h2>
      {/* COPY: confirm met Marlon */}
      <p className="text-text-muted text-sm mb-5">
        De meeste klanten hebben al zelf een account. Zoek op naam, e-mail of
        telefoon.
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

      {searching && (
        <p className="text-text-muted text-xs mt-3">Zoeken...</p>
      )}

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

      {!showNewForm && (
        <button
          type="button"
          onClick={() => setShowNewForm(true)}
          className="inline-flex items-center gap-2 text-sm text-text font-medium px-4 py-3 border border-dashed border-[color:var(--ink-500)] hover:border-accent hover:text-accent transition-colors cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          + Nieuwe klant aanmaken
        </button>
      )}

      {showNewForm && (
        <div>
          {/* COPY: confirm met Marlon */}
          <p className="text-text-muted text-xs mb-4">
            Alleen nodig voor iemand die nog geen account heeft, bijvoorbeeld
            een walk-in. Naam en e-mail volstaan om een betaallink te sturen.
          </p>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <AdminField label="Voornaam">
              <AdminInput
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </AdminField>
            <AdminField label="Achternaam">
              <AdminInput
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </AdminField>
          </div>

          <AdminField label="E-mail" className="mb-4">
            <AdminInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </AdminField>

          <AdminField
            label="E-mail (nogmaals)"
            className="mb-1"
            // COPY: confirm met Marlon
            hint="Moet exact overeenkomen, ter voorkoming van een tikfout naar andermans adres."
            error={
              email && emailRepeat && !emailsMatch
                ? // COPY: confirm met Marlon
                  "Komt niet overeen met het eerste e-mailadres."
                : undefined
            }
          >
            <AdminInput
              type="email"
              value={emailRepeat}
              onChange={(e) => setEmailRepeat(e.target.value)}
            />
          </AdminField>

          {foundExisting && (
            // COPY: confirm met Marlon
            <div
              role="status"
              className="mt-4 p-4 border border-accent/40 text-sm text-text"
            >
              Deze klant bestaat al: {foundExisting.firstName}{" "}
              {foundExisting.lastName} ({foundExisting.email}).
              <button
                type="button"
                onClick={() => onSelect(foundExisting)}
                className="block mt-2 text-accent underline underline-offset-4"
              >
                Verder met deze klant
              </button>
            </div>
          )}

          {createError && (
            <div
              role="alert"
              className="mt-4 p-4 border border-[color:var(--danger)]/40 text-sm text-[color:var(--danger)]"
            >
              {createError}
            </div>
          )}

          <div className="mt-5">
            <button
              type="button"
              onClick={submitNewCustomer}
              disabled={!canCreate || creating}
              className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {/* COPY: confirm met Marlon */}
              {creating ? "Bezig..." : "Klant aanmaken"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
