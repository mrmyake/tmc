import { Button } from "@/components/ui/Button";
import type { DashboardCreditCard } from "../_lib/dashboard-data";

function CreditDots({ dots }: { dots: boolean[] }) {
  if (dots.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-5 mb-6">
      {dots.map((filled, i) => (
        <span
          key={i}
          aria-hidden
          className={`w-3 h-3 rounded-full ${
            filled ? "bg-accent" : "border border-text-muted/30"
          }`}
        />
      ))}
    </div>
  );
}

function CreditCard({ card }: { card: DashboardCreditCard }) {
  return (
    <div className="bg-bg-elevated rounded-lg p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="tmc-eyebrow tmc-eyebrow--accent block mb-1">
            {card.typeSub}
          </span>
          <p className="text-text text-sm">{card.typeName}</p>
        </div>
        <p className="font-[family-name:var(--font-playfair)] text-3xl text-text leading-none whitespace-nowrap">
          {card.remaining}
          <span className="text-text-muted text-lg"> / {card.total}</span>
        </p>
      </div>

      <CreditDots dots={card.dots} />

      {card.nudgeText && (
        <p className="text-text-muted text-sm leading-relaxed mb-6">
          {card.nudgeText}
        </p>
      )}

      <Button href="/app/producten" variant="secondary" className="w-full justify-center">
        {card.buttonLabel}
      </Button>

      <p className="mt-5 text-text-muted/70 text-xs text-center">
        {card.validityText}
      </p>
    </div>
  );
}

export function DashboardCredits({
  credits,
}: {
  credits: DashboardCreditCard[];
}) {
  if (credits.length === 0) return null;

  return (
    <section className="mb-10 md:mb-14">
      {/* COPY: akkoord Marlon 2026-07-12 */}
      <h2 className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
        Jouw tegoed
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {credits.map((card) => (
          <CreditCard key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
}
