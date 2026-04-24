#!/usr/bin/env node
/**
 * Seed dummy members die je kan gebruiken om /app-flows te testen
 * zonder zelf steeds een abonnement aan te maken.
 *
 * Wat deze script doet:
 *   1. Maakt auth-users aan met email_confirm=true (geen echte mail nodig)
 *   2. Upsert profiles + memberships in diverse plan-varianten
 *   3. Pre-alloceert guest_passes rijen voor eligible leden zodat de UI
 *      direct werkt (de lazy-alloc in code doet het anders ook, maar dit
 *      scheelt je een page-load)
 *   4. Genereert per dummy een magic-link URL die direct werkt, 1h geldig
 *
 * Re-run is veilig — bestaande rijen worden bijgewerkt ipv gedupliceerd.
 *
 * Run:
 *   npm run seed:dummies                             (productie-redirect)
 *   SEED_SITE_URL=http://localhost:3000 npm run seed:dummies   (lokaal)
 *
 * Opmerking: het doel-URL moet in Supabase dashboard → Auth → URL
 * Configuration → Redirect URLs staan, anders faalt de magic-link
 * redirect. localhost:3000/auth/callback hoort sowieso op die lijst.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
// `SEED_SITE_URL` laat je kiezen waarheen de magic-link redirect.
// Zonder override pakt 'ie NEXT_PUBLIC_SITE_URL (meestal productie).
// Voor lokaal testen: SEED_SITE_URL=http://localhost:3000 npm run seed:dummies
const siteUrl =
  process.env.SEED_SITE_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  "http://localhost:3000";

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with node --env-file=.env.local",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const REDIRECT = `${siteUrl}/auth/callback/implicit?next=/app`;

// ---------- Dummy definitie -------------------------------------------------

/**
 * `note` is wat je in de output ziet — bedoeld om te herinneren welke
 * use-case deze dummy dekt. `frequencyCap=null` = onbeperkt.
 */
const DUMMIES = [
  {
    email: "yoga-1x@tmc.test",
    phone: "+31600000001",
    firstName: "Yoga",
    lastName: "Eenmaal",
    ageCategory: "adult",
    planType: "yoga_mobility",
    planVariant: "yoga_mobility_1x",
    frequencyCap: 1,
    pricePerCycleCents: 4900,
    coveredPillars: ["yoga_mobility"],
    status: "active",
    expectedPasses: 1,
    note: "Yoga 1×/wk · 1 guest pass",
  },
  {
    email: "yoga-unl@tmc.test",
    phone: "+31600000002",
    firstName: "Yoga",
    lastName: "Onbeperkt",
    ageCategory: "adult",
    planType: "yoga_mobility",
    planVariant: "yoga_mobility_unl",
    frequencyCap: null,
    pricePerCycleCents: 11900,
    coveredPillars: ["yoga_mobility"],
    status: "active",
    expectedPasses: 2,
    note: "Yoga onbeperkt · 2 guest passes",
  },
  {
    email: "kettle-2x@tmc.test",
    phone: "+31600000003",
    firstName: "Kettle",
    lastName: "Twee",
    ageCategory: "adult",
    planType: "kettlebell",
    planVariant: "kettlebell_2x",
    frequencyCap: 2,
    pricePerCycleCents: 9900,
    coveredPillars: ["kettlebell"],
    status: "active",
    expectedPasses: 1,
    note: "Kettlebell 2×/wk · 1 guest pass",
  },
  {
    email: "allin-3x@tmc.test",
    phone: "+31600000004",
    firstName: "Allin",
    lastName: "Drie",
    ageCategory: "adult",
    planType: "all_inclusive",
    planVariant: "all_inclusive_3x",
    frequencyCap: 3,
    pricePerCycleCents: 12900,
    coveredPillars: ["vrij_trainen", "yoga_mobility", "kettlebell"],
    status: "active",
    expectedPasses: 1,
    note: "All Inclusive 3×/wk · 1 guest pass",
  },
  {
    email: "allin-unl@tmc.test",
    phone: "+31600000005",
    firstName: "Allin",
    lastName: "Onbeperkt",
    ageCategory: "adult",
    planType: "all_inclusive",
    planVariant: "all_inclusive_unl",
    frequencyCap: null,
    pricePerCycleCents: 14900,
    coveredPillars: ["vrij_trainen", "yoga_mobility", "kettlebell"],
    status: "active",
    expectedPasses: 2,
    note: "All Access onbeperkt · 2 guest passes",
  },
  {
    email: "vrij-2x@tmc.test",
    phone: "+31600000006",
    firstName: "Vrij",
    lastName: "Trainer",
    ageCategory: "adult",
    planType: "vrij_trainen",
    planVariant: "vrij_trainen_2x",
    frequencyCap: 2,
    pricePerCycleCents: 4900,
    coveredPillars: ["vrij_trainen"],
    status: "active",
    expectedPasses: 0,
    note: "Vrij trainen 2×/wk · geen guest passes",
  },
  {
    email: "tenride@tmc.test",
    phone: "+31600000007",
    firstName: "Tien",
    lastName: "Rittenkaart",
    ageCategory: "adult",
    planType: "ten_ride_card",
    planVariant: "ten_ride_card",
    frequencyCap: null,
    pricePerCycleCents: 18900,
    coveredPillars: ["yoga_mobility", "kettlebell"],
    status: "active",
    creditsTotal: 10,
    creditsRemaining: 10,
    expectedPasses: 0,
    note: "Rittenkaart 10 credits · geen guest passes",
  },
  {
    email: "paused@tmc.test",
    phone: "+31600000008",
    firstName: "Paused",
    lastName: "Lid",
    ageCategory: "adult",
    planType: "all_inclusive",
    planVariant: "all_inclusive_3x",
    frequencyCap: 3,
    pricePerCycleCents: 12900,
    coveredPillars: ["vrij_trainen", "yoga_mobility", "kettlebell"],
    status: "paused",
    expectedPasses: 1,
    note: "All Inclusive, gepauzeerd · 1 guest pass (paused telt nog mee)",
  },
];

