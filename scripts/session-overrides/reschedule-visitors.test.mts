// Integratietest voor de melding bij een tijdwijziging aan proefles-bezoekers
// en gasten, en voor kosteloos annuleren van een proefles na een verschuiving
// (spec-session-overrides.md). Tegen een LOKALE Supabase-stack met de volledige
// migratieketen; zelfde gebruik en localhost-guard als overrides.test.mts.
// Mails worden niet verstuurd maar geregistreerd door de stub in hooks.mjs.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
process.env.NEXT_PUBLIC_SITE_URL = "https://www.themovementclub.nl";

const RUN = Date.now().toString(36);
const PASSWORD = "Test-Session-Overrides-1";
const DAY = 86_400_000;

type SentEmail = { to: string; subject: string; replyTo: { email: string } | null; text: string };
const sent = () => ((globalThis as { __sentEmails?: SentEmail[] }).__sentEmails ??= []);

const svc = createClient(URL_, SERVICE, { db: { schema: "tmc" }, auth: { persistSession: false, autoRefreshToken: false } });

async function userClient(email: string): Promise<SupabaseClient> {
  const c = createClient(URL_, ANON, { db: { schema: "tmc" }, auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return c;
}

async function createUser(key: string, role: "admin" | "member" | "trainer", firstName: string) {
  const email = `rv-${key}-${RUN}@tmc.test`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { first_name: firstName, last_name: "Test" } });
  if (error) throw error;
  const { error: pErr } = await svc.from("profiles").update({ role, age_category: "adult", is_test: true, first_name: firstName }).eq("id", data.user.id);
  if (pErr) throw pErr;
  return { id: data.user.id, email };
}

