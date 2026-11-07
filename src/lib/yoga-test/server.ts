import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { lookupUsableTrialCodeScope } from "@/lib/trial-codes/lookup";
import { OUTCOME_KEYS, outcomes, yogaQuiz } from "./config";
import { emptySchedule, firstName, type ScheduleByOutcome } from "./scoring";

/**
 * Server-kant van de quiz: het live rooster en de status van de proefcode.
 * Beide lezen met de service-role-client (geen anon-grants nodig, zelfde
 * patroon als /yoga/rooster) en worden 5 minuten gecachet. Geen van beide
 * verbruikt een gebruik van de code of raakt trial_code_attempts aan.
 */

const CACHE_SECONDS = 300;

type TemplateRow = {
  class_type_id: string;
  day_of_week: number;
  start_time: string;
  trainer: { display_name: string } | null;
};

/** Vandaag als YYYY-MM-DD in Europe/Amsterdam (valid_from en valid_until zijn kalenderdata). */
function amsterdamToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
}

/**
 * De wekelijkse lestijden van de zes uitkomsten: actieve schedule_templates
 * waarvan vandaag binnen valid_from en valid_until valt (leeg = onbeperkt).
 * day_of_week: 0 = zondag.
 */
async function fetchYogaSchedule(): Promise<ScheduleByOutcome> {
  const admin = createAdminClient();
  const today = amsterdamToday();
  const ids = OUTCOME_KEYS.map((k) => outcomes[k].classTypeId);
  const { data, error } = await admin
    .from("schedule_templates")
    .select("class_type_id, day_of_week, start_time, trainer:trainers(display_name)")
    .eq("is_active", true)
    .in("class_type_id", ids)
    .lte("valid_from", today)
    .or(`valid_until.is.null,valid_until.gte.${today}`)
    .returns<TemplateRow[]>();
  // Gooien (niet cachen) zodat een storing niet vijf minuten blijft hangen.
  if (error) throw new Error(`yoga-test schedule query: ${error.message}`);

  const schedule = emptySchedule();
  for (const row of data ?? []) {
    const key = OUTCOME_KEYS.find((k) => outcomes[k].classTypeId === row.class_type_id);
    if (!key) continue;
    schedule[key].push({
      day: row.day_of_week,
      time: row.start_time.slice(0, 5),
      trainerFirstName: firstName(row.trainer?.display_name),
    });
  }
  return schedule;
}

const getCachedSchedule = unstable_cache(fetchYogaSchedule, ["yoga-test-schedule"], {
  revalidate: CACHE_SECONDS,
  tags: ["yoga-test-schedule"],
});

/** Leeg rooster (en dus de "rooster wordt ingericht"-staat) zonder env of bij een fout. */
export async function getYogaSchedule(): Promise<ScheduleByOutcome> {
  if (!isAdminConfigured()) return emptySchedule();
  try {
    return await getCachedSchedule();
  } catch (err) {
    console.error("[yoga-test] rooster ophalen mislukt", err);
    return emptySchedule();
  }
}

async function fetchCodeActive(): Promise<boolean> {
  const scope = await lookupUsableTrialCodeScope(yogaQuiz.trialCode);
  return scope !== null && (yogaQuiz.usableScopes as readonly string[]).includes(scope);
}

const getCachedCodeActive = unstable_cache(fetchCodeActive, ["yoga-test-code-active"], {
  revalidate: CACHE_SECONDS,
  tags: ["yoga-test-code"],
});

/**
 * Is de quizcode nu bruikbaar (bestaat, niet ingetrokken, niet op, niet
 * verlopen, scope past)? Read-only opzoeking, geen RPC. Bestaat de code nog
 * niet of is de database onbereikbaar, dan false: de uitslag valt netjes
 * terug op de betaalde knop.
 */
export async function isYogaCodeActive(): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  try {
    return await getCachedCodeActive();
  } catch (err) {
    console.error("[yoga-test] codestatus ophalen mislukt", err);
    return false;
  }
}
