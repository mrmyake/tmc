import { PILLAR_LABELS, type Pillar } from "@/lib/member/plan-coverage";

interface PlanBenefitsListProps {
  includes: string[];
  coveredPillars: string[];
  frequencyCap: number | null;
}

export function PlanBenefitsList({
  includes,
  coveredPillars,
  frequencyCap,
}: PlanBenefitsListProps) {
  const pillarLabels = coveredPillars.map(
    (p) => PILLAR_LABELS[p as Pillar] ?? p,
  );
  const lines = [
    ...includes,
    ...(frequencyCap !== null
      ? [`Tot ${frequencyCap} sessies per week`]
      : []),
    ...(pillarLabels.length > 0
      ? [`Toegang tot ${pillarLabels.join(", ")}`]
      : []),
  ];

  if (lines.length === 0) return null;

  return (
    <section aria-labelledby="plan-benefits-title">
      <h3 id="plan-benefits-title" className="tmc-eyebrow block mb-5">
        Wat zit erin
      </h3>
      <ul className="border-y border-[color:var(--ink-500)]/60 divide-y divide-[color:var(--ink-500)]/60">
        {lines.map((line, i) => (
          <li
            key={`${i}-${line}`}
            className="py-3.5 flex items-baseline gap-5"
          >
            <span className="tmc-eyebrow text-text-muted/70 shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-text text-sm leading-relaxed">{line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
