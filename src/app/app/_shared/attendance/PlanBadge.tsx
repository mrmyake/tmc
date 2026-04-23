import { pillarBg } from "@/lib/tone";

const PLAN_LABEL: Record<string, string> = {
  vrij_trainen: "Vrij trainen",
  yoga_mobility: "Yoga & mobility",
  kettlebell: "Kettlebell",
  all_inclusive: "All-inclusive",
  kids: "Kids",
  senior: "Senior",
  ten_ride_card: "10-rittenkaart",
  pt_package: "PT-pakket",
  twelve_week_program: "12-weken programma",
};

// Non-pillar plan_type values map to a pillar-equivalent color for the
// dot so member-facing dots stay consistent with the rooster pillars.
const PLAN_DOT_FALLBACK: Record<string, string> = {
  all_inclusive: "bg-accent",
  ten_ride_card: "bg-text-muted",
  pt_package: "bg-accent",
  twelve_week_program: "bg-accent",
};

interface PlanBadgeProps {
  planType: string | null;
  planVariant?: string | null;
}

export function PlanBadge({ planType, planVariant }: PlanBadgeProps) {
  if (!planType) {
    return (
      <span className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted">
        <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-text-muted" />
        Drop-in
      </span>
    );
  }
  const label = PLAN_LABEL[planType] ?? planType;
  const dotClass = PLAN_DOT_FALLBACK[planType] ?? pillarBg(planType);

  return (
    <span className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-text">
      <span
        aria-hidden
        className={`w-1.5 h-1.5 rounded-full ${dotClass}`}
      />
      {label}
      {planVariant && (
        <span className="text-text-muted normal-case tracking-normal">
          · {planVariant}
        </span>
      )}
    </span>
  );
}
