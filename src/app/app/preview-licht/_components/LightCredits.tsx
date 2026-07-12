import Link from "next/link";
import type { DashboardCreditCard } from "../../_lib/dashboard-data";

function CreditDots({ dots }: { dots: boolean[] }) {
  if (dots.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 my-4">
      {dots.map((filled, i) => (
        <span
          key={i}
          aria-hidden
          className={`w-[15px] h-[15px] rounded-full border-[1.5px] border-[#D9C6A8] ${
            filled ? "bg-[#B9986A]" : "bg-transparent"
          }`}
        />
      ))}
    </div>
  );
}

function CreditCard({ card }: { card: DashboardCreditCard }) {
  return (
    <div className="bg-[#0E0C0B] text-[#F4EFE6] rounded-[14px] p-[18px]">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-[12px] text-[#D9C6A8] tracking-[0.02em]">
            {card.typeSub}
          </p>
          <p className="text-[10px] uppercase tracking-[0.1em] text-[rgba(244,239,230,0.5)] mt-0.5">
            {card.typeName}
          </p>
        </div>
        <div className="text-right">
          <p className="font-[family-name:var(--font-playfair)] font-medium text-[38px] leading-none">
            {card.remaining}
            <small className="text-[18px] text-[rgba(244,239,230,0.5)]"> / {card.total}</small>
          </p>
        </div>
      </div>

      <CreditDots dots={card.dots} />

      {card.nudgeText && (
        <p className="text-[11.5px] text-[#D9C6A8] leading-[1.4] mb-3">
          {card.nudgeText}
        </p>
      )}

      <Link
        href="/app/producten"
        className="block w-full text-center rounded-[10px] bg-[#B9986A] text-[#0E0C0B] py-[11px] font-medium text-[13.5px] hover:bg-[#D9C6A8] transition-colors duration-300"
      >
        {card.buttonLabel}
      </Link>

      <p className="mt-2.5 text-[10.5px] text-[rgba(244,239,230,0.4)] text-center">
        {card.validityText}
      </p>
    </div>
  );
}

export function LightCredits({ credits }: { credits: DashboardCreditCard[] }) {
  if (credits.length === 0) return null;

  return (
    <section>
      {/* COPY: akkoord Marlon 2026-07-12 */}
      <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-[rgba(14,12,11,0.40)] mb-4">
        Jouw tegoed
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {credits.map((card) => (
          <CreditCard key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
}
