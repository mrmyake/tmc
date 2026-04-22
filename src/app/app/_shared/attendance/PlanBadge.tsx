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

const PLAN_TONE: Record<string, string> = {
  vrij_trainen: "bg-[color:var(--stone-500)]",
  yoga_mobility: "bg-accent",
  kettlebell: "bg-[color:var(--warning)]",
  all_inclusive: "bg-accent",
  kids: "bg-[color:var(--success)]",
  senior: "bg-[color:var(--stone-600)]",
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
  const tone = PLAN_TONE[planType] ?? "bg-text-muted";

  return (
    <span className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-text">
      <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${tone}`} />
      {label}
      {planVariant && (
        <span className="text-text-muted normal-case tracking-normal">
          · {planVariant}
        </span>
      )}
    </span>
  );
}
