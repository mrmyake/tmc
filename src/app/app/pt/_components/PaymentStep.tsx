"use client";

import { formatPriceEuro } from "@/lib/member/pt-pricing";

export type PtPaymentMethod = "pay" | "credits";

interface PaymentStepProps {
  priceCents: number;
  creditsRemaining: number | null;
  selected: PtPaymentMethod | null;
  onSelect: (method: PtPaymentMethod) => void;
}

export function PaymentStep({
  priceCents,
  creditsRemaining,
  selected,
  onSelect,
}: PaymentStepProps) {
  const hasCredits = creditsRemaining !== null && creditsRemaining > 0;

  return (
    <section aria-labelledby="payment-step-title">
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
        Stap 02 · Betaling
      </span>
      <h2
        id="payment-step-title"
        className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text leading-[1.05] tracking-[-0.02em] mb-4"
      >
        Hoe wil je betalen?
      </h2>
      <p className="text-text-muted text-base leading-relaxed max-w-xl mb-10">
        {hasCredits
          ? "Je hebt nog credits op je PT-pakket. Boek daaruit, of betaal per sessie."
          : "Betaal deze sessie via iDEAL of creditcard."}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <OptionCard
          active={selected === "pay"}
          onClick={() => onSelect("pay")}
          eyebrow="Enkele sessie"
          title={formatPriceEuro(priceCents)}
          subtitle="Eenmalige betaling via Mollie"
        />
        {hasCredits && (
          <OptionCard
            active={selected === "credits"}
            onClick={() => onSelect("credits")}
            eyebrow="Uit je PT-pakket"
            title={`${creditsRemaining} credits over`}
            subtitle="Direct geboekt, geen extra kosten"
            tone="accent"
          />
        )}
      </div>

      {!hasCredits && (
        <p className="mt-6 text-text-muted text-xs max-w-md">
          Koop je vaker PT? Een 10-sessies pakket levert 10% lidkorting op —
          dat regel je via Abonnement.
        </p>
      )}
    </section>
  );
}

function OptionCard({
  active,
  onClick,
  eyebrow,
  title,
  subtitle,
  tone = "default",
}: {
  active: boolean;
  onClick: () => void;
  eyebrow: string;
  title: string;
  subtitle: string;
  tone?: "default" | "accent";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-left bg-bg-elevated p-7 border transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] cursor-pointer ${
        active
          ? "border-accent"
          : tone === "accent"
            ? "border-accent/40 hover:border-accent"
            : "border-transparent hover:border-accent/40"
      }`}
    >
      <span className="tmc-eyebrow block mb-4">{eyebrow}</span>
      <p className="font-[family-name:var(--font-playfair)] text-3xl text-text leading-none tracking-[-0.02em] mb-3">
        {title}
      </p>
      <p className="text-text-muted text-sm">{subtitle}</p>
    </button>
  );
}
