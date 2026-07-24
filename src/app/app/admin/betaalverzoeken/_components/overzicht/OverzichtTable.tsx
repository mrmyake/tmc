"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import type { PaymentRequestRow } from "@/lib/admin/payment-requests-query";
import { resendPaymentRequest } from "@/lib/admin/payment-request-resend-actions";
import { cancelPaymentRequest } from "@/lib/admin/payment-request-cancel-actions";
import { AvatarBubble } from "@/app/app/_shared/attendance/AvatarBubble";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { PaymentRequestStatusBadge } from "./PaymentRequestStatusBadge";
import { formatEuro } from "@/lib/format";
import { formatShortDateWithYear } from "@/lib/format-date";

// COPY: confirm met Marlon
const BLOCKED_REASON_LABEL: Record<string, string> = {
  duplicate_membership: "Lid had via een andere order al een actief abonnement",
  product_not_supported: "Product kon niet automatisch geactiveerd worden",
};

function formatDate(iso: string): string {
  return formatShortDateWithYear(new Date(iso));
}

function AmountCell({ row }: { row: PaymentRequestRow }) {
  return (
    <div className="text-right">
      <div className="text-text tabular-nums">
        {formatEuro(Math.round(row.firstChargeCents / 100))}
      </div>
      {row.recurringCents != null && (
        <div className="text-text-muted text-xs tabular-nums">
          {/* COPY: confirm met Marlon */}
          dan {formatEuro(Math.round(row.recurringCents / 100))} per 4 weken
        </div>
      )}
    </div>
  );
}

function RowActions({ row }: { row: PaymentRequestRow }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [resendResult, setResendResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelResult, setCancelResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(row.payUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Klembord-toegang kan geweigerd zijn; de link staat leesbaar in de rij.
    }
  }

  function resend() {
    setResendResult(null);
    startTransition(async () => {
      const res = await resendPaymentRequest(row.orderId);
      if (res.ok) {
        setResendResult({
          ok: true,
          // COPY: confirm met Marlon
          message: res.emailSent
            ? `Opnieuw verstuurd naar ${row.email}.`
            : "Geen e-mailadres bekend, kopieer de link zelf.",
        });
      } else {
        setResendResult({ ok: false, message: res.error });
      }
    });
  }

  function confirmCancel() {
    setCancelResult(null);
    startTransition(async () => {
      const res = await cancelPaymentRequest(row.orderId);
      if (res.ok) {
        setCancelResult({
          ok: true,
          // COPY: confirm met Marlon
          message:
            "Het verzoek is geannuleerd. De betaallink werkt niet meer voor een nieuwe betaling.",
        });
        // Lijst verversen zodat de rij als geannuleerd verschijnt; de
        // dialoog blijft open met het resultaat en de nieuw-verzoek-link.
        router.refresh();
      } else {
        // Nette weigering, bv. net betaald: de RPC verliest de race bewust.
        setCancelResult({ ok: false, message: res.error });
      }
    });
  }

  const canCopy = row.displayStatus !== "geannuleerd";
  const canResend = row.displayStatus === "wacht_op_betaling";
  const canCancel = row.displayStatus === "wacht_op_betaling";

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {canCopy && (
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 border border-text-muted/30 text-text-muted text-[11px] font-medium uppercase tracking-[0.14em] px-3 py-2 hover:border-accent hover:text-accent transition-colors cursor-pointer"
          >
            <Copy size={12} strokeWidth={1.5} aria-hidden />
            {/* COPY: confirm met Marlon */}
            {copied ? "Gekopieerd" : "Kopieer link"}
          </button>
        )}
        {canResend && (
          <button
            type="button"
            onClick={resend}
            disabled={pending}
            className="inline-flex items-center gap-1.5 border border-accent text-accent text-[11px] font-medium uppercase tracking-[0.14em] px-3 py-2 hover:bg-accent hover:text-bg transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
          >
            {/* COPY: confirm met Marlon */}
            {pending ? "Bezig..." : "Opnieuw versturen"}
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            onClick={() => {
              setCancelResult(null);
              setCancelOpen(true);
            }}
            disabled={pending}
            className="inline-flex items-center gap-1.5 border border-[color:var(--danger)]/50 text-[color:var(--danger)] text-[11px] font-medium uppercase tracking-[0.14em] px-3 py-2 hover:bg-[color:var(--danger)]/10 transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
          >
            {/* COPY: confirm met Marlon */}
            Annuleer
          </button>
        )}
      </div>
      {resendResult && (
        <span
          role="status"
          className={`text-xs text-right max-w-[220px] ${
            resendResult.ok
              ? "text-[color:var(--success)]"
              : "text-[color:var(--danger)]"
          }`}
        >
          {resendResult.message}
        </span>
      )}

      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        // COPY: confirm met Marlon
        title="Betaalverzoek annuleren?"
        eyebrow="Betaalverzoeken"
        tone="danger"
        size="narrow"
      >
        {/* COPY: confirm met Marlon */}
        <p className="text-text-muted text-sm mb-3">
          Je annuleert het verzoek voor {row.firstName} {row.lastName} (
          {row.productLabel},{" "}
          {formatEuro(Math.round(row.firstChargeCents / 100))}). De klant kan
          er daarna niet meer mee betalen.
        </p>
        {/* COPY: confirm met Marlon */}
        <p className="text-text-muted text-xs mb-5">
          Al gestarte betalingen blijven geldig: komt er alsnog een betaling
          binnen, dan gaat die voor en wordt het verzoek gewoon geactiveerd.
        </p>
        {cancelResult?.ok ? (
          <>
            <div
              role="status"
              className="text-sm p-4 border mb-5 border-[color:var(--success)]/40 text-[color:var(--success)]"
            >
              {cancelResult.message}
            </div>
            <div className="flex justify-between items-center gap-3">
              {/* Annuleer-plus-nieuw: hetzelfde verzoek voor een ANDERE
                  klant loopt via een nieuw verzoek in de wizard, nooit via
                  een adreswissel op deze order. */}
              <Link
                href="/app/admin/betaalverzoeken"
                className="inline-flex items-center justify-center px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent hover:bg-accent-hover hover:border-accent-hover transition-colors"
              >
                {/* COPY: confirm met Marlon */}
                Nieuw verzoek maken
              </Link>
              <button
                type="button"
                onClick={() => setCancelOpen(false)}
                className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors px-5 py-3 cursor-pointer"
              >
                {/* COPY: confirm met Marlon */}
                Sluiten
              </button>
            </div>
          </>
        ) : (
          <DialogFooter
            result={cancelResult}
            onClose={() => setCancelOpen(false)}
            onConfirm={confirmCancel}
            // COPY: confirm met Marlon
            cancelLabel="Terug"
            confirmLabel={pending ? "Bezig..." : "Annuleer verzoek"}
            confirmDisabled={pending}
            confirmTone="danger"
          />
        )}
      </Dialog>
    </div>
  );
}

