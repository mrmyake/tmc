"use client";

import { calculatePtPriceCents, formatPriceEuro, type PtTier } from "@/lib/member/pt-pricing";

export interface TrainerOption {
  id: string;
  slug: string;
  displayName: string;
  bio: string | null;
  tier: PtTier;
  avatarUrl: string | null;
}

interface TrainerStepProps {
  trainers: TrainerOption[];
  hasIntakeDiscountAvailable: boolean;
  selectedId: string | null;
  onSelect: (trainerId: string) => void;
}

export function TrainerStep({
  trainers,
  hasIntakeDiscountAvailable,
  selectedId,
  onSelect,
}: TrainerStepProps) {
  return (
    <section aria-labelledby="trainer-step-title">
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
        Stap 01 · Trainer
      </span>
      <h2
        id="trainer-step-title"
        className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl text-text leading-[1.05] tracking-[-0.02em] mb-4"
      >
        Met wie train je?
      </h2>
      <p className="text-text-muted text-base leading-relaxed max-w-xl mb-10">
        Drie trainers, allemaal met een eigen specialiteit. Marlon is head
        trainer en werkt op premium-tarief.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {trainers.map((t) => {
          const isSelected = selectedId === t.id;
          const isMarlon = t.tier === "premium";
          const isIntake =
            hasIntakeDiscountAvailable && !isMarlon;
          const regularPrice = calculatePtPriceCents({
            tier: t.tier,
            format: "one_on_one",
            purchaseType: "single",
            memberHasActiveSub: false,
            isIntakeSession: false,
          });
          const effectivePrice = isIntake
            ? calculatePtPriceCents({
                tier: t.tier,
                format: "one_on_one",
                purchaseType: "single",
                memberHasActiveSub: false,
                isIntakeSession: true,
              })
            : regularPrice;

          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              aria-pressed={isSelected}
              className={`text-left bg-bg-elevated p-6 md:p-7 border transition-colors duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] cursor-pointer ${
                isSelected
                  ? "border-accent"
                  : isMarlon
                    ? "border-accent/40 hover:border-accent"
                    : "border-transparent hover:border-accent/40"
              }`}
            >
              {isMarlon && (
                <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">
                  Head trainer
                </span>
              )}
              <h3 className="font-[family-name:var(--font-playfair)] text-2xl text-text leading-[1.05] tracking-[-0.02em] mb-3">
                {t.displayName}
              </h3>
              {t.bio && (
                <p className="text-text-muted text-sm leading-relaxed mb-6 line-clamp-3">
                  {t.bio}
                </p>
              )}
              <div className="pt-4 border-t border-[color:var(--ink-500)]/60 flex items-baseline gap-3">
                {isIntake ? (
                  <>
                    <span className="font-[family-name:var(--font-playfair)] text-2xl text-accent tracking-[-0.02em]">
                      {formatPriceEuro(effectivePrice)}
                    </span>
                    <span className="text-xs text-text-muted line-through">
                      {formatPriceEuro(regularPrice)}
                    </span>
                    <span className="tmc-eyebrow ml-auto">Intake</span>
                  </>
                ) : (
                  <>
                    <span className="font-[family-name:var(--font-playfair)] text-2xl text-text tracking-[-0.02em]">
                      {formatPriceEuro(effectivePrice)}
                    </span>
                    <span className="text-xs text-text-muted">
                      · 1-op-1 sessie
                    </span>
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {hasIntakeDiscountAvailable && (
        <p className="mt-6 text-text-muted text-xs">
          Intake-korting: 50% op je eerste 1-op-1 sessie bij een standaard
          trainer, eenmalig per account.
        </p>
      )}
    </section>
  );
}
