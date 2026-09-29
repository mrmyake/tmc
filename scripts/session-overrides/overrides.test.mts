// Integratietest voor session-overrides (spec-session-overrides.md), tegen een
// LOKALE Supabase-stack met de volledige migratieketen. Draait de echte
// productiecode: de cron-route generate-sessions, adminUpdateSeries en de
// admin-RPC's (aangeroepen als ingelogde admin via de anon key, zodat
// is_admin() echt wordt geevalueerd).
//
// Gebruik (in een worktree met `supabase start`, tmc in api.schemas):
//   SO_SUPABASE_URL=http://127.0.0.1:54321 SO_SERVICE_KEY=... SO_ANON_KEY=... \
//     node --import ./scripts/ts-loader.mjs --import ./scripts/session-overrides/hooks.mjs \
//     --test scripts/session-overrides/overrides.test.mts
//
// Weigert te draaien tegen iets anders dan localhost.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_ = process.env.SO_SUPABASE_URL ?? "";
const SERVICE = process.env.SO_SERVICE_KEY ?? "";
const ANON = process.env.SO_ANON_KEY ?? "";
const host = URL_ ? new URL(URL_).hostname : "";
if (!URL_ || !SERVICE || !ANON || !["127.0.0.1", "localhost"].includes(host)) {
  throw new Error("Alleen tegen een lokale stack: zet SO_SUPABASE_URL (localhost), SO_SERVICE_KEY en SO_ANON_KEY.");
}
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE;
process.env.CRON_SECRET = "session-overrides-test";

const RUN = Date.now().toString(36);
const PASSWORD = "Test-Session-Overrides-1";
const DAY = 86_400_000;

const svc = createClient(URL_, SERVICE, {
  db: { schema: "tmc" },
  auth: { persistSession: false, autoRefreshToken: false },
});

async function userClient(email: string): Promise<SupabaseClient> {
  const c = createClient(URL_, ANON, {
    db: { schema: "tmc" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return c;
}

async function createUser(key: string, role: "admin" | "member" | "trainer") {
  const email = `so-${key}-${RUN}@tmc.test`;
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: key, last_name: "Test" },
  });
  if (error) throw error;
  const id = data.user.id;
  const { error: pErr } = await svc
    .from("profiles")
    .update({ role, age_category: "adult", is_test: true })
    .eq("id", id);
  if (pErr) throw pErr;
  return { id, email };
}

function amsParts(d: Date) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
  };
}

async function rpcOk(c: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await c.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as { ok: boolean; reason?: string } & Record<string, unknown>;
}

