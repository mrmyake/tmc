/**
 * Rules for how many guest passes a member gets per billing cycle.
 * The rules are based on `plan_type` + `frequency_cap` because our
 * schema doesn't encode "2x/3x/unlimited" as distinct plan types —
 * it's a single plan_type with a cap integer (or NULL for unlimited).
 *
 * Confirmed with Marlon:
 * - Vrij trainen: 0
 * - Yoga/mobility 2-3x per week: 1
 * - Yoga/mobility unlimited: 2
 * - Kettlebell: 1 (single variant)
 * - All-inclusive 2-3x: 1
 * - All-inclusive unlimited ("All Access"): 2
 * - kids / senior / ten_ride_card / pt_package / twelve_week_program: 0
 */

export interface PlanIdentity {
  planType: string | null;
  frequencyCap: number | null;
  status: string;
}

export function allocationFor(plan: PlanIdentity): number {
  if (plan.status !== "active" && plan.status !== "paused") return 0;
  const unlimited = plan.frequencyCap == null;
  switch (plan.planType) {
    case "yoga_mobility":
      return unlimited ? 2 : 1;
    case "kettlebell":
      return 1;
    case "all_inclusive":
      return unlimited ? 2 : 1;
    case "vrij_trainen":
    case "kids":
    case "senior":
    case "ten_ride_card":
    case "pt_package":
    case "twelve_week_program":
    default:
      return 0;
  }
}

/**
 * For a membership that started on `startDate` with a cycle of
 * `cycleWeeks`, returns the `[start, end)` period that contains `ref`.
 * End is exclusive so `period_end > current_date` covers the full
 * final day via SQL comparison.
 */
export function currentPeriod(
  startDate: string,
  cycleWeeks: number,
  ref: Date = new Date(),
): { periodStart: string; periodEnd: string } {
  const cycleMs = cycleWeeks * 7 * 86_400_000;
  const start = new Date(`${startDate}T00:00:00Z`);
  const refMs = ref.getTime();
  // How many cycles have elapsed since start.
  const elapsed = Math.max(0, refMs - start.getTime());
  const index = Math.floor(elapsed / cycleMs);
  const periodStartMs = start.getTime() + index * cycleMs;
  const periodEndMs = periodStartMs + cycleMs;
  return {
    periodStart: new Date(periodStartMs).toISOString().slice(0, 10),
    periodEnd: new Date(periodEndMs).toISOString().slice(0, 10),
  };
}

/** Default billing cycle in weeks when membership data is incomplete. */
export const DEFAULT_CYCLE_WEEKS = 4;

/** Max times the same guest may attend within a rolling window. */
export const GUEST_VISIT_WINDOW_MONTHS = 3;
export const GUEST_VISIT_MAX_WITHIN_WINDOW = 2;