function amsDate(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const ctx: Record<string, string> & { admin?: SupabaseClient } = {} as never;

async function adhocSession(startAt: Date) {
  const { data, error } = await svc.from("class_sessions").insert({
    class_type_id: ctx.classTypeId, trainer_id: ctx.trainerId, pillar: "yoga_mobility", age_category: "adult",
    start_at: startAt.toISOString(), end_at: new Date(startAt.getTime() + 3_600_000).toISOString(), capacity: 20, status: "scheduled",
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

async function trial(sessionId: string, kind: "paid" | "code" | "pending", label: string) {
  const id = randomUUID();
  const base = { id, session_id: sessionId, name: `${label} Bezoeker`, email: `${label.toLowerCase()}-${RUN}@tmc.test`, phone: "0600000000", is_test: true };
  if (kind === "code") {
    const { error } = await svc.from("trial_bookings").insert({ ...base, status: "paid", price_paid_cents: 0, trial_code_id: ctx.trialCodeId });
    if (error) throw error;
  } else {
    const mollie = `tr_rv_${label}_${RUN}`;
    const { error } = await svc.from("trial_bookings").insert({ ...base, status: kind, price_paid_cents: 1700, mollie_payment_id: mollie });
    if (error) throw error;
    if (kind === "paid") {
      const { error: pErr } = await svc.from("payments").insert({ mollie_payment_id: mollie, amount_cents: 1700, status: "paid", kind: "trial_booking", trial_booking_id: id, is_test: true });
      if (pErr) throw pErr;
    }
  }
  const { data } = await svc.from("trial_bookings").select("id, cancel_token, email").eq("id", id).single();
  return data as { id: string; cancel_token: string; email: string };
}

async function reschedule(sessionId: string, deltaMin: number) {
  const { data: s } = await svc.from("class_sessions").select("start_at").eq("id", sessionId).single();
  const { data, error } = await ctx.admin!.rpc("admin_reschedule_class_session", {
    p_session_id: sessionId, p_new_start_at: new Date(new Date(s!.start_at).getTime() + deltaMin * 60_000).toISOString(),
  });
  if (error) throw error;
  assert.equal(data.ok, true, JSON.stringify(data));
  return data;
}

before(async () => {
  const admin = await createUser("admin", "admin", "Admin");
  ctx.adminId = admin.id;
  ctx.admin = await userClient(admin.email);
  const hostUser = await createUser("host", "member", "Sanne");
  ctx.hostId = hostUser.id;
  ctx.hostEmail = hostUser.email;
  const t = await createUser("trainer", "trainer", "Trainer");

  await svc.from("class_pillars").upsert({ code: "yoga_mobility", name_nl: "Yoga & Mobility", age_category: "adult" }, { onConflict: "code" });
  const { data: ct, error: ctErr } = await svc.from("class_types").insert({ slug: `rv-yoga-${RUN}`, name: `RV Yoga ${RUN}`, pillar: "yoga_mobility", age_category: "adult", default_capacity: 20 }).select("id").single();
  if (ctErr) throw ctErr;
  ctx.classTypeId = ct.id;
  const { data: tr, error: trErr } = await svc.from("trainers").insert({ profile_id: t.id, display_name: `RV Trainer ${RUN}`, slug: `rv-t-${RUN}`, pillar_specialties: ["yoga_mobility"] }).select("id").single();
  if (trErr) throw trErr;
  ctx.trainerId = tr.id;

  const today = amsDate(new Date());
  const { data: m, error: mErr } = await svc.from("memberships").insert({
    profile_id: ctx.hostId, plan_type: "groepslessen", frequency_cap: 5, price_per_cycle_cents: 0, start_date: today,
    commit_end_date: amsDate(new Date(Date.now() + 365 * DAY)), status: "active", source: "admin_manual",
  }).select("id").single();
  if (mErr) throw mErr;
  const { data: gp, error: gpErr } = await svc.from("guest_passes").insert({
    profile_id: ctx.hostId, membership_id: m.id, period_start: amsDate(new Date(Date.now() - DAY)),
    period_end: amsDate(new Date(Date.now() + 30 * DAY)), passes_allocated: 4, passes_used: 0,
  }).select("id").single();
  if (gpErr) throw gpErr;
  ctx.guestPass = gp.id;
  const { data: code, error: cErr } = await svc.from("trial_codes").insert({ code: `RV${RUN}`.toUpperCase(), created_by: ctx.adminId, label: "RV test", max_uses: 10 }).select("id").single();
  if (cErr) throw cErr;
  ctx.trialCodeId = code.id;
});

test("verschuiving: precies een mail per ontvanger met de juiste variant, niets naar pending proefles of geannuleerde gast", async () => {
  const sessionId = await adhocSession(new Date(Date.now() + 2 * DAY));
  const hostClient = await userClient(ctx.hostEmail);
  const hb = await hostClient.rpc("book_class_session", { p_session_id: sessionId });
  assert.equal(hb.data?.ok, true, JSON.stringify(hb.data));

  const paid = await trial(sessionId, "paid", "Betaald");
  const coded = await trial(sessionId, "code", "Code");
  const pending = await trial(sessionId, "pending", "Pending");
  const g1 = await hostClient.rpc("book_guest_session", { p_session_id: sessionId, p_guest_pass_id: ctx.guestPass, p_guest_name: "Gijs Gast", p_guest_email: `gast-${RUN}@tmc.test` });
  assert.equal(g1.data?.ok, true, JSON.stringify(g1.data));
  const g2 = await hostClient.rpc("book_guest_session", { p_session_id: sessionId, p_guest_pass_id: ctx.guestPass, p_guest_name: "Anna Afgemeld", p_guest_email: `afgemeld-${RUN}@tmc.test` });
  assert.equal(g2.data?.ok, true, JSON.stringify(g2.data));
  await svc.from("guest_bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", g2.data.guest_booking_id);

  const result = await reschedule(sessionId, 30);
  sent().length = 0;
  const { notifySessionRescheduled } = await import("../../src/lib/admin/session-override-notify.ts");
  await notifySessionRescheduled(result);

  const mails = sent();
  const byTo = new Map<string, SentEmail[]>();
  for (const e of mails) byTo.set(e.to, [...(byTo.get(e.to) ?? []), e]);
  for (const [to, list] of byTo) assert.equal(list.length, 1, `meer dan een mail naar ${to}`);

  const member = byTo.get(ctx.hostEmail)?.[0];
  assert.match(member?.subject ?? "", /^Nieuwe tijd voor RV Yoga/);
  assert.match(member?.text ?? "", /rit of plek in je abonnement/, "ledenvariant (session_rescheduled)");
  assert.equal(member?.replyTo, null, "ledenmail houdt de standaardafzender");

  const p = byTo.get(paid.email)?.[0];
  assert.match(p?.subject ?? "", /^Nieuwe tijd voor je proefles/);
  assert.match(p?.text ?? "", /volledige bedrag terug/, "betaalde proefles: terugbetaling genoemd");
  assert.ok(p?.text.includes(`https://www.themovementclub.nl/proefles/annuleren/${paid.cancel_token}`), "annuleerlink met eigen token");
  assert.match(p?.text ?? "", /Was: .*\n?.*Nu: /s, "oude en nieuwe tijd");
  assert.equal(p?.replyTo?.email, "marlon@themovementclub.nl");

  const c = byTo.get(coded.email)?.[0];
  assert.match(c?.text ?? "", /proefcode/, "codeproefles: geen terugbetaling, wel kosteloos");
  assert.doesNotMatch(c?.text ?? "", /volledige bedrag terug/);
  assert.ok(c?.text.includes(`/proefles/annuleren/${coded.cancel_token}`));
  assert.equal(c?.replyTo?.email, "marlon@themovementclub.nl");

  const g = byTo.get(`gast-${RUN}@tmc.test`)?.[0];
  assert.match(g?.text ?? "", /hé gijs/i);
  assert.match(g?.text ?? "", /Laat het weten aan Sanne,/, "alleen de voornaam van het lid");
  assert.doesNotMatch(g?.text ?? "", /Sanne Test/);
  assert.doesNotMatch(g?.text ?? "", /proefles\/annuleren/, "gast krijgt geen annuleerlink");
  assert.equal(g?.replyTo?.email, "marlon@themovementclub.nl");

  assert.equal(byTo.has(pending.email), false, "geen mail bij een pending proefles");
  assert.equal(byTo.has(`afgemeld-${RUN}@tmc.test`), false, "geen mail bij een geannuleerde gast");
  assert.equal(mails.length, 4, `verwacht 4 mails, kreeg ${mails.length}: ${mails.map((m) => m.to).join(", ")}`);
});

test("zelfannulering na verschuiving binnen het normale venster: betaald met refund, code zonder, later geboekt normaal", async (t) => {
  // Start binnen het venster van 6 uur, verschuiving op dezelfde Amsterdamse dag.
  let start: Date | null = null;
  for (const h of [3, 2, 1.5]) {
    const cand = new Date(Date.now() + h * 3_600_000);
    if (amsDate(cand) === amsDate(new Date(cand.getTime() - 30 * 60_000))) { start = cand; break; }
  }
  if (!start) { t.skip("rond middernacht in Amsterdam: geen tijdpaar op dezelfde dag"); return; }

  const sessionId = await adhocSession(start);
  const paid = await trial(sessionId, "paid", "Voor");
  const coded = await trial(sessionId, "code", "Codevoor");
  await reschedule(sessionId, -30);
  const later = await trial(sessionId, "paid", "Na");

  // Annuleerpagina (weergave) volgt dezelfde regel als de RPC.
  const { getTrialBookingByToken } = await import("../../src/lib/actions/trial-booking.ts");
  const sPaid = await getTrialBookingByToken(paid.cancel_token);
  assert.equal(sPaid?.withinWindow, true);
  assert.equal(sPaid?.freeAfterReschedule, true);
  const sLater = await getTrialBookingByToken(later.cancel_token);
  assert.equal(sLater?.withinWindow, false, "na de verschuiving geboekt: normaal venster op de pagina");
  assert.equal(sLater?.freeAfterReschedule, false);

  const rPaid = (await svc.rpc("visitor_cancel_trial_booking", { p_token: paid.cancel_token })).data;
  assert.equal(rPaid.ok, true, JSON.stringify(rPaid));
  assert.equal(rPaid.within_window, true);
  assert.equal(rPaid.free_after_reschedule, true);
  assert.ok(rPaid.refund_id, "betaalde proefles krijgt een refund-intentie");
  const { data: refund } = await svc.from("payment_refunds").select("amount_cents, status").eq("id", rPaid.refund_id).single();
  assert.equal(refund?.amount_cents, 1700);

  const rCode = (await svc.rpc("visitor_cancel_trial_booking", { p_token: coded.cancel_token })).data;
  assert.equal(rCode.ok, true, JSON.stringify(rCode));
  assert.equal(rCode.within_window, true);
  assert.equal(rCode.refund_id ?? null, null, "codeboeking: geen refund");

  const rLater = (await svc.rpc("visitor_cancel_trial_booking", { p_token: later.cancel_token })).data;
  assert.equal(rLater.ok, true, JSON.stringify(rLater));
  assert.equal(rLater.within_window, false, "na de verschuiving geboekt: normaal venster in de RPC");
  assert.equal(rLater.refund_id ?? null, null);
  assert.equal(rLater.refund_skipped, "outside_window");

  const { data: rows } = await svc.from("trial_bookings").select("id, status, cancellation_reason").in("id", [paid.id, coded.id, later.id]);
  const reason = new Map(rows!.map((r) => [r.id, r]));
  assert.equal(reason.get(paid.id)?.cancellation_reason, "rescheduled");
  assert.equal(reason.get(coded.id)?.cancellation_reason, "rescheduled");
  assert.equal(reason.get(later.id)?.cancellation_reason, "late");
  for (const r of rows!) assert.equal(r.status, "cancelled");
});

test("rechten visitor_cancel_trial_booking: alleen de service role", async () => {
  const anon = createClient(URL_, ANON, { db: { schema: "tmc" }, auth: { persistSession: false } });
  const a = await anon.rpc("visitor_cancel_trial_booking", { p_token: randomUUID() });
  assert.ok(a.error, "anon moet geweigerd worden");
  const member = await userClient(ctx.hostEmail);
  const m = await member.rpc("visitor_cancel_trial_booking", { p_token: randomUUID() });
  assert.ok(m.error, "ingelogd lid moet geweigerd worden");
  const s = await svc.rpc("visitor_cancel_trial_booking", { p_token: randomUUID() });
  assert.equal(s.error, null);
  assert.equal(s.data.reason, "booking_not_found");
});
