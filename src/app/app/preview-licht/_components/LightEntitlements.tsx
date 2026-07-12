import Link from "next/link";
import type {
  EntitlementRow,
  EntitlementUpsell,
} from "../../_components/DashboardEntitlements";

interface LightEntitlementsProps {
  rows: EntitlementRow[];
  upsell: EntitlementUpsell | null;
}

export function LightEntitlements({ rows, upsell }: LightEntitlementsProps) {
  if (rows.length === 0 && !upsell) return null;

  return (
    <section>
      {/* COPY: akkoord Marlon 2026-07-12 */}
      <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-[rgba(14,12,11,0.40)] mb-4">
        In jouw lidmaatschap
      </h2>
      <div className="bg-white border border-[rgba(14,12,11,0.10)] rounded-[14px] overflow-hidden">
        {rows.map((row) => (
          <div
            key={row.title}
            className="flex items-baseline justify-between gap-3 px-4 py-3.5 border-b border-[rgba(14,12,11,0.10)] last:border-b-0"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-[14px] tracking-[0.01em] text-[#0E0C0B]">
                {row.title}
              </span>
              <span className="text-[12px] text-[rgba(14,12,11,0.60)]">
                {row.description}
              </span>
            </div>
            <span className="text-[12px] text-[#0E0C0B] font-medium whitespace-nowrap pl-3.5">
              {row.value}
            </span>
          </div>
        ))}
        {upsell && (
          <Link
            href={upsell.href}
            className="flex items-baseline justify-between gap-3 px-4 py-3.5 bg-[#F4EFE6] border-t border-[rgba(14,12,11,0.10)] hover:bg-[#EAE2D4] transition-colors duration-300"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-[14px] text-[#0E0C0B]">
                {upsell.title}
              </span>
              <span className="text-[12px] text-[rgba(14,12,11,0.60)]">
                {upsell.description}
              </span>
            </div>
            <span className="text-[12px] text-[#B9986A] font-semibold whitespace-nowrap pl-3.5">
              {upsell.cta} →
            </span>
          </Link>
        )}
      </div>
    </section>
  );
}
