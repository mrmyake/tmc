"use client";

import { useState, useTransition } from "react";
import { Copy } from "lucide-react";
import { AdminField, AdminSelect } from "@/components/ui/AdminField";
import { formatEuro } from "@/lib/crowdfunding-helpers";
import {
  createPaymentRequest,
  type CreatePaymentRequestInput,
} from "@/lib/admin/payment-request-actions";
import type { CustomerProfile } from "@/lib/admin/customer-core";

const TTL_OPTIONS = [
  { days: 1, label: "1 dag" },
  { days: 3, label: "3 dagen" },
  { days: 7, label: "7 dagen" },
  { days: 14, label: "14 dagen" },
];

export interface OrderPayload {
  slug: string;
  extendedAccess: boolean;
  commit24m: boolean;
  waiveSignupFee: boolean;
}

interface VerstuurStapProps {
  customer: CustomerProfile;
  productLabel: string;
  /**
   * Preview-bedrag, alleen voor weergave vóór verzenden. Komt uit
   * computeBreakdown (ongewijzigd, abonnement/lib.ts) in het bovenliggende
   * BetaalverzoekWizard.tsx, waar bij een geactiveerde waiver de fee als
   * triviale boolean-override op nul gezet is (exact wat admin_create_order
   * ook doet als er geen Early-Member-waiver actief is -- die is hier altijd
   * uit). Het bedrag NA verzenden komt uitsluitend uit createPaymentRequest's
   * eigen firstChargeCents, nooit uit deze preview.
   */
  previewAmountCents: number;
  order: OrderPayload;
  onBack: () => void;
  onRestart: () => void;
}

export function VerstuurStap({
  customer,
  productLabel,
  previewAmountCents,
  order,
  onBack,
  onRestart,
}: VerstuurStapProps) {
  const [ttlDays, setTtlDays] = useState(7);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{
    payUrl: string;
    expiresAt: string;
    emailSent: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  function submit() {
    setError(null);
    startTransition(async () => {
      const input: CreatePaymentRequestInput = {
        profileId: customer.id,
        slug: order.slug,
        extendedAccess: order.extendedAccess,
        commit24m: order.commit24m,
        waiveSignupFee: order.waiveSignupFee,
        expiresInDays: ttlDays,
      };
      const res = await createPaymentRequest(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSent({
        payUrl: res.payUrl,
        expiresAt: res.expiresAt,
        emailSent: res.emailSent,
      });
    });
  }

  async function copyLink() {
    if (!sent) return;
    try {
      await navigator.clipboard.writeText(sent.payUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Klembord-toegang kan geweigerd zijn (permissions/http); de link
      // staat gewoon leesbaar in het veld om handmatig te selecteren.
    }
  }

  if (sent) {
    const expiresLabel = new Intl.DateTimeFormat("nl-NL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(sent.expiresAt));

    return (
      <div className="bg-bg-elevated border border-[color:var(--ink-500)] p-6">
        <div className="flex gap-4 items-start p-4 border border-[color:var(--success)]/40 mb-6">
          <span
            aria-hidden
            className="w-8 h-8 rounded-full bg-[color:var(--success)] text-bg flex items-center justify-center shrink-0 text-sm"
          >
            ✓
          </span>
          <div>
            {/* COPY: confirm met Marlon */}
            <div className="font-[family-name:var(--font-playfair)] text-base text-text">
              Betaallink verstuurd naar {customer.firstName}
            </div>
            <div className="text-text-muted text-sm mt-1">
              {sent.emailSent
                ? // COPY: confirm met Marlon
                  `De e-mail met de betaallink is verstuurd naar ${customer.email}. Je kunt de link ook zelf kopiëren en bijvoorbeeld via WhatsApp sturen.`
                : // COPY: confirm met Marlon
                  "Dit profiel heeft geen e-mailadres, er is geen mail verstuurd. Kopieer de link hieronder en deel hem zelf."}
            </div>
          </div>
        </div>

        <AdminField label="Betaallink (kopieer en deel)">
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={sent.payUrl}
              className="flex-1 bg-bg border border-[color:var(--ink-500)] px-4 py-3 text-xs text-text-muted focus:outline-none"
            />
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-2 border border-text text-text text-xs font-medium uppercase tracking-[0.14em] px-4 py-3 hover:bg-text hover:text-bg transition-colors cursor-pointer"
            >
              <Copy size={14} strokeWidth={1.5} aria-hidden />
              {/* COPY: confirm met Marlon */}
              {copied ? "Gekopieerd" : "Kopieer"}
            </button>
          </div>
        </AdminField>

        <div className="flex items-center gap-3 mt-5 text-sm text-text-muted">
          <span className="text-[11px] uppercase tracking-[0.1em] text-accent border border-accent/40 px-2.5 py-1">
            {/* COPY: confirm met Marlon */}
            Wacht op betaling
          </span>
          {/* COPY: confirm met Marlon */}
          <span>Verloopt op {expiresLabel}.</span>
        </div>

        <button
          type="button"
          onClick={onRestart}
          className="mt-6 text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-accent transition-colors cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          Nog een betaalverzoek maken
        </button>
      </div>
    );
  }

  return (
    <div className="bg-bg-elevated border border-[color:var(--ink-500)] p-6">
      <h2 className="font-[family-name:var(--font-playfair)] text-xl text-text mb-1">
        Overzicht en versturen
      </h2>
      {/* COPY: confirm met Marlon */}
      <p className="text-text-muted text-sm mb-5">
        Controleer, kies hoe lang de link geldig is, en verstuur.
      </p>

      <div className="flex justify-between gap-4 py-2.5 text-sm">
        {/* COPY: confirm met Marlon */}
        <span className="text-text-muted">Klant</span>
        <span className="text-text text-right">
          {customer.firstName} {customer.lastName} · {customer.email}
        </span>
      </div>
      <div className="flex justify-between gap-4 py-2.5 text-sm">
        {/* COPY: confirm met Marlon */}
        <span className="text-text-muted">Product</span>
        <span className="text-text text-right">{productLabel}</span>
      </div>
      <div className="flex justify-between gap-4 py-3 mt-1 border-t border-[color:var(--ink-500)] text-base font-medium">
        {/* COPY: confirm met Marlon */}
        <span className="text-text-muted">Te betalen</span>
        <span className="font-[family-name:var(--font-playfair)] text-text">
          {formatEuro(Math.round(previewAmountCents / 100))}
        </span>
      </div>

      <AdminField label="Betaallink geldig" className="mt-5 max-w-[220px]">
        <AdminSelect
          value={ttlDays}
          onChange={(e) => setTtlDays(Number(e.target.value))}
        >
          {TTL_OPTIONS.map((opt) => (
            <option key={opt.days} value={opt.days}>
              {opt.label}
            </option>
          ))}
        </AdminSelect>
      </AdminField>

      {error && (
        <div
          role="alert"
          className="mt-5 p-4 border border-[color:var(--danger)]/40 text-sm text-[color:var(--danger)]"
        >
          {error}
        </div>
      )}

      <div className="flex justify-between gap-3 mt-6">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted hover:text-text transition-colors px-5 py-3 cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          Terug
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {/* COPY: confirm met Marlon */}
          {pending ? "Bezig..." : "Betaallink aanmaken en e-mailen"}
        </button>
      </div>
    </div>
  );
}
