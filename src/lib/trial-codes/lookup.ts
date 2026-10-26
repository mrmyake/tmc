import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTrialCodeScope, type TrialCodeScope } from "@/lib/trial-codes/scope";
import { PROMOTED_TRIAL_CODE, type PromotedTrialCode } from "@/lib/trial-codes/promoted";

type UsableRow = {
  revoked_at: string | null;
  max_uses: number | null;
  uses_count: number;
  scope: string;
  valid_through: string | null;
};

const USABLE_SELECT = "revoked_at, max_uses, uses_count, scope, valid_through";

/** Vandaag als YYYY-MM-DD in Europe/Amsterdam; dezelfde kalenderdag als tmc.redeem_trial_code gebruikt. */
function amsterdamToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
}

/**
 * Dezelfde voorwaarden als tmc.redeem_trial_code: bestaat, niet ingetrokken,
 * niet op en de einddatum (inclusief) nog niet voorbij. Een momentopname
 * voor de weergave; de RPC beslist opnieuw onder de rijlocks.
 */
function isUsable(row: UsableRow | null): row is UsableRow {
  return (
    row !== null &&
    row.revoked_at === null &&
    (row.max_uses === null || row.uses_count < row.max_uses) &&
    (row.valid_through === null || row.valid_through >= amsterdamToday())
  );
}

async function fetchRow(code: string): Promise<UsableRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("trial_codes")
    .select(USABLE_SELECT)
    .eq("code", code)
    .maybeSingle<UsableRow>();
  if (error) {
    console.error("[trial-codes/lookup] query failed", error);
    return null;
  }
  return data;
}

/**
 * Read-only opzoeking van een (al genormaliseerde) code: de scope als de code
 * bruikbaar is, anders null. Dit is een momentopname voor de weergave (welke
 * lijst of kiezer tonen we); bij het boeken beslist tmc.redeem_trial_code
 * opnieuw onder de rijlocks. De scope komt dus altijd uit de database, nooit
 * uit het cookie of de client.
 */
export async function lookupUsableTrialCodeScope(code: string): Promise<TrialCodeScope | null> {
  const row = await fetchRow(code);
  if (!isUsable(row)) return null;
  return isTrialCodeScope(row.scope) ? row.scope : null;
}

/**
 * De code die /proefles zelf noemt (PROMOTED_TRIAL_CODE), alleen als die nu
 * bruikbaar is. Null betekent: niets tonen. Zo verdwijnt de vermelding
 * vanzelf zodra de code op, ingetrokken of verlopen is.
 */
export async function lookupPromotedTrialCode(): Promise<PromotedTrialCode | null> {
  const row = await fetchRow(PROMOTED_TRIAL_CODE);
  if (!isUsable(row)) return null;
  return { code: PROMOTED_TRIAL_CODE, validThrough: row.valid_through };
}
