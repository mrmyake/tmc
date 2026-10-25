import {
  cappedPillars,
  PILLAR_LABELS,
  type Pillar,
} from "@/lib/member/plan-coverage";

interface PlanBenefitsListProps {
  includes: string[];
  coveredPillars: string[];
  frequencyCap: number | null;
}

/**
 * Regel voor de weekcap. De cap telt alleen de pillars uit cappedPillars()
 * (spec-weekcap-extra-les.md): bij een abonnement met groepslessen zijn dat
 * de groepslessen samen en is vrij trainen onbeperkt; bij Vrij Trainen 2x/3x
 * geldt de cap op vrij trainen zelf.
 */
function capLines(coveredPillars: string[], frequencyCap: number | null): string[] {
  if (frequencyCap === null) return [];
  const capped = cappedPillars(coveredPillars);
  const groupCapped = capped.some((p) => p !== "vrij_trainen");
  const vrijUncapped =
    coveredPillars.includes("vrij_trainen") && !capped.includes("vrij_trainen");
  if (groupCapped) {
    return [
      // COPY: confirm met Marlon
      `Tot ${frequencyCap} groepslessen per week`,
      // COPY: confirm met Marlon
      ...(vrijUncapped ? ["Vrij trainen onbeperkt"] : []),
    ];
  }
  // COPY: confirm met Marlon
  return [`Tot ${frequencyCap} sessies per week`];
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
    ...capLines(coveredPillars, frequencyCap),
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
