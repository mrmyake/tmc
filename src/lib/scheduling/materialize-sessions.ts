import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  amsterdamDayOfWeek,
  amsterdamYmd,
  toIsoDate,
  zonedWallClockToUtc,
} from "./amsterdam-time";

/**
 * Vastgelegde beslissing (rapport-trainingsbeheer.md): materialisatiehorizon
 * voor series is 4 weken. Gedeeld tussen de dagelijkse cron
 * (src/app/api/cron/generate-sessions/route.ts) en de serie-server-actions
 * (src/lib/admin/series-actions.ts) zodat een net aangemaakte of gewijzigde
 * serie identiek materialiseert aan wat de cron de volgende nacht zou doen.
 */
export const MATERIALIZATION_HORIZON_DAYS = 28;

export interface TemplateForMaterialization {
  id: string;
  class_type_id: string;
  trainer_id: string;
  day_of_week: number;
  start_time: string; // "06:30:00"
  duration_minutes: number;
  /** NULL betekent onbeperkt (alleen kettlebell). */
  capacity: number | null;
  valid_from: string; // ISO date
  valid_until: string | null;
  blocks_free_training: boolean;
  class_type: { pillar: string; age_category: string } | null;
}

export interface MaterializeResult {
  attempts: number;
  errors: number;
}

/**
 * Materialiseert class_sessions-rijen voor de gegeven templates over
 * `horizonDays` vanaf `fromDate` (default: nu). Idempotent via
 * upsert(onConflict: template_id,start_at, ignoreDuplicates: true) — een
 * herhaalde aanroep (of de dagelijkse cron erna) maakt nooit duplicaten.
 */
export async function materializeSessionsForTemplates(
  admin: SupabaseClient,
  templates: TemplateForMaterialization[],
  opts: { horizonDays: number; fromDate?: Date },
): Promise<MaterializeResult> {
  const fromDate = opts.fromDate ?? new Date();
  let attempts = 0;
  let errors = 0;

  for (let offset = 0; offset < opts.horizonDays; offset++) {
    const target = new Date(fromDate.getTime() + offset * 86_400_000);
    const targetIso = toIsoDate(target);
    const targetDow = amsterdamDayOfWeek(target);
    const dayYmd = amsterdamYmd(target);

    for (const tpl of templates) {
      if (tpl.day_of_week !== targetDow) continue;
      if (tpl.valid_from > targetIso) continue;
      if (tpl.valid_until && tpl.valid_until < targetIso) continue;
      if (!tpl.class_type) continue;

      const [hStr, mStr] = tpl.start_time.split(":");
      const h = Number(hStr);
      const m = Number(mStr);
      if (!Number.isFinite(h) || !Number.isFinite(m)) continue;

      const startUtc = zonedWallClockToUtc(
        dayYmd.year,
        dayYmd.month,
        dayYmd.day,
        h,
        m,
      );
      const endUtc = new Date(
        startUtc.getTime() + tpl.duration_minutes * 60_000,
      );

      const { error: upErr } = await admin.from("class_sessions").upsert(
        {
          class_type_id: tpl.class_type_id,
          trainer_id: tpl.trainer_id,
          template_id: tpl.id,
          pillar: tpl.class_type.pillar,
          age_category: tpl.class_type.age_category,
          start_at: startUtc.toISOString(),
          end_at: endUtc.toISOString(),
          capacity: tpl.capacity,
          blocks_free_training: tpl.blocks_free_training,
          status: "scheduled",
        },
        { onConflict: "template_id,start_at", ignoreDuplicates: true },
      );

      if (upErr) {
        errors++;
        console.error(
          "[materializeSessionsForTemplates] upsert failed",
          tpl.id,
          targetIso,
          upErr,
        );
      } else {
        // upsert with ignoreDuplicates doesn't tell us if a row was actually
        // inserted. We treat errors==0 as "insert or already-exists".
        attempts++;
      }
    }
  }

  return { attempts, errors };
}
