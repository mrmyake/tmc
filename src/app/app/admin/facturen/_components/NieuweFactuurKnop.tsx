"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createManualInvoice } from "@/lib/admin/invoice-actions";
import { searchMembersForInvoice } from "@/lib/admin/invoice-search";

/**
 * Handmatige factuur zonder betaling (9.2): kies een lid, start een
 * concept. De UI waarschuwt dat zo'n factuur buiten de omzetrapportage
 * valt (die leest payments), precies zoals 9.2 voorschrijft.
 */
export function NieuweFactuurKnop() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string; email: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function search(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    startTransition(async () => {
      const r = await searchMembersForInvoice(q.trim());
      setResults(r);
    });
  }

  function pick(profileId: string) {
    setError(null);
    startTransition(async () => {
      const result = await createManualInvoice(profileId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/app/admin/facturen/${result.invoiceId}`);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-2 border border-accent text-accent text-xs uppercase tracking-[0.16em] hover:bg-accent hover:text-bg transition-colors"
      >
        {/* COPY: confirm met Marlon */}
        Nieuwe factuur
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 min-w-64">
      {/* COPY: confirm met Marlon */}
      <p className="text-text-muted text-xs max-w-xs">
        Handmatige factuur zonder betaling. Let op: deze verschijnt niet in
        de omzetrapportage, die leest betalingen.
      </p>
      <input
        autoFocus
        value={query}
        onChange={(e) => search(e.target.value)}
        // COPY: confirm met Marlon
        placeholder="Zoek lid op naam of e-mail…"
        className="bg-bg-elevated border border-[color:var(--ink-500)]/60 px-3 py-2 text-sm text-text"
      />
      {results.map((r) => (
        <button
          key={r.id}
          type="button"
          disabled={isPending}
          onClick={() => pick(r.id)}
          className="text-left text-sm text-text hover:text-accent px-1 py-0.5 disabled:opacity-50"
        >
          {r.name} <span className="text-text-muted text-xs">{r.email}</span>
        </button>
      ))}
      {error && <p className="text-[color:var(--danger)] text-xs">{error}</p>}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-text-muted text-xs text-left"
      >
        Annuleren
      </button>
    </div>
  );
}
