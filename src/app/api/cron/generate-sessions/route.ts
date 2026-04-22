import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

const HORIZON_DAYS = 28;
const TIME_ZONE = "Europe/Amsterdam";

/**
 * Convert an Amsterdam wall-clock (year/month/day/hour/minute) to a UTC
 * Date. Handles CET/CEST correctly by measuring the offset Intl reports
 * for that wall-clock and correcting it.
 */
function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const firstTry = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(firstTry));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const diffMinutes =
    hour * 60 + minute - (get("hour") * 60 + get("minute"));
  return new Date(firstTry + diffMinutes * 60_000);
}

function amsterdamYmd(d: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day") };
}

function amsterdamDayOfWeek(d: Date): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
  }).format(d);
  const idx: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return idx[weekday] ?? 0;
}

function toIsoDate(d: Date): string {
  const p = amsterdamYmd(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  const denied = verifyCronAuth(req);
  if (denied) return denied;

  const admin = createAdminClient();

  const today = new Date();
  const todayIso = toIsoDate(today);
  const horizon = new Date(today.getTime() + HORIZON_DAYS * 86_400_000);
  const horizonIso = toIsoDate(horizon);

  type TemplateRow = {
    id: string;
    class_type_id: string;
    trainer_id: string;
    day_of_week: number;
    start_time: string; // "06:30:00"
    duration_minutes: number;
    capacity: number;
    valid_from: string;
    valid_until: string | null;
    class_type: { pillar: string; age_category: string } | null;
  };

  const { data: templates, error: tErr } = await admin
    .from("schedule_templates")
    .select(
      `
        id, class_type_id, trainer_id, day_of_week, start_time,
        duration_minutes, capacity, valid_from, valid_until,
        class_type:class_types(pillar, age_category)
      `,
    )
    .eq("is_active", true)
    .returns<TemplateRow[]>();

  if (tErr) {
    console.error("[cron/generate-sessions] template fetch failed", tErr);
    return NextResponse.json(
      { ok: false, error: "template fetch failed" },
      { status: 500 },
    );
  }

  let inserted = 0;
  let errors = 0;

  for (let offset = 0; offset < HORIZON_DAYS; offset++) {
    const target = new Date(today.getTime() + offset * 86_400_000);
    const targetIso = toIsoDate(target);
    const targetDow = amsterdamDayOfWeek(target);
    const dayYmd = amsterdamYmd(target);

    for (const tpl of templates ?? []) {
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

      const { error: upErr } = await admin
        .from("class_sessions")
        .upsert(
          {
            class_type_id: tpl.class_type_id,
            trainer_id: tpl.trainer_id,
            template_id: tpl.id,
            pillar: tpl.class_type.pillar,
            age_category: tpl.class_type.age_category,
            start_at: startUtc.toISOString(),
            end_at: endUtc.toISOString(),
            capacity: tpl.capacity,
            status: "scheduled",
          },
          { onConflict: "template_id,start_at", ignoreDuplicates: true },
        );

      if (upErr) {
        errors++;
        console.error(
          "[cron/generate-sessions] upsert failed",
          tpl.id,
          targetIso,
          upErr,
        );
      } else {
        // upsert with ignoreDuplicates doesn't tell us if a row was actually
        // inserted. We treat errors==0 as "insert or already-exists".
        inserted++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    horizonDays: HORIZON_DAYS,
    fromDate: todayIso,
    toDate: horizonIso,
    templatesProcessed: templates?.length ?? 0,
    attempts: inserted,
    errors,
  });
}
