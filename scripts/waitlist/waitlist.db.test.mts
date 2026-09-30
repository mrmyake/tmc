// Integratietest voor de wachtlijst met reserveringen
// (spec-community-growth.md, sectie Wachtlijst) tegen een LOKALE
// Supabase-stack met de volledige migratieketen. Draait de echte
// productiecode: de RPC's als ingelogd lid (anon key plus sessie, zodat
// auth.uid() echt wordt geevalueerd) en de cron-route waitlist-promote.
//
// Gebruik (in een worktree met `supabase start`, tmc in api.schemas):
//   SO_SUPABASE_URL=http://127.0.0.1:54321 SO_SERVICE_KEY=... SO_ANON_KEY=... \
//     npm run test:waitlist-db
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
process.env.CRON_SECRET = "waitlist-test";

const RUN = Date.now().toString(36);
const PASSWORD = "Test-Waitlist-1";
const DAY = 86_400_000;
const MIN = 60_000;

declare global {
  var __sentEmails: Array<{ to: string; subject: string; text: string }> | undefined;
  var __sentPushes: Array<{ profileId: string; title: string; body: string }> | undefined;
}

const svc = createClient(URL_, SERVICE, {
  db: { schema: "tmc" },
  auth: { persistSession: false, autoRefreshToken: false },
});

type Member = { id: string; email: string; client: SupabaseClient };

async function createUser(key: string, role: "admin" | "member" | "trainer") {
  const email = `wl-${key}-${RUN}@tmc.test`;
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: key.toUpperCase(), last_name: "Test" },
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

