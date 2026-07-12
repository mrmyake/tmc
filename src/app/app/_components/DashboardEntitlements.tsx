import Link from "next/link";

export interface EntitlementRow {
  title: string;
  description: string;
  value: string;
}

export interface EntitlementUpsell {
  title: string;
  description: string;
  cta: string;
  href: string;
}

interface DashboardEntitlementsProps {
  rows: EntitlementRow[];
  upsell: EntitlementUpsell | null;
}

export function DashboardEntitlements({
  rows,
  upsell,
}: DashboardEntitlementsProps) {
  if (rows.length === 0 && !upsell) return null;

  return (
    <section className="mb-10 md:mb-14">
      {/* COPY: akkoord Marlon 2026-07-12 */}
      <h2 className="tmc-eyebrow tmc-eyebrow--accent block mb-5">
        In jouw lidmaatschap
      </h2>
      <div className="bg-bg-elevated rounded-lg divide-y divide-[color:var(--ink-500)]/60 overflow-hidden">
        {rows.map((row) => (
          <div
            key={row.title}
            className="flex items-baseline justify-between gap-4 px-6 py-4"
          >
            <div>
              <p className="text-text text-sm font-medium">{row.title}</p>
              <p className="text-text-muted text-xs mt-0.5">
                {row.description}
              </p>
            </div>
            <span className="text-text text-sm whitespace-nowrap">
              {row.value}
            </span>
          </div>
        ))}
        {upsell && (
          <Link
            href={upsell.href}
            className="flex items-baseline justify-between gap-4 px-6 py-4 bg-bg/40 hover:bg-bg/70 transition-colors duration-500"
          >
            <div>
              <p className="text-text text-sm font-medium">{upsell.title}</p>
              <p className="text-text-muted text-xs mt-0.5">
                {upsell.description}
              </p>
            </div>
            <span className="text-accent text-sm font-medium whitespace-nowrap">
              {upsell.cta}
            </span>
          </Link>
        )}
      </div>
    </section>
  );
}
