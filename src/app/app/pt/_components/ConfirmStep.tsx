"use client";

import { formatTimeRange, formatWeekdayDate } from "@/lib/format-date";
import { formatPriceEuro } from "@/lib/member/pt-pricing";
import type { PtPaymentMethod } from "./PaymentStep";

interface ConfirmStepProps {
  trainerName: string;
  slotStart: string;
  slotEnd: string;
  paymentMethod: PtPaymentMethod;
  priceCents: number;
  isIntakeDiscount: boolean;
  creditsRemaining: number | null;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onBack: () => void;
}

export function ConfirmStep({
  trainerName,
  slotStart,
  slotEnd,
  paymentMethod,
  priceCents,
  isIntakeDiscount,
  creditsRemaining,
  pending,
  error,
  onConfirm,
  onBack,
}: ConfirmStepProps) {
  const start = new Date(slotStart);
  const end = new Date(slotEnd);
  const useCredits = paymentMethod === "credits";

  return (
    <section aria-labelledby="confirm-step-title">
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
        Stap 04 · Bevestigen
      </span>
      <h2
        id="confirm-step-title"
        className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text leading-[1.05] tracking-[-0.02em] mb-10"
      >
        Klopt alles?
      </h2>

      <div className="relative bg-bg-elevated p-8 md:p-10 mb-10">
        <div
          aria-hidden
          className="absolute top-0 left-10 right-10 h-px bg-accent"
        />
        <dl className="flex flex-col gap-6">
          <Row label="Trainer" value={trainerName} />
          <Row label="Format" value="1-op-1" />
          <Row
            label="Wanneer"
            value={`${formatWeekdayDate(start)} · ${formatTimeRange(start, end)}`}
          />
          {useCredits ? (
            <Row
              label="Betaling"
              value={`Uit je PT-pakket · ${creditsRemaining ?? 0} credits over`}
            />
          ) : (
            <Row
              label="Totaal"
              value={
                isIntakeDiscount
                  ? `${formatPriceEuro(priceCents)} · Intake-korting toegepast`
                  : formatPriceEuro(priceCents)
              }
              accent
            />
          )}
        </dl>
      </div>

      {error && (
        <p role="alert" className="mb-6 text-[color:var(--danger)] text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          disabled={pending}
          className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-text-muted transition-colors duration-300 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:text-text disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          Terug
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="inline-flex items-center justify-center px-7 py-3.5 text-xs font-medium uppercase tracking-[0.18em] bg-accent text-bg border border-accent transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] hover:bg-accent-hover hover:border-accent-hover active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {pending
            ? "Bezig"
            : useCredits
              ? "Boek sessie"
              : "Naar betaling"}
        </button>
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2 sm:gap-6 pb-5 border-b border-[color:var(--ink-500)]/60 last:border-b-0 last:pb-0">
      <dt className="tmc-eyebrow">{label}</dt>
      <dd
        className={`text-base ${
          accent
            ? "font-[family-name:var(--font-playfair)] text-accent text-2xl tracking-[-0.02em] leading-none"
            : "text-text"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
