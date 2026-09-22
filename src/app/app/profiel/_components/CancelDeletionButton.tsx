"use client";

import { useState, useTransition } from "react";
import { cancelAccountDeletion } from "@/lib/actions/account-deletion";

/**
 * Intrekken van een verwijderverzoek zolang de sluiting nog op de
 * einddatum van het abonnement wacht. Daarna is het lid geband en komt
 * deze knop niet meer in beeld.
 */
export function CancelDeletionButton({ className = "" }: { className?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const r = await cancelAccountDeletion();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Harde navigatie zodat de server components de nieuwe staat tonen.
      window.location.assign("/app/profiel");
    });
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] border border-text-muted/30 text-text transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:border-accent hover:text-accent disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
      >
        {/* COPY: confirm met Marlon */}
        {pending ? "Bezig..." : "Verzoek intrekken"}
      </button>
      {error && (
        <p role="alert" className="text-[color:var(--danger)] text-sm mt-3">
          {error}
        </p>
      )}
    </div>
  );
}
