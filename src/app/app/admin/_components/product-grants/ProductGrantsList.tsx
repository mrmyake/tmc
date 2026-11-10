"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { revokeProductGrant } from "@/lib/admin/product-grant-actions";
import type { ProductGrantRow } from "@/lib/product-grants/server";

/**
 * De toekenningen van een lid of een factuur, met "Intrekken" voor een
 * ongebruikte toekenning (spec-facturatie.md 9.8). Is er al tegoed verbruikt,
 * dan is er geen knop: dan is "Credits aanpassen" het pad.
 */

function dateNl(iso: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(iso));
}

/** De stand van de lijst zonder tijdstempels: wie is ingetrokken, welk saldo. */
function listKey(
  grants: Pick<ProductGrantRow, "id" | "revokedAt" | "creditsRemaining">[],
): string {
  return grants
    .map((g) => `${g.id}:${g.revokedAt ? 1 : 0}:${g.creditsRemaining ?? ""}`)
    .join("|");
}

export function ProductGrantsList({
  grants,
  showInvoice = true,
}: {
  grants: ProductGrantRow[];
  /** Op het factuurscherm is de factuur al bekend. */
  showInvoice?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // De bevestiging "Toekenning ingetrokken." is een momentopname. Hij hoort
  // bij de stand van de lijst direct na het intrekken; zodra een volgende
  // actie op de pagina de lijst verandert (of na enkele seconden) verdwijnt
  // hij. Een foutmelding blijft staan tot de volgende poging.
  const [okForKeys, setOkForKeys] = useState<string[]>([]);
  const grantsKey = listKey(grants);
  const visibleMessage =
    message && (!message.ok || okForKeys.includes(grantsKey)) ? message : null;

  if (grants.length === 0) return null;

  function runRevoke(grantId: string) {
    setMessage(null);
    startTransition(async () => {
      const res = await revokeProductGrant({ grantId, reason });
      setMessage({ ok: res.ok, text: res.message });
      if (res.ok) {
        // De stand van voor de verversing en die erna (deze rij ingetrokken).
        setOkForKeys([
          listKey(grants),
          listKey(grants.map((g) => (g.id === grantId ? { ...g, revokedAt: "x" } : g))),
        ]);
        window.setTimeout(() => setMessage((m) => (m?.ok ? null : m)), 8000);
        setRevoking(null);
        setReason("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-[color:var(--ink-500)]/60">
        {grants.map((g) => (
          <li key={g.id} className="flex flex-col gap-2 py-4">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-sm text-text">{g.displayName}</span>
              <span className="text-xs text-text-muted">
                {/* COPY: confirm met Marlon */}
                Toegekend {dateNl(g.grantedAt)}
                {g.expiresAt ? ` · geldig tot ${dateNl(g.expiresAt)}` : " · geen vervaldatum"}
              </span>
              {showInvoice && g.invoiceId && (
                <Link
                  href={`/app/admin/facturen/${g.invoiceId}`}
                  className="text-xs text-accent hover:underline"
                >
                  Factuur {g.invoiceNumber ?? ""}
                </Link>
              )}
              <span className="ml-auto text-xs uppercase tracking-[0.18em] text-text-muted">
                {/* COPY: confirm met Marlon */}
                {g.revokedAt
                  ? "Ingetrokken"
                  : `${g.creditsRemaining ?? 0} van ${g.credits} over`}
              </span>
            </div>
            <p className="text-xs text-text-muted">
              Reden: {g.reason}
              {g.duplicateOverride ? " · bewust dubbel toegekend" : ""}
              {g.revokedAt && g.revokeReason
                ? ` · ingetrokken ${dateNl(g.revokedAt)}: ${g.revokeReason}`
                : ""}
            </p>
            {g.canRevoke && revoking !== g.id && (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setRevoking(g.id);
                    setReason("");
                    setMessage(null);
                  }}
                  disabled={pending}
                  className="text-xs uppercase tracking-[0.16em] text-[color:var(--danger)] disabled:opacity-50 cursor-pointer"
                >
                  {/* COPY: confirm met Marlon */}
                  Intrekken
                </button>
              </div>
            )}
            {g.canRevoke && revoking === g.id && (
              <div className="flex flex-col gap-3 bg-bg-elevated p-4 border border-[color:var(--danger)]/40 max-w-md">
                {/* COPY: confirm met Marlon */}
                <p className="text-text text-sm">
                  Deze toekenning intrekken? Het tegoed verdwijnt bij het lid.
                  Dit kan alleen zolang er niets verbruikt is.
                </p>
                <label className="flex flex-col gap-1">
                  <span className="text-text-muted text-[10px] uppercase tracking-[0.14em]">
                    Reden
                  </span>
                  <input
                    type="text"
                    value={reason}
                    maxLength={500}
                    onChange={(e) => setReason(e.target.value)}
                    className="bg-transparent border-b border-[color:var(--ink-500)]/60 text-sm text-text py-1"
                  />
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => runRevoke(g.id)}
                    disabled={pending || !reason.trim()}
                    className="px-4 py-1.5 border border-[color:var(--danger)]/60 text-[color:var(--danger)] text-xs uppercase tracking-[0.16em] disabled:opacity-50 cursor-pointer"
                  >
                    {/* COPY: confirm met Marlon */}
                    {pending ? "Bezig" : "Ja, intrekken"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRevoking(null)}
                    className="text-text-muted text-xs uppercase tracking-[0.16em] cursor-pointer"
                  >
                    Annuleren
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {visibleMessage && (
        <p
          role={visibleMessage.ok ? "status" : "alert"}
          className={`text-sm ${visibleMessage.ok ? "text-text-muted" : "text-[color:var(--danger)]"}`}
        >
          {visibleMessage.text}
        </p>
      )}
    </div>
  );
}