async function session(id: string) {
  const { data, error } = await svc.from("class_sessions").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

async function adhocSession(startAt: Date, capacity: number) {
  const { data, error } = await svc
    .from("class_sessions")
    .insert({
      class_type_id: ctx.classTypeId,
      trainer_id: ctx.trainerYoga,
      pillar: "yoga_mobility",
      age_category: "adult",
      start_at: startAt.toISOString(),
      end_at: new Date(startAt.getTime() + 60 * 60_000).toISOString(),
      capacity,
      status: "scheduled",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function runCron() {
  const { GET } = await import("../../src/app/api/cron/generate-sessions/route.ts");
  const res = await GET(
    new Request("http://localhost/api/cron/generate-sessions", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }),
  );
  const body = await res.json();
  assert.equal(body.ok, true, `cron faalde: ${JSON.stringify(body)}`);
  assert.equal(body.errors, 0, `cron had fouten: ${JSON.stringify(body)}`);
  return body;
}

async function templateSessions() {
  const { data, error } = await svc
    .from("class_sessions")
    .select("id, start_at, occurrence_start_at, status, trainer_id, capacity, end_at")
    .eq("template_id", ctx.templateId)
    .order("occurrence_start_at");
  if (error) throw error;
  return data;
}

const ctx: Record<string, string> & {
  admin?: SupabaseClient;
} = {} as never;

before(async () => {
  const admin = await createUser("admin", "admin");
  process.env.TEST_ADMIN_ID = admin.id;
  ctx.adminId = admin.id;
  ctx.admin = await userClient(admin.email);

  for (const k of ["a", "b", "c", "d"]) {
    const u = await createUser(k, "member");
    ctx[`member_${k}`] = u.id;
    ctx[`email_${k}`] = u.email;
  }
  const t1 = await createUser("trainer1", "trainer");
  const t2 = await createUser("trainer2", "trainer");

  await svc.from("class_pillars").upsert(
    { code: "yoga_mobility", name_nl: "Yoga & Mobility", age_category: "adult" },
    { onConflict: "code" },
  );
  // Harde weekcap ook voor yoga_mobility, zodat het quotum zichtbaar wordt.
  const { error: bsErr } = await svc
    .from("booking_settings")
    .update({ check_in_pillars: ["vrij_trainen"], booking_window_days: 35 })
    .eq("id", "singleton");
  if (bsErr) throw bsErr;

  const { data: ct, error: ctErr } = await svc
    .from("class_types")
    .insert({ slug: `so-yoga-${RUN}`, name: `SO Yoga ${RUN}`, pillar: "yoga_mobility", age_category: "adult", default_capacity: 8 })
    .select("id")
    .single();
  if (ctErr) throw ctErr;
  ctx.classTypeId = ct.id;

  const { data: trs, error: trErr } = await svc
    .from("trainers")
    .insert([
      { profile_id: t1.id, display_name: `SO Yoga Trainer ${RUN}`, slug: `so-t1-${RUN}`, pillar_specialties: ["yoga_mobility"] },
      { profile_id: t2.id, display_name: `SO KB Trainer ${RUN}`, slug: `so-t2-${RUN}`, pillar_specialties: ["kettlebell"] },
    ])
    .select("id, slug");
  if (trErr) throw trErr;
  ctx.trainerYoga = trs.find((t) => t.slug.startsWith("so-t1"))!.id;
  ctx.trainerKb = trs.find((t) => t.slug.startsWith("so-t2"))!.id;

  const target = amsParts(new Date(Date.now() + 3 * DAY));
  const { data: tpl, error: tplErr } = await svc
    .from("schedule_templates")
    .insert({
      class_type_id: ct.id,
      trainer_id: ctx.trainerYoga,
      day_of_week: target.dow,
      start_time: "18:00:00",
      duration_minutes: 60,
      capacity: 8,
      valid_from: amsParts(new Date()).date,
    })
    .select("id")
    .single();
  if (tplErr) throw tplErr;
  ctx.templateId = tpl.id;

  const today = amsParts(new Date()).date;
  const commitEnd = amsParts(new Date(Date.now() + 365 * DAY)).date;
  const base = { price_per_cycle_cents: 0, start_date: today, commit_end_date: commitEnd, status: "active", source: "admin_manual" };
  const { data: ms, error: mErr } = await svc
    .from("memberships")
    .insert([
      { ...base, profile_id: ctx.member_a, plan_type: "ten_ride_card", credits_remaining: 5, credits_total: 10 },
      { ...base, profile_id: ctx.member_b, plan_type: "groepslessen", frequency_cap: 1 },
      { ...base, profile_id: ctx.member_c, plan_type: "groepslessen", frequency_cap: 3 },
      { ...base, profile_id: ctx.member_d, plan_type: "ten_ride_card", credits_remaining: 5, credits_total: 10 },
    ])
    .select("id, profile_id");
  if (mErr) throw mErr;
  for (const m of ms) {
    if (m.profile_id === ctx.member_a) ctx.membership_a = m.id;
    if (m.profile_id === ctx.member_b) ctx.membership_b = m.id;
    if (m.profile_id === ctx.member_d) ctx.membership_d = m.id;
  }
  const { data: gp, error: gpErr } = await svc
    .from("guest_passes")
    .insert({
      profile_id: ctx.member_b,
      membership_id: ctx.membership_b,
      period_start: amsParts(new Date(Date.now() - DAY)).date,
      period_end: amsParts(new Date(Date.now() + 30 * DAY)).date,
      passes_allocated: 2,
      passes_used: 0,
    })
    .select("id")
    .single();
  if (gpErr) throw gpErr;
  ctx.guestPass = gp.id;
});

test("generate-sessions materialiseert de template", async () => {
  await runCron();
  const rows = await templateSessions();
  assert.ok(rows.length >= 4, `verwacht minstens 4 sessies, kreeg ${rows.length}`);
  for (const r of rows) assert.equal(r.start_at, r.occurrence_start_at);
});

test("verschoven template-sessie: generate-sessions maakt geen duplicaat op de oude tijd", async () => {
  const rows = await templateSessions();
  const s1 = rows[0];
  ctx.s1 = s1.id;
  ctx.s1Occurrence = s1.occurrence_start_at;
  const newStart = new Date(new Date(s1.start_at).getTime() + 30 * 60_000);

  const res = await rpcOk(ctx.admin!, "admin_reschedule_class_session", {
    p_session_id: s1.id,
    p_new_start_at: newStart.toISOString(),
  });
  assert.equal(res.ok, true, JSON.stringify(res));

  await runCron();
  await runCron();

  const after = await templateSessions();
  const sameDay = after.filter((r) => amsParts(new Date(r.occurrence_start_at)).date === amsParts(new Date(s1.occurrence_start_at)).date);
  assert.equal(sameDay.length, 1, `verwacht 1 sessie op die dag, kreeg ${sameDay.length}`);
  const moved = await session(s1.id);
  assert.equal(new Date(moved.start_at).getTime(), newStart.getTime());
  assert.equal(new Date(moved.end_at).getTime(), newStart.getTime() + 60 * 60_000);
  assert.equal(moved.occurrence_start_at, s1.occurrence_start_at);
  assert.ok(moved.rescheduled_at);
  assert.equal(moved.rescheduled_by, ctx.adminId);
  assert.equal(after.length, rows.length, "cron mag geen extra sessies aanmaken");

  const { data: ev } = await svc.from("events").select("payload").eq("type", "session.rescheduled").eq("subject_id", s1.id);
  assert.equal(ev?.length, 1);
});

test("trainer vervangen met pijler-mismatch: event legt de overschreven waarschuwing vast", async () => {
  const rows = await templateSessions();
  const s2 = rows[1];
  ctx.s2 = s2.id;
  const res = await rpcOk(ctx.admin!, "admin_replace_session_trainer", {
    p_session_id: s2.id,
    p_trainer_id: ctx.trainerKb,
    p_pillar_warning_overridden: true,
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.pillar_match, false);
  const s = await session(s2.id);
  assert.equal(s.trainer_id, ctx.trainerKb);
  assert.ok(s.trainer_overridden_at);
  const { data: ev } = await svc.from("events").select("payload").eq("type", "session.trainer_replaced").eq("subject_id", s2.id).single();
  assert.equal(ev!.payload.pillar_match, false);
  assert.equal(ev!.payload.pillar_warning_overridden, true);
  assert.equal(ev!.payload.old_trainer_id, ctx.trainerYoga);
});

test("adminUpdateSeries laat verschoven en vervangen sessies staan", async () => {
  const { adminUpdateSeries } = await import("../../src/lib/admin/series-actions.ts");

  // Zelfde dag en tijd, andere capaciteit, duur en trainer: patcht lege sessies.
  const r1 = await adminUpdateSeries({ templateId: ctx.templateId, capacity: 6, durationMinutes: 75, trainerId: ctx.trainerYoga });
  assert.equal(r1.ok, true, JSON.stringify(r1));
  assert.equal((r1 as { skippedWithOverrides?: number }).skippedWithOverrides, 2);

  const s1 = await session(ctx.s1);
  assert.equal(s1.status, "scheduled");
  assert.equal(s1.capacity, 8, "verschoven sessie mag niet gepatcht worden");
  assert.equal(new Date(s1.end_at).getTime() - new Date(s1.start_at).getTime(), 60 * 60_000);
  const s2 = await session(ctx.s2);
  assert.equal(s2.trainer_id, ctx.trainerKb, "vervangende trainer moet blijven staan");
  assert.equal(s2.capacity, 8);

  const others = (await templateSessions()).filter((r) => r.id !== ctx.s1 && r.id !== ctx.s2 && r.status === "scheduled");
  assert.ok(others.length > 0);
  for (const o of others) assert.equal(o.capacity, 6, "gewone lege sessies worden wel bijgewerkt");

  // Tijd gewijzigd: gewone lege sessies worden geannuleerd en opnieuw
  // gematerialiseerd; overrides blijven gepland op hun eigen tijd.
  const r2 = await adminUpdateSeries({ templateId: ctx.templateId, startTime: "19:00" });
  assert.equal(r2.ok, true, JSON.stringify(r2));
  const s1b = await session(ctx.s1);
  const s2b = await session(ctx.s2);
  assert.equal(s1b.status, "scheduled");
  assert.equal(s1b.start_at, s1.start_at);
  assert.equal(s2b.status, "scheduled");
  assert.equal(s2b.trainer_id, ctx.trainerKb);

  await runCron();
  const s1c = await session(ctx.s1);
  assert.equal(s1c.start_at, s1.start_at, "cron na serie-edit draait de verschuiving niet terug");
});

test("annuleren: rittenkaart, abonnement, wachtlijst en gast kloppen; tweede aanroep geeft niets dubbel terug", async () => {
  // Twee losse lessen op dezelfde dag (dus dezelfde ISO-week) morgen.
  const t0 = new Date(Date.now() + DAY);
  const s3 = await adhocSession(t0, 3);
  const s4 = await adhocSession(new Date(t0.getTime() + 2 * 3_600_000), 8);
  const a = await userClient(ctx.email_a);
  const b = await userClient(ctx.email_b);
  const c = await userClient(ctx.email_c);

  const ba = await rpcOk(a, "book_class_session", { p_session_id: s3 });
  assert.equal(ba.ok, true, JSON.stringify(ba));
  const bb = await rpcOk(b, "book_class_session", { p_session_id: s3 });
  assert.equal(bb.ok, true, JSON.stringify(bb));
  const quota = await rpcOk(b, "book_class_session", { p_session_id: s4 });
  assert.equal(quota.reason, "weekly_cap_reached", "quotum moet op zijn voor de annulering");
  const g = await rpcOk(b, "book_guest_session", {
    p_session_id: s3, p_guest_pass_id: ctx.guestPass, p_guest_name: "Gast Test", p_guest_email: `gast-${RUN}@tmc.test`,
  });
  assert.equal(g.ok, true, JSON.stringify(g));
  const full = await rpcOk(c, "book_class_session", { p_session_id: s3 });
  assert.equal(full.reason, "capacity_full");
  const { error: wErr } = await svc.from("waitlist_entries").insert({ profile_id: ctx.member_c, session_id: s3, position: 1 });
  assert.equal(wErr, null);

  const creditsBefore = (await svc.from("memberships").select("credits_remaining").eq("id", ctx.membership_a).single()).data!.credits_remaining;
  assert.equal(creditsBefore, 4);

  const res = await rpcOk(ctx.admin!, "admin_cancel_class_session", { p_session_id: s3, p_reason: "Feestdag" });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal((res.bookings as unknown[]).length, 2);
  assert.equal((res.waitlist as unknown[]).length, 1);
  assert.equal((res.guests as unknown[]).length, 1);

  const s = await session(s3);
  assert.equal(s.status, "cancelled");
  assert.equal(s.cancellation_reason, "Feestdag");
  assert.equal(s.cancelled_by, ctx.adminId);

  const ma = (await svc.from("memberships").select("credits_remaining").eq("id", ctx.membership_a).single()).data!;
  assert.equal(ma.credits_remaining, 5, "rit terug op de rittenkaart");
  const { data: bks } = await svc.from("bookings").select("profile_id, status, credits_used, cancellation_reason").eq("session_id", s3);
  for (const bk of bks!) {
    assert.equal(bk.status, "cancelled");
    assert.equal(bk.credits_used, 0);
    assert.equal(bk.cancellation_reason, "session_cancelled");
  }
  const quotaBack = await rpcOk(b, "book_class_session", { p_session_id: s4 });
  assert.equal(quotaBack.ok, true, `quotum terug: ${JSON.stringify(quotaBack)}`);

  const { data: wl } = await svc.from("waitlist_entries").select("expired_at, confirmed_at").eq("session_id", s3).single();
  assert.ok(wl!.expired_at);
  const { data: gb } = await svc.from("guest_bookings").select("status").eq("session_id", s3).single();
  assert.equal(gb!.status, "cancelled");
  const { data: pass } = await svc.from("guest_passes").select("passes_used").eq("id", ctx.guestPass).single();
  assert.equal(pass!.passes_used, 0, "gastpas terug");

  const { data: adj } = await svc.from("events").select("payload").eq("type", "credits.adjusted").eq("subject_id", ctx.membership_a);
  const refunds = adj!.filter((e) => e.payload.source === "session_cancelled");
  assert.equal(refunds.length, 1);

  // Tweede aanroep: geweigerd, niets dubbel.
  const again = await rpcOk(ctx.admin!, "admin_cancel_class_session", { p_session_id: s3, p_reason: "Feestdag" });
  assert.equal(again.reason, "already_cancelled");
  const ma2 = (await svc.from("memberships").select("credits_remaining").eq("id", ctx.membership_a).single()).data!;
  assert.equal(ma2.credits_remaining, 5);
  const { data: pass2 } = await svc.from("guest_passes").select("passes_used").eq("id", ctx.guestPass).single();
  assert.equal(pass2!.passes_used, 0);
  const { data: abk } = await svc.from("bookings").select("id").eq("session_id", s3).eq("profile_id", ctx.member_a).single();
  const direct = await rpcOk(svc, "adjust_membership_credits", {
    p_membership_id: ctx.membership_a, p_delta: 1, p_reason: "x", p_source: "session_cancelled",
    p_actor_type: "admin", p_booking_id: abk!.id,
  });
  assert.equal(direct.reason, "already_refunded");
});

test("hele dag annuleren: voorbeeld en uitvoering tellen dezelfde lessen", async () => {
  const day = new Date(Date.now() + 5 * DAY);
  const iso = amsParts(day).date;
  const d1 = await adhocSession(new Date(day.getTime()), 8);
  const d2 = await adhocSession(new Date(day.getTime() + 3_600_000), 8);
  const pre = await rpcOk(ctx.admin!, "admin_preview_day_cancellation", { p_date: iso });
  const ids = (pre.sessions as Array<{ id: string }>).map((x) => x.id);
  assert.ok(ids.includes(d1) && ids.includes(d2));
  const res = await rpcOk(ctx.admin!, "admin_cancel_class_sessions_on_date", { p_date: iso, p_reason: "Studio dicht" });
  assert.equal(res.ok, true);
  assert.equal((res.sessions as unknown[]).length, pre.session_count);
  assert.equal((await session(d1)).status, "cancelled");
  assert.equal((await session(d2)).status, "cancelled");
});

test("weigeringen: andere dag, begonnen, geannuleerd, check-ins, geen admin", async () => {
  const s1 = await session(ctx.s1);
  const nextDay = await rpcOk(ctx.admin!, "admin_reschedule_class_session", {
    p_session_id: ctx.s1, p_new_start_at: new Date(new Date(s1.start_at).getTime() + DAY).toISOString(),
  });
  assert.equal(nextDay.reason, "different_day");

  const started = await adhocSession(new Date(Date.now() - 10 * 60_000), 8);
  for (const [fn, args] of [
    ["admin_reschedule_class_session", { p_session_id: started, p_new_start_at: new Date(Date.now() + 3_600_000).toISOString() }],
    ["admin_cancel_class_session", { p_session_id: started, p_reason: "x" }],
    ["admin_replace_session_trainer", { p_session_id: started, p_trainer_id: ctx.trainerKb }],
  ] as const) {
    const r = await rpcOk(ctx.admin!, fn, args);
    assert.equal(r.reason, "session_started", fn);
  }

  const cancelled = await adhocSession(new Date(Date.now() + 2 * DAY), 8);
  await rpcOk(ctx.admin!, "admin_cancel_class_session", { p_session_id: cancelled, p_reason: "x" });
  const rc = await rpcOk(ctx.admin!, "admin_reschedule_class_session", {
    p_session_id: cancelled, p_new_start_at: new Date(Date.now() + 2 * DAY + 1_800_000).toISOString(),
  });
  assert.equal(rc.reason, "not_scheduled");

  const withCheckIn = await adhocSession(new Date(Date.now() + 2 * DAY), 8);
  const { error: ciErr } = await svc.from("check_ins").insert({
    profile_id: ctx.member_c, session_id: withCheckIn, check_in_method: "admin_web", access_type: "membership", pillar: "yoga_mobility",
  });
  assert.equal(ciErr, null);
  const rci = await rpcOk(ctx.admin!, "admin_reschedule_class_session", {
    p_session_id: withCheckIn, p_new_start_at: new Date(Date.now() + 2 * DAY + 1_800_000).toISOString(),
  });
  assert.equal(rci.reason, "has_check_ins");

  const member = await userClient(ctx.email_c);
  for (const [fn, args] of [
    ["admin_reschedule_class_session", { p_session_id: ctx.s1, p_new_start_at: s1.start_at }],
    ["admin_cancel_class_session", { p_session_id: ctx.s1, p_reason: "x" }],
    ["admin_replace_session_trainer", { p_session_id: ctx.s1, p_trainer_id: ctx.trainerKb }],
    ["admin_preview_day_cancellation", { p_date: "2026-10-01" }],
    ["admin_cancel_class_sessions_on_date", { p_date: "2026-10-01", p_reason: "x" }],
  ] as const) {
    const { error } = await member.rpc(fn, args);
    assert.ok(error, `${fn} moet geweigerd worden voor een lid`);
    assert.equal(error.code, "42501", fn);
  }
  // cancel_session_core is intern: geen EXECUTE voor een ingelogde gebruiker.
  const { error: coreErr } = await member.rpc("cancel_class_session_core", {
    p_session_id: ctx.s1, p_reason: "x", p_actor_id: ctx.member_c,
  });
  assert.ok(coreErr);
});

test("kosteloos annuleren na verschuiving, alleen voor boekingen van voor de verschuiving", async (t) => {
  // Start binnen het venster van 6 uur, op dezelfde Amsterdamse dag als de
  // verschoven tijd. Zoek een paar dat niet over middernacht gaat.
  let start: Date | null = null;
  for (const h of [3, 2, 1.5]) {
    const cand = new Date(Date.now() + h * 3_600_000);
    const moved = new Date(cand.getTime() - 30 * 60_000);
    if (amsParts(cand).date === amsParts(moved).date) { start = cand; break; }
  }
  if (!start) {
    t.skip("rond middernacht in Amsterdam: geen tijdpaar op dezelfde dag");
    return;
  }
  const s6 = await adhocSession(start, 8);
  const a = await userClient(ctx.email_a);
  const d = await userClient(ctx.email_d);
  const ba = await rpcOk(a, "book_class_session", { p_session_id: s6 });
  assert.equal(ba.ok, true, JSON.stringify(ba));

  const res = await rpcOk(ctx.admin!, "admin_reschedule_class_session", {
    p_session_id: s6, p_new_start_at: new Date(start.getTime() - 30 * 60_000).toISOString(),
  });
  assert.equal(res.ok, true, JSON.stringify(res));

  const bd = await rpcOk(d, "book_class_session", { p_session_id: s6 });
  assert.equal(bd.ok, true, JSON.stringify(bd));

  const { data: abk } = await svc.from("bookings").select("id").eq("session_id", s6).eq("profile_id", ctx.member_a).single();
  const ca = await rpcOk(a, "cancel_class_booking", { p_booking_id: abk!.id });
  assert.equal(ca.within_window, true);
  assert.equal(ca.free_after_reschedule, true);
  assert.equal(ca.credits_refunded, true);
  const { data: abk2 } = await svc.from("bookings").select("credits_used, cancellation_reason").eq("id", abk!.id).single();
  assert.equal(abk2!.credits_used, 0);
  assert.equal(abk2!.cancellation_reason, "rescheduled");
  const ma = (await svc.from("memberships").select("credits_remaining").eq("id", ctx.membership_a).single()).data!;
  assert.equal(ma.credits_remaining, 5);

  const { data: dbk } = await svc.from("bookings").select("id").eq("session_id", s6).eq("profile_id", ctx.member_d).single();
  const cd = await rpcOk(d, "cancel_class_booking", { p_booking_id: dbk!.id });
  assert.equal(cd.within_window, false, "boeking na de verschuiving volgt het normale venster");
  assert.equal(cd.credits_refunded, false);
  const md = (await svc.from("memberships").select("credits_remaining").eq("id", ctx.membership_d).single()).data!;
  assert.equal(md.credits_remaining, 4);
});

test("ledenapp: een lid leest de kolommen die /app/rooster en /app/boekingen opvragen", async () => {
  // De cookie-client van de ledenapp leest class_sessions per kolomgrant
  // (20260928090000). Dezelfde selecties als src/app/app/rooster/page.tsx en
  // src/app/app/boekingen/page.tsx; een ontbrekende grant laat het rooster
  // leeg zonder zichtbare fout.
  const member = await userClient(ctx.email_a);
  const rooster = await member
    .from("class_sessions")
    .select("id, start_at, end_at, status, capacity, pillar, age_category, rescheduled_at, occurrence_start_at, class_type:class_types(name), trainer:trainers(display_name, bio)")
    .eq("id", ctx.s1);
  assert.equal(rooster.error, null, JSON.stringify(rooster.error));
  assert.equal(rooster.data?.length, 1);
  const boekingen = await member
    .from("bookings")
    .select("id, status, no_show_at, booked_at, session:class_sessions!inner(id, start_at, end_at, rescheduled_at, occurrence_start_at, class_type:class_types(name), trainer:trainers(display_name))")
    .eq("profile_id", ctx.member_a);
  assert.equal(boekingen.error, null, JSON.stringify(boekingen.error));
  // Audit-kolommen blijven dicht voor leden.
  const hidden = await member.from("class_sessions").select("rescheduled_by").eq("id", ctx.s1);
  assert.ok(hidden.error, "rescheduled_by mag niet leesbaar zijn voor een lid");
});