function CustomerCell({ row }: { row: PaymentRequestRow }) {
  return (
    <Link
      href={`/app/admin/leden/${row.profileId}`}
      className="flex items-center gap-3 group/name"
    >
      <AvatarBubble
        firstName={row.firstName}
        lastName={row.lastName}
        avatarUrl={null}
        size={32}
      />
      <span className="flex flex-col min-w-0">
        <span className="text-text text-sm font-medium truncate transition-colors duration-300 group-hover/name:text-accent">
          {row.firstName} {row.lastName}
        </span>
        <span className="text-text-muted text-xs truncate">{row.email}</span>
      </span>
    </Link>
  );
}

function StatusCell({ row }: { row: PaymentRequestRow }) {
  return (
    <div className="flex flex-col gap-1">
      <PaymentRequestStatusBadge status={row.displayStatus} />
      {row.blockedReason && (
        <span className="text-text-muted text-xs max-w-[200px]">
          {BLOCKED_REASON_LABEL[row.blockedReason] ?? row.blockedReason}
        </span>
      )}
    </div>
  );
}

interface OverzichtTableProps {
  rows: PaymentRequestRow[];
}

export function OverzichtTable({ rows }: OverzichtTableProps) {
  if (rows.length === 0) {
    return (
      <div className="py-20 text-center border-t border-[color:var(--ink-500)]/60">
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
          {/* COPY: confirm met Marlon */}
          Geen betaalverzoeken
        </span>
        <p className="text-text-muted text-sm max-w-md mx-auto">
          {/* COPY: confirm met Marlon */}
          Geen betaalverzoeken gevonden bij deze filter.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-[color:var(--ink-500)]/60">
              <th scope="col" className="py-3 pl-3 pr-4 text-left">
                {/* COPY: confirm met Marlon */}
                <span className="tmc-eyebrow">Klant</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Product</span>
              </th>
              <th scope="col" className="py-3 px-4 text-right">
                <span className="tmc-eyebrow">Bedrag</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                <span className="tmc-eyebrow">Status</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                {/* COPY: confirm met Marlon */}
                <span className="tmc-eyebrow">Aangemaakt</span>
              </th>
              <th scope="col" className="py-3 px-4 text-left">
                {/* COPY: confirm met Marlon */}
                <span className="tmc-eyebrow">Geldig tot</span>
              </th>
              <th scope="col" className="py-3 pl-4 pr-3 text-right">
                <span className="tmc-eyebrow">Acties</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.orderId}
                className="border-b border-[color:var(--ink-500)]/40 transition-colors duration-300 hover:bg-bg-elevated/60"
              >
                <td className="py-4 pl-3 pr-4 align-middle">
                  <CustomerCell row={row} />
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text">
                  {row.productLabel}
                </td>
                <td className="py-4 px-4 align-middle text-sm">
                  <AmountCell row={row} />
                </td>
                <td className="py-4 px-4 align-middle">
                  <StatusCell row={row} />
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text-muted">
                  {formatDate(row.createdAt)}
                </td>
                <td className="py-4 px-4 align-middle text-sm text-text-muted">
                  {formatDate(row.expiresAt)}
                </td>
                <td className="py-4 pl-4 pr-3 align-middle">
                  <RowActions row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="md:hidden flex flex-col border-t border-[color:var(--ink-500)]/60">
        {rows.map((row) => (
          <li
            key={row.orderId}
            className="flex flex-col gap-3 py-4 border-b border-[color:var(--ink-500)]/40"
          >
            <div className="flex items-start justify-between gap-3">
              <CustomerCell row={row} />
              <AmountCell row={row} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
              <span className="text-text">{row.productLabel}</span>
              <span>·</span>
              <span>{formatDate(row.createdAt)}</span>
              <span>·</span>
              <span>Geldig tot {formatDate(row.expiresAt)}</span>
            </div>
            <StatusCell row={row} />
            <RowActions row={row} />
          </li>
        ))}
      </ul>
    </>
  );
}