async function userClient(email: string): Promise<SupabaseClient> {
  const c = createClient(URL_, ANON, {
    db: { schema: "tmc" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return c;
}

async function member(key: string): Promise<Member> {
  const u = await createUser(key, "member");
  return { ...u, client: await userClient(u.email) };
}

function amsDate(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

async function rpc(c: SupabaseClient, fn: string, args: Record<string, unknown> = {}) {
  const { data, error } = await c.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as { ok: boolean; reason?: string } & Record<string, unknown>;
}

const ctx = {} as {
  classTypeId: string;
  trainerId: string;
  a: Member; b: Member; c: Member; d: Member; e: Member; f: Member;
  admin: Member;
  guestPass: string;
};

/** Losse les, capaciteit en start naar keuze. */
async function newSession(startAt: Date, capacity: number | null) {
  const { data, error } = await svc
    .from("class_sessions")
    .insert({
      class_type_id: ctx.classTypeId,
      trainer_id: ctx.trainerId,
      pillar: "yoga_mobility",
      age_category: "adult",
      start_at: startAt.toISOString(),
      end_at: new Date(startAt.getTime() + 60 * MIN).toISOString(),
      occurrence_start_at: startAt.toISOString(),
      capacity,
      status: "scheduled",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function book(m: Member, sessionId: string) {
  return rpc(m.client, "book_class_session", { p_session_id: sessionId });
}
async function join(m: Member, sessionId: string) {
  return rpc(m.client, "join_waitlist", { p_session_id: sessionId });
}
async function leave(m: Member, entryId: string) {
  return rpc(m.client, "leave_waitlist", { p_entry_id: entryId });
}
async function cancelBookingOf(m: Member, sessionId: string) {
  const { data: bk } = await svc.from("bookings").select("id").eq("profile_id", m.id).eq("session_id", sessionId).eq("status", "booked").single();
  return rpc(m.client, "cancel_class_booking", { p_booking_id: bk!.id });
}
async function entry(m: Member, sessionId: string) {
  const { data } = await svc
    .from("waitlist_entries")
    .select("id, position, promoted_at, confirmation_deadline, confirmed_at, expired_at")
    .eq("profile_id", m.id)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  return data!;
}
async function availability(sessionId: string) {
  const { data } = await svc.from("v_session_availability").select("spots_available, taken_count, waitlist_count").eq("id", sessionId).single();
  return data!;
}
async function events(type: string, sessionId: string) {
  const { data } = await svc.from("events").select("subject_id, payload").eq("type", type).eq("payload->>session_id", sessionId);
  return data ?? [];
}

async function runCron() {
  const { GET } = await import("../../src/app/api/cron/waitlist-promote/route.ts");
  const res = await GET(
    new Request("http://localhost/api/cron/waitlist-promote", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }),
  );
  const body = (await res.json()) as { ok: boolean; expired: number; promoted: number; promotedIds: string[] };
  assert.equal(body.ok, true, `cron faalde: ${JSON.stringify(body)}`);
  return body;
}

before(async () => {
  globalThis.__sentEmails = [];
  globalThis.__sentPushes = [];

  await svc.from("class_pillars").upsert(
    { code: "yoga_mobility", name_nl: "Yoga & Mobility", age_category: "adult" },
    { onConflict: "code" },
  );
  const { error: bsErr } = await svc
    .from("booking_settings")
    .update({ waitlist_confirmation_minutes: 30, booking_window_days: 35, cancellation_window_hours: 6 })
    .eq("id", "singleton");
  if (bsErr) throw bsErr;

  const t = await createUser("trainer", "trainer");
  const { data: tr, error: trErr } = await svc
    .from("trainers")
    .insert({ profile_id: t.id, display_name: `WL Trainer ${RUN}`, slug: `wl-t-${RUN}`, pillar_specialties: ["yoga_mobility"] })
    .select("id")
    .single();
  if (trErr) throw trErr;
  ctx.trainerId = tr.id;

  const { data: ct, error: ctErr } = await svc
    .from("class_types")
    .insert({ slug: `wl-yoga-${RUN}`, name: `WL Yoga ${RUN}`, pillar: "yoga_mobility", age_category: "adult", default_capacity: 6 })
    .select("id")
    .single();
  if (ctErr) throw ctErr;
  ctx.classTypeId = ct.id;

  for (const k of ["a", "b", "c", "d", "e", "f"] as const) {
    ctx[k] = await member(k);
  }
  const adm = await createUser("admin", "admin");
  ctx.admin = { ...adm, client: await userClient(adm.email) };

  const today = amsDate(new Date());
  const commitEnd = amsDate(new Date(Date.now() + 365 * DAY));
  const base = { price_per_cycle_cents: 0, start_date: today, commit_end_date: commitEnd, status: "active", source: "admin_manual" };
  // e heeft bewust geen lidmaatschap (no_coverage); f heeft een rittenkaart.
  const { data: ms, error: mErr } = await svc
    .from("memberships")
    .insert([
      { ...base, profile_id: ctx.a.id, plan_type: "all_inclusive" },
      { ...base, profile_id: ctx.b.id, plan_type: "all_inclusive" },
      { ...base, profile_id: ctx.c.id, plan_type: "all_inclusive" },
      { ...base, profile_id: ctx.d.id, plan_type: "all_inclusive" },
      { ...base, profile_id: ctx.f.id, plan_type: "ten_ride_card", credits_remaining: 10, credits_total: 10 },
    ])
    .select("id, profile_id");
  if (mErr) throw mErr;
  const membershipA = ms.find((m) => m.profile_id === ctx.a.id)!.id;
  const { data: gp, error: gpErr } = await svc
    .from("guest_passes")
    .insert({
      profile_id: ctx.a.id,
      membership_id: membershipA,
      period_start: amsDate(new Date(Date.now() - DAY)),
      period_end: amsDate(new Date(Date.now() + 30 * DAY)),
      passes_allocated: 2,
      passes_used: 0,
    })
    .select("id")
    .single();
  if (gpErr) throw gpErr;
  ctx.guestPass = gp.id;
});

test("deadline-berekening (Europe/Amsterdam): dag, rustvenster en plafond op start - 5 minuten", async () => {
  const cases: Array<[string, string, string]> = [
    // [now, start_at, verwacht] in Amsterdamse tijd (zomertijd op 5 en 6 oktober 2026)
    ["2026-10-05T14:00:00+02:00", "2026-10-05T18:00:00+02:00", "2026-10-05T14:30:00+02:00"],
    ["2026-10-05T23:30:00+02:00", "2026-10-06T09:00:00+02:00", "2026-10-06T07:30:00+02:00"],
    ["2026-10-05T23:30:00+02:00", "2026-10-06T07:00:00+02:00", "2026-10-06T06:55:00+02:00"],
    ["2026-10-06T06:50:00+02:00", "2026-10-06T07:30:00+02:00", "2026-10-06T07:25:00+02:00"],
    ["2026-10-05T14:00:00+02:00", "2026-10-05T14:20:00+02:00", "2026-10-05T14:15:00+02:00"],
    // Wintertijd: 1 december 22:05 voor een les om 10:00 de volgende dag.
    ["2026-12-01T22:05:00+01:00", "2026-12-02T10:00:00+01:00", "2026-12-02T07:30:00+01:00"],
  ];
  for (const [now, start, expected] of cases) {
    const { data, error } = await svc.rpc("waitlist_confirmation_deadline", { p_now: now, p_start_at: start, p_minutes: 30 });
    assert.equal(error, null, error?.message);
    assert.equal(new Date(data as string).getTime(), new Date(expected).getTime(), `now=${now} start=${start}`);
  }
  // Niet voor leden.
  const { error: denied } = await ctx.a.client.rpc("waitlist_confirmation_deadline", { p_now: cases[0][0], p_start_at: cases[0][1], p_minutes: 30 });
  assert.ok(denied, "authenticated mag waitlist_confirmation_deadline niet aanroepen");
});

test("join_waitlist: dezelfde checks als book_class_session; vol is de voorwaarde", async () => {
  const s = await newSession(new Date(Date.now() + 2 * DAY), 2);
  // Niet vol: geen inschrijving.
  assert.equal((await join(ctx.a, s)).reason, "spots_available");
  assert.equal((await book(ctx.a, s)).ok, true);
  assert.equal((await book(ctx.c, s)).ok, true);
  // Vol: eigen boeking gaat voor.
  assert.equal((await join(ctx.a, s)).reason, "already_booked");
  // Vol zonder dekking: no_coverage, geen inschrijving.
  assert.equal((await join(ctx.e, s)).reason, "no_coverage");
  const jb = await join(ctx.b, s);
  assert.equal(jb.ok, true, JSON.stringify(jb));
  assert.equal(jb.rank, 1);
  const jd = await join(ctx.d, s);
  assert.equal(jd.ok, true);
  assert.equal(jd.rank, 2);
  assert.equal((await join(ctx.b, s)).reason, "already_on_waitlist");
  // Rittenkaart: inschrijven kost niets.
  const jf = await join(ctx.f, s);
  assert.equal(jf.ok, true);
  assert.equal(jf.rank, 3);
  const { data: mf } = await svc.from("memberships").select("credits_remaining").eq("profile_id", ctx.f.id).single();
  assert.equal(mf!.credits_remaining, 10, "inschrijven decrementeert geen credits");
  // Vol met eigen open entry: geen wachtlijstoptie meer.
  const bd = await book(ctx.d, s);
  assert.equal(bd.reason, "capacity_full");
  assert.equal(bd.can_join_waitlist, false);
  const { data: ev } = await svc.from("events").select("payload").eq("type", "booking.waitlisted").eq("payload->>session_id", s);
  assert.equal(ev!.length, 3);
  // Lid kan niet rechtstreeks schrijven en kan promote niet aanroepen.
  const { error: ins } = await ctx.b.client.from("waitlist_entries").insert({ profile_id: ctx.b.id, session_id: s, position: 99 });
  assert.ok(ins, "lid mag waitlist_entries niet direct schrijven");
  const { error: prom } = await ctx.b.client.rpc("promote_waitlist_entries");
  assert.ok(prom, "lid mag promote_waitlist_entries niet aanroepen");
  ctx["s1" as keyof typeof ctx] = s as never;
});

test("testplan 1: een vrije plek, alleen de eerste wordt gepromoveerd en de plek is gereserveerd", async () => {
  const s = ctx["s1" as keyof typeof ctx] as unknown as string;
  globalThis.__sentEmails = [];
  globalThis.__sentPushes = [];

  const cancel = await cancelBookingOf(ctx.c, s);
  assert.equal(cancel.ok, true, JSON.stringify(cancel));
  assert.equal((await availability(s)).spots_available, 1);

  const run = await runCron();
  assert.equal(run.promoted, 1);
  const eb = await entry(ctx.b, s);
  assert.ok(eb.promoted_at, "b is gepromoveerd");
  assert.ok(new Date(eb.confirmation_deadline!).getTime() > Date.now());
  const ed = await entry(ctx.d, s);
  assert.equal(ed.promoted_at, null, "d blijft wachten");

  const av = await availability(s);
  assert.equal(av.spots_available, 0, "open promotie telt als bezet in de view");
  assert.equal(av.taken_count, 2);

  // Iemand zonder wachtlijstplek: vol.
  const bc = await book(ctx.c, s);
  assert.equal(bc.reason, "capacity_full");
  assert.equal(bc.can_join_waitlist, true);

  // Mail en push met "bevestig voor HH:MM".
  assert.equal(globalThis.__sentEmails!.length, 1);
  assert.equal(globalThis.__sentEmails![0].to, ctx.b.email);
  assert.match(globalThis.__sentEmails![0].text, /Bevestig voor (morgen )?\d{2}:\d{2}/);
  assert.equal(globalThis.__sentPushes!.length, 1);
  assert.equal(globalThis.__sentPushes![0].profileId, ctx.b.id);
  assert.match(globalThis.__sentPushes![0].body, /Bevestig voor (morgen )?\d{2}:\d{2}/);

  // b bevestigt.
  const bb = await book(ctx.b, s);
  assert.equal(bb.ok, true, JSON.stringify(bb));
  assert.equal(bb.waitlist_confirmed, true);
  assert.ok((await entry(ctx.b, s)).confirmed_at);
  assert.equal((await availability(s)).spots_available, 0);
  assert.equal((await entry(ctx.d, s)).promoted_at, null);
  // Tweede cron: niets te doen, geen dubbele mail.
  const again = await runCron();
  assert.equal(again.promoted, 0);
  assert.equal(globalThis.__sentEmails!.length, 1);
  assert.equal((await events("waitlist.promoted", s)).length, 1);
});

test("testplan 2: niet bevestigen; na de deadline valt de plek vrij, de cron sluit en promoveert door", async () => {
  // Variant A: iemand anders boekt na de deadline, nog voor de cron.
  const s = await newSession(new Date(Date.now() + 2 * DAY + 3 * 3_600_000), 1);
  assert.equal((await book(ctx.a, s)).ok, true);
  assert.equal((await join(ctx.b, s)).ok, true);
  assert.equal((await join(ctx.c, s)).ok, true);
  assert.equal((await cancelBookingOf(ctx.a, s)).ok, true);
  assert.equal((await runCron()).promoted, 1);
  assert.ok((await entry(ctx.b, s)).promoted_at);
  assert.equal((await book(ctx.d, s)).reason, "capacity_full");

  const { error: uErr } = await svc
    .from("waitlist_entries")
    .update({ confirmation_deadline: new Date(Date.now() - MIN).toISOString() })
    .eq("id", (await entry(ctx.b, s)).id);
  assert.equal(uErr, null);
  assert.equal((await availability(s)).spots_available, 1, "verlopen reservering telt direct niet meer");
  const bd = await book(ctx.d, s);
  assert.equal(bd.ok, true, JSON.stringify(bd));
  const run = await runCron();
  assert.equal(run.expired, 1);
  assert.equal(run.promoted, 0);
  assert.ok((await entry(ctx.b, s)).expired_at);
  assert.equal((await entry(ctx.c, s)).promoted_at, null);
  assert.equal((await events("waitlist.expired", s)).length, 1);

  // b mag opnieuw inschrijven na een verlopen promotie en komt achteraan.
  const jb = await join(ctx.b, s);
  assert.equal(jb.ok, true, JSON.stringify(jb));
  assert.equal(jb.position, 3);
  assert.equal(jb.rank, 2, "achter c");

  // Variant B: niemand boekt, de cron promoveert de volgende.
  const s2 = await newSession(new Date(Date.now() + 2 * DAY + 5 * 3_600_000), 1);
  assert.equal((await book(ctx.a, s2)).ok, true);
  assert.equal((await join(ctx.b, s2)).ok, true);
  assert.equal((await join(ctx.c, s2)).ok, true);
  assert.equal((await cancelBookingOf(ctx.a, s2)).ok, true);
  assert.equal((await runCron()).promoted, 1);
  await svc.from("waitlist_entries").update({ confirmation_deadline: new Date(Date.now() - MIN).toISOString() }).eq("id", (await entry(ctx.b, s2)).id);
  const run2 = await runCron();
  assert.equal(run2.expired, 1);
  assert.equal(run2.promoted, 1);
  assert.ok((await entry(ctx.c, s2)).promoted_at, "c is doorgeschoven");
  assert.equal((await availability(s2)).spots_available, 0);
});

test("testplan 4: triggerpad, directe inserts respecteren een open promotie", async () => {
  const s = await newSession(new Date(Date.now() + 3 * DAY), 1);
  assert.equal((await book(ctx.a, s)).ok, true);
  assert.equal((await join(ctx.b, s)).ok, true);
  assert.equal((await cancelBookingOf(ctx.a, s)).ok, true);
  assert.equal((await runCron()).promoted, 1);

  const { error: tErr } = await svc.from("trial_bookings").insert({
    session_id: s, name: "Proef", email: `proef-${RUN}@tmc.test`, phone: "+31600000000",
    price_paid_cents: 0, status: "paid", is_test: false,
  });
  assert.match(tErr?.message ?? "", /session_capacity_exceeded/);
  const { error: gErr } = await svc.from("guest_bookings").insert({
    guest_pass_id: ctx.guestPass, session_id: s, booked_by: ctx.a.id,
    guest_name: "Gast", guest_email: `gast-${RUN}@tmc.test`, status: "booked",
  });
  assert.match(gErr?.message ?? "", /session_capacity_exceeded/);
  const { error: bErr } = await svc.from("bookings").insert({
    profile_id: ctx.c.id, session_id: s, status: "booked", iso_year: 2026, iso_week: 1,
    session_date: amsDate(new Date(Date.now() + 3 * DAY)), pillar: "yoga_mobility",
  });
  assert.match(bErr?.message ?? "", /session_capacity_exceeded/);
  // De eigen boeking van het gepromoveerde lid past wel (exclusie op bookings).
  assert.equal((await book(ctx.b, s)).ok, true);
});

test("testplan 5: grens 15 minuten, plafond start - 5 en meerdere promoties per run", async () => {
  const soon = new Date(Math.ceil((Date.now() + 20 * MIN) / MIN) * MIN);
  const s = await newSession(soon, 3);
  assert.equal((await book(ctx.a, s)).ok, true);
  assert.equal((await book(ctx.b, s)).ok, true);
  assert.equal((await book(ctx.c, s)).ok, true);
  assert.equal((await join(ctx.d, s)).ok, true);
  assert.equal((await join(ctx.f, s)).ok, true);
  assert.equal((await cancelBookingOf(ctx.a, s)).ok, true);
  assert.equal((await cancelBookingOf(ctx.b, s)).ok, true);
  const run = await runCron();
  assert.equal(run.promoted, 2, "twee vrije plekken, twee promoties");
  for (const m of [ctx.d, ctx.f]) {
    const e = await entry(m, s);
    assert.ok(e.promoted_at);
    assert.equal(new Date(e.confirmation_deadline!).getTime(), soon.getTime() - 5 * MIN, "deadline is start - 5 minuten");
  }
  assert.equal((await availability(s)).spots_available, 0);

  const tooSoon = await newSession(new Date(Date.now() + 10 * MIN), 1);
  assert.equal((await book(ctx.a, tooSoon)).ok, true);
  assert.equal((await join(ctx.b, tooSoon)).ok, true);
  assert.equal((await cancelBookingOf(ctx.a, tooSoon)).ok, true);
  assert.equal((await runCron()).promoted, 0, "les over 10 minuten wordt niet gepromoveerd");
  assert.equal((await entry(ctx.b, tooSoon)).promoted_at, null);
});

test("testplan 6: leave_waitlist en herinschrijving achteraan", async () => {
  const s = await newSession(new Date(Date.now() + 4 * DAY), 1);
  assert.equal((await book(ctx.a, s)).ok, true);
  const jb = await join(ctx.b, s);
  const jc = await join(ctx.c, s);
  assert.equal(jb.position, 1);
  assert.equal(jc.position, 2);

  // Andermans entry: not_found.
  assert.equal((await leave(ctx.d, jb.entry_id as string)).reason, "not_found");
  // Bevestigde entry: already_confirmed (b bevestigde eerder op s1).
  const s1 = ctx["s1" as keyof typeof ctx] as unknown as string;
  assert.equal((await leave(ctx.b, (await entry(ctx.b, s1)).id)).reason, "already_confirmed");

  // b geeft op en schrijft opnieuw in: achteraan, achter c.
  const lb = await leave(ctx.b, jb.entry_id as string);
  assert.equal(lb.ok, true);
  assert.equal(lb.was_promoted, false);
  assert.equal((await leave(ctx.b, jb.entry_id as string)).reason, "not_open");
  const jb2 = await join(ctx.b, s);
  assert.equal(jb2.ok, true, JSON.stringify(jb2));
  assert.equal(jb2.position, 3);
  assert.equal(jb2.rank, 2, "opnieuw ingeschreven staat achter c");
  assert.equal((await events("waitlist.left", s)).length, 1);

  // Open promotie opgeven maakt de plek direct vrij; de cron promoveert de volgende.
  assert.equal((await cancelBookingOf(ctx.a, s)).ok, true);
  assert.equal((await runCron()).promoted, 1);
  const ec = await entry(ctx.c, s);
  assert.ok(ec.promoted_at, "c (laagste positie) is gepromoveerd");
  assert.equal((await availability(s)).spots_available, 0);
  const lc = await leave(ctx.c, ec.id);
  assert.equal(lc.ok, true);
  assert.equal(lc.was_promoted, true);
  assert.equal((await availability(s)).spots_available, 1, "plek direct vrij");
  assert.equal((await runCron()).promoted, 1);
  assert.ok((await entry(ctx.b, s)).promoted_at, "b is nu aan de beurt");

  // my_waitlist_entries: b ziet zijn open promotie, c niets meer, anon niets.
  const { data: mineB } = await ctx.b.client.rpc("my_waitlist_entries");
  const rowB = (mineB as Array<{ session_id: string; state: string; entry_id: string }>).find((r) => r.session_id === s);
  assert.equal(rowB?.state, "promoted");
  const { data: mineC } = await ctx.c.client.rpc("my_waitlist_entries");
  assert.equal((mineC as Array<{ session_id: string }>).some((r) => r.session_id === s), false);
  const anon = createClient(URL_, ANON, { db: { schema: "tmc" }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: mineAnon, error: anonErr } = await anon.rpc("my_waitlist_entries");
  assert.ok(anonErr || (mineAnon as unknown[]).length === 0, "anon ziet niets");
});

test("punt 4: bevestigen dat om een andere reden faalt, laat de promotie staan", async () => {
  const s = await newSession(new Date(Date.now() + 5 * DAY), 1);
  assert.equal((await book(ctx.a, s)).ok, true);
  assert.equal((await join(ctx.b, s)).ok, true);
  assert.equal((await cancelBookingOf(ctx.a, s)).ok, true);
  assert.equal((await runCron()).promoted, 1);
  // b verliest tijdelijk zijn dekking (pauze vanaf vandaag).
  const { error: pErr } = await svc.from("memberships").update({ pause_effective_date: amsDate(new Date()) }).eq("profile_id", ctx.b.id);
  assert.equal(pErr, null, pErr?.message);
  const bb = await book(ctx.b, s);
  assert.equal(bb.reason, "no_coverage");
  const eb = await entry(ctx.b, s);
  assert.ok(eb.promoted_at && !eb.expired_at && !eb.confirmed_at, "promotie blijft open, geen automatische vrijgave");
  assert.equal((await availability(s)).spots_available, 0);
  // Opgeven blijft mogelijk.
  assert.equal((await leave(ctx.b, eb.id)).ok, true);
  await svc.from("memberships").update({ pause_effective_date: null }).eq("profile_id", ctx.b.id);
});

test("testplan 7: twee crons tegelijk geven per entry een event, een mail en een push", async () => {
  const s = await newSession(new Date(Date.now() + 6 * DAY), 2);
  assert.equal((await book(ctx.a, s)).ok, true);
  assert.equal((await book(ctx.b, s)).ok, true);
  assert.equal((await join(ctx.c, s)).ok, true);
  assert.equal((await join(ctx.d, s)).ok, true);
  assert.equal((await cancelBookingOf(ctx.a, s)).ok, true);
  assert.equal((await cancelBookingOf(ctx.b, s)).ok, true);
  globalThis.__sentEmails = [];
  globalThis.__sentPushes = [];
  const [r1, r2] = await Promise.all([runCron(), runCron()]);
  assert.equal(r1.promoted + r2.promoted, 2, `samen precies twee promoties (${r1.promoted} + ${r2.promoted})`);
  assert.equal((await events("waitlist.promoted", s)).length, 2);
  assert.equal(globalThis.__sentEmails!.length, 2);
  assert.deepEqual(globalThis.__sentEmails!.map((m) => m.to).sort(), [ctx.c.email, ctx.d.email].sort());
  assert.equal(globalThis.__sentPushes!.length, 2);
  assert.equal((await availability(s)).spots_available, 0);
});

test("annulering van de les laat open promoties vervallen", async () => {
  const s = await newSession(new Date(Date.now() + 7 * DAY), 1);
  assert.equal((await book(ctx.a, s)).ok, true);
  assert.equal((await join(ctx.b, s)).ok, true);
  assert.equal((await cancelBookingOf(ctx.a, s)).ok, true);
  assert.equal((await runCron()).promoted, 1);
  const res = await rpc(ctx.admin.client, "admin_cancel_class_session", { p_session_id: s, p_reason: "Test" });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.ok((await entry(ctx.b, s)).expired_at);
  const { data: mineB } = await ctx.b.client.rpc("my_waitlist_entries");
  assert.equal((mineB as Array<{ session_id: string }>).some((r) => r.session_id === s), false);
});
