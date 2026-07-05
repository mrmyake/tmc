import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/cron-auth";
import { toIsoDate } from "@/lib/scheduling/amsterdam-time";
import {
  materializeSessionsForTemplates,
  MATERIALIZATION_HORIZON_DAYS,
  type TemplateForMaterialization,
} from "@/lib/scheduling/materialize-sessions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const admin = createAdminClient();

  const today = new Date();
  const todayIso = toIsoDate(today);
  const horizon = new Date(
    today.getTime() + MATERIALIZATION_HORIZON_DAYS * 86_400_000,
  );
  const horizonIso = toIsoDate(horizon);

  const { data: templates, error: tErr } = await admin
    .from("schedule_templates")
    .select(
      `
        id, class_type_id, trainer_id, day_of_week, start_time,
        duration_minutes, capacity, valid_from, valid_until,
        blocks_free_training,
        class_type:class_types(pillar, age_category)
      `,
    )
    .eq("is_active", true)
    .returns<TemplateForMaterialization[]>();

  if (tErr) {
    console.error("[cron/generate-sessions] template fetch failed", tErr);
    return NextResponse.json(
      { ok: false, error: "template fetch failed" },
      { status: 500 },
    );
  }

  const { attempts, errors } = await materializeSessionsForTemplates(
    admin,
    templates ?? [],
    { horizonDays: MATERIALIZATION_HORIZON_DAYS, fromDate: today },
  );

  return NextResponse.json({
    ok: true,
    horizonDays: MATERIALIZATION_HORIZON_DAYS,
    fromDate: todayIso,
    toDate: horizonIso,
    templatesProcessed: templates?.length ?? 0,
    attempts,
    errors,
  });
}
