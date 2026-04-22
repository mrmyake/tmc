#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: trainers } = await admin
  .from("trainers")
  .select("slug, display_name, is_active, pillar_specialties");
console.log(`\nTrainers (${trainers?.length ?? 0}):`);
for (const t of trainers ?? []) {
  console.log(
    `  · ${t.slug} — ${t.display_name} (${t.is_active ? "active" : "inactive"}) — ${t.pillar_specialties?.join(",") || "-"}`,
  );
}

// Week range: UTC Monday to next UTC Monday (matches the rooster page)
const now = new Date();
const weekStart = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
);
const dayNum = weekStart.getUTCDay() || 7;
weekStart.setUTCDate(weekStart.getUTCDate() - dayNum + 1);
const weekEnd = new Date(weekStart);
weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

const { data: sessions, count } = await admin
  .from("class_sessions")
  .select(
    "id, start_at, pillar, class_type:class_types(name), trainer:trainers(slug)",
    { count: "exact" },
  )
  .gte("start_at", weekStart.toISOString())
  .lt("start_at", weekEnd.toISOString())
  .order("start_at", { ascending: true });

const amsterdamFmt = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

console.log(
  `\nSessions this UTC week (${weekStart.toISOString().slice(0, 10)} – ${weekEnd.toISOString().slice(0, 10)}): ${count}`,
);
for (const s of sessions ?? []) {
  const start = new Date(s.start_at);
  console.log(
    `  · ${amsterdamFmt.format(start)} CEST — ${s.class_type?.name} (${s.pillar}) — ${s.trainer?.slug}`,
  );
}