// ---------- Helpers ---------------------------------------------------------

async function findUserByEmail(email) {
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function addWeeks(date, weeks) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d;
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

// ---------- Seed ------------------------------------------------------------

async function seedDummy(d) {
  // Auth user
  let user = await findUserByEmail(d.email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: d.email,
      email_confirm: true,
      user_metadata: {
        first_name: d.firstName,
        last_name: d.lastName,
        phone: d.phone,
      },
    });
    if (error) throw new Error(`createUser ${d.email}: ${error.message}`);
    user = data.user;
  }

  // Profile — deterministic phone per dummy zodat re-runs geen
  // collision met andere records veroorzaken. member_code komt uit
  // de trigger bij initial insert, blijft staan bij upsert.
  await admin.from("profiles").upsert(
    {
      id: user.id,
      email: d.email,
      first_name: d.firstName,
      last_name: d.lastName,
      phone: d.phone,
      role: "member",
      age_category: d.ageCategory,
    },
    { onConflict: "id" },
  );

  // Wipe any previous dummy membership so re-runs don't stack.
  await admin.from("memberships").delete().eq("profile_id", user.id);

  // Membership — start 6 weeks geleden zodat de huidige cycle echt is.
  const now = new Date();
  const startDate = addWeeks(now, -6);
  const commitEnd = addMonths(startDate, 12);

  const membershipRow = {
    profile_id: user.id,
    plan_type: d.planType,
    plan_variant: d.planVariant,
    frequency_cap: d.frequencyCap,
    age_category: d.ageCategory,
    price_per_cycle_cents: d.pricePerCycleCents,
    billing_cycle_weeks: 4,
    commit_months: 12,
    start_date: ymd(startDate),
    commit_end_date: ymd(commitEnd),
    status: d.status,
    covered_pillars: d.coveredPillars,
    source: "admin_manual",
    credits_total: d.creditsTotal ?? null,
    credits_remaining: d.creditsRemaining ?? null,
  };

  const { data: inserted, error: mErr } = await admin
    .from("memberships")
    .insert(membershipRow)
    .select("id, start_date, billing_cycle_weeks")
    .single();
  if (mErr) throw new Error(`insert membership ${d.email}: ${mErr.message}`);

  // Guest-passes rij voor huidige period — dezelfde logica als de TS helper.
  if (d.expectedPasses > 0) {
    const cycleMs =
      (inserted.billing_cycle_weeks ?? 4) * 7 * 86_400_000;
    const start = new Date(`${inserted.start_date}T00:00:00Z`);
    const elapsed = Math.max(0, Date.now() - start.getTime());
    const index = Math.floor(elapsed / cycleMs);
    const periodStart = new Date(start.getTime() + index * cycleMs);
    const periodEnd = new Date(periodStart.getTime() + cycleMs);

    await admin
      .from("guest_passes")
      .delete()
      .eq("profile_id", user.id)
      .eq("period_start", ymd(periodStart));

    const { error: gpErr } = await admin.from("guest_passes").insert({
      profile_id: user.id,
      membership_id: inserted.id,
      period_start: ymd(periodStart),
      period_end: ymd(periodEnd),
      passes_allocated: d.expectedPasses,
      passes_used: 0,
    });
    if (gpErr) {
      console.warn(`  ! guest_passes ${d.email}: ${gpErr.message}`);
    }
  }

  // Magic link
  const { data: linkData, error: linkErr } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: d.email,
      options: { redirectTo: REDIRECT },
    });
  if (linkErr) {
    console.warn(`  ! generateLink ${d.email}: ${linkErr.message}`);
    return { email: d.email, note: d.note, url: null };
  }
  return {
    email: d.email,
    note: d.note,
    url: linkData.properties?.action_link ?? null,
  };
}

async function main() {
  console.log(`Seeding ${DUMMIES.length} dummy members...\n`);

  const results = [];
  for (const d of DUMMIES) {
    try {
      const r = await seedDummy(d);
      console.log(`  · ${r.email} — ${r.note}`);
      results.push(r);
    } catch (err) {
      console.error(`  ! ${d.email}: ${err.message}`);
    }
  }

  console.log("\n" + "-".repeat(72));
  console.log(`Redirect: ${REDIRECT}`);
  console.log("Login URLs (1 uur geldig, re-run om te verversen):\n");
  for (const r of results) {
    if (r.url) {
      console.log(`# ${r.note}`);
      console.log(`${r.url}\n`);
    }
  }

  console.log("-".repeat(72));
  console.log("\nKlaar. Plak een URL in je browser om als dat lid in te loggen.");
  console.log("Tip: open elke in een apart incognito-venster om ze naast elkaar te testen.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
