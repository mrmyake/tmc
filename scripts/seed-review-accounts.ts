#!/usr/bin/env node
/**
 * Zet de testdata klaar die Blok D van review-scenarios-marlon.md
 * beschrijft, en ruimt die na afloop weer op. Basis is uitsluitend dat
 * blok; wat daar niet staat maakt dit script niet aan.
 *
 * Twee commando's:
 *   seed      maakt de ontbrekende records aan
 *   teardown  verwijdert uitsluitend records die dit script zelf maakte
 *
 * Harde grenzen:
 *   - Dry-run by default. Schrijven pas met --apply.
 *   - Nooit in het auth-schema schrijven, nooit accounts aanmaken. Alle
 *     profielen moeten al bestaan; de betrokkene logt eerst zelf een keer
 *     in via de OTP-flow op /login.
 *   - Nooit de Mollie API aanroepen. Het lidmaatschap krijgt
 *     mollie_customer_id en mollie_subscription_id op NULL, en de
 *     betaalrij krijgt een herkenbaar nep-payment-id.
 *   - tmc.events is append-only en wordt niet aangeraakt.
 *   - Geen migraties, geen schemawijzigingen.
 *
 * Herkenbaarheid: elk aangemaakt record draagt de marker hieronder in een
 * tekstveld. Twee tabellen (bookings, pt_bookings) hebben geen vrij
 * tekstveld; die worden uitsluitend teruggevonden als kind van een
 * gemarkeerde sessie. Teardown raakt daardoor nooit iets aan dat dit
 * script niet zelf heeft aangemaakt.
 *
 * Run:
 *   node --env-file=.env.local scripts/seed-review-accounts.ts seed \
 *     --klant=<email> --trainer=<email> --testklant=<email>
 *   (voeg --apply toe om te schrijven, zonder is het een dry run)
 */

import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";

const MARKER_PREFIX = "review-seed";
/** Marker zoals die in een tekstveld belandt, bijvoorbeeld [review-seed:klant-membership]. */
function marker(slug: string): string {
  return `[${MARKER_PREFIX}:${slug}]`;
}
/** Patroon voor ILIKE-zoekacties op de marker. */
function markerLike(slug: string): string {
  return `%${marker(slug)}%`;
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    klant: { type: "string" },
    trainer: { type: "string" },
    testklant: { type: "string", multiple: true },
    apply: { type: "boolean", default: false },
  },
});

const command = positionals[0];
if (command !== "seed" && command !== "teardown") {
  console.error("Geef een commando op: seed of teardown.");
  console.error(
    "  node --env-file=.env.local scripts/seed-review-accounts.ts seed --klant=<email> --trainer=<email> --testklant=<email> [--apply]",
  );
  process.exit(1);
}

const APPLY = values.apply === true;

interface EmailInput {
  role: "klant" | "trainer" | "testklant";
  email: string;
  flag: string;
  envVar: string;
}

const testklantEmails = [
  ...(values.testklant ?? []),
  ...(process.env.REVIEW_TESTKLANT_EMAILS?.split(",") ?? []),
]
  .map((e) => e.trim())
  .filter((e) => e.length > 0);

const emailInputs: EmailInput[] = [
  {
    role: "klant",
    email: (values.klant ?? process.env.REVIEW_KLANT_EMAIL ?? "").trim(),
    flag: "--klant",
    envVar: "REVIEW_KLANT_EMAIL",
  },
  {
    role: "trainer",
    email: (values.trainer ?? process.env.REVIEW_TRAINER_EMAIL ?? "").trim(),
    flag: "--trainer",
    envVar: "REVIEW_TRAINER_EMAIL",
  },
  ...testklantEmails.map((email) => ({
    role: "testklant" as const,
    email,
    flag: "--testklant",
    envVar: "REVIEW_TESTKLANT_EMAILS",
  })),
];

const missing = emailInputs.filter((i) => i.role !== "testklant" && !i.email);
if (missing.length > 0 || testklantEmails.length === 0) {
  console.error("Ontbrekende adressen. Geef ze mee via CLI-argument of env var:");
  for (const m of missing) console.error(`  ${m.flag}=<email>   (of env var ${m.envVar})`);
  if (testklantEmails.length === 0) {
    console.error(
      "  --testklant=<email>   (of env var REVIEW_TESTKLANT_EMAILS, komma-gescheiden; één tot twee adressen)",
    );
  }
  process.exit(1);
}
if (testklantEmails.length > 2) {
  console.error("Blok D vraagt om één tot twee testklant-profielen, niet meer.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Ontbrekende NEXT_PUBLIC_SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY. Run met node --env-file=.env.local",
  );
  process.exit(1);
}

// Zelfde schemakeuze als src/lib/supabase/admin.ts; zonder dit praat de
// client tegen public in plaats van tmc.
const db = createClient(url, serviceKey, {
  db: { schema: process.env.DB_SCHEMA ?? "tmc" },
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

let issues = 0;

function logAction(table: string, id: string, what: string): void {
  console.log(`  ${table.padEnd(20)} ${id.padEnd(38)} ${what}`);
}

function logProblem(message: string): void {
  console.error(`  ! ${message}`);
  issues++;
}

// ---------------------------------------------------------------------------
// Datumhulp (Amsterdam-neutraal: we werken in UTC, net als de seed-scripts)
// ---------------------------------------------------------------------------

function atUtc(daysFromToday: number, hour: number): Date {
  const now = new Date();
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0),
  );
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d;
}

function plusMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isoWeekYear(date: Date): { isoYear: number; isoWeek: number } {
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const isoWeek = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return { isoYear: target.getUTCFullYear(), isoWeek };
}

// ---------------------------------------------------------------------------
// Profielen en trainer opzoeken (nooit aanmaken)
// ---------------------------------------------------------------------------

interface ResolvedProfile {
  role: EmailInput["role"];
  email: string;
  id: string;
}

async function resolveProfiles(): Promise<ResolvedProfile[] | null> {
  const resolved: ResolvedProfile[] = [];
  let ok = true;

  for (const input of emailInputs) {
    const email = input.email.toLowerCase();
    const { data, error } = await db
      .from("profiles")
      .select("id, email, role")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      logProblem(`${email}: query mislukt, ${error.message}`);
      ok = false;
      continue;
    }
    if (!data) {
      logProblem(
        `${email}: geen profiel gevonden. Deze persoon moet eerst een keer inloggen via de OTP-flow op /login. Dit script maakt geen accounts aan.`,
      );
      ok = false;
      continue;
    }
    console.log(`  profiel gevonden: ${email} (rol ${data.role})`);
    resolved.push({ role: input.role, email, id: data.id });
  }

  return ok ? resolved : null;
}

async function resolveTrainerRow(profileId: string): Promise<string | null> {
  const { data } = await db
    .from("trainers")
    .select("id, display_name")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) {
    logProblem(
      "Geen actieve trainers-rij gevonden bij het traineraccount. Blok D gaat ervan uit dat die er al is; dit script maakt of wijzigt geen trainers-rij.",
    );
    return null;
  }
  console.log(`  trainer gevonden: ${data.display_name}`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Generieke insert-helper: idempotent op de marker
// ---------------------------------------------------------------------------

/**
 * Placeholder-id voor een rij die in dry-run nog niet bestaat. Zo kunnen
 * afhankelijke stappen tóch loggen wat ze zouden doen, in plaats van
 * stilletjes af te haken. In dry-run wordt nooit geschreven, dus dit id
 * belandt nergens in de database.
 */
const DRY_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Maakt één rij aan als er nog geen rij met deze marker bestaat.
 * Retourneert het id van de bestaande of nieuwe rij, DRY_ID in dry-run,
 * of null als er iets misging.
 */
async function ensureRow(opts: {
  table: string;
  slug: string;
  /** Kolom waarin de marker staat. */
  markerColumn: string;
  /** Extra filters om de bestaande rij te vinden, bijvoorbeeld profile_id. */
  match?: Record<string, string>;
  /** Rij zoals die ingevoegd wordt, marker al inbegrepen. */
  row: Record<string, unknown>;
}): Promise<string | null> {
  let query = db.from(opts.table).select("id").ilike(opts.markerColumn, markerLike(opts.slug));
  for (const [k, v] of Object.entries(opts.match ?? {})) query = query.eq(k, v);

  const { data: existing, error: findError } = await query.maybeSingle();
  if (findError) {
    logProblem(`${opts.table} (${opts.slug}): zoeken mislukt, ${findError.message}`);
    return null;
  }
  if (existing) {
    logAction(opts.table, existing.id, `bestaat al (${opts.slug}), overgeslagen`);
    return existing.id;
  }

  if (!APPLY) {
    logAction(opts.table, "-", `zou aangemaakt worden (${opts.slug})`);
    return DRY_ID;
  }

  const { data: inserted, error: insertError } = await db
    .from(opts.table)
    .insert(opts.row)
    .select("id")
    .single();

  if (insertError) {
    logProblem(`${opts.table} (${opts.slug}): aanmaken mislukt, ${insertError.message}`);
    return null;
  }
  logAction(opts.table, inserted.id, `aangemaakt (${opts.slug})`);
  return inserted.id;
}

/**
 * Boekingen hebben geen tekstveld voor een marker. Ze worden daarom
 * uitsluitend als kind van een gemarkeerde sessie aangemaakt en
 * teruggevonden, met de unieke sleutel (profile_id, session_id).
 */
async function ensureChildBooking(opts: {
  table: "bookings" | "pt_bookings";
  parentColumn: "session_id" | "pt_session_id";
  parentId: string;
  profileId: string;
  row: Record<string, unknown>;
  label: string;
}): Promise<string | null> {
  const { data: existing, error: findError } = await db
    .from(opts.table)
    .select("id")
    .eq("profile_id", opts.profileId)
    .eq(opts.parentColumn, opts.parentId)
    .maybeSingle();

  if (findError) {
    logProblem(`${opts.table} (${opts.label}): zoeken mislukt, ${findError.message}`);
    return null;
  }
  if (existing) {
    logAction(opts.table, existing.id, `bestaat al (${opts.label}), overgeslagen`);
    return existing.id;
  }
  if (!APPLY) {
    logAction(opts.table, "-", `zou aangemaakt worden (${opts.label})`);
    return null;
  }

  const { data: inserted, error: insertError } = await db
    .from(opts.table)
    .insert(opts.row)
    .select("id")
    .single();

  if (insertError) {
    logProblem(`${opts.table} (${opts.label}): aanmaken mislukt, ${insertError.message}`);
    return null;
  }
  logAction(opts.table, inserted.id, `aangemaakt (${opts.label})`);
  return inserted.id;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed(profiles: ResolvedProfile[]): Promise<void> {
  const klant = profiles.find((p) => p.role === "klant")!;
  const trainerProfile = profiles.find((p) => p.role === "trainer")!;
  const testklanten = profiles.filter((p) => p.role === "testklant");

  const trainerId = await resolveTrainerRow(trainerProfile.id);
  if (!trainerId) return;

  // Referentiedata die al moet bestaan; dit script maakt geen lestypes of
  // oefeningen aan.
  const { data: classType } = await db
    .from("class_types")
    .select("id, name, pillar, default_capacity")
    .eq("slug", "vinyasa-yoga")
    .maybeSingle();
  if (!classType) {
    logProblem("Lestype vinyasa-yoga niet gevonden. Dit script maakt geen lestypes aan.");
    return;
  }

  const { data: exercises } = await db
    .from("exercises")
    .select("id, name")
    .eq("is_active", true)
    .order("name")
    .limit(3);
  if (!exercises || exercises.length < 3) {
    logProblem("Minder dan drie actieve oefeningen gevonden. Dit script maakt geen oefeningen aan.");
    return;
  }

  console.log("\nKlantaccount");

  // Blok D 1a: lidmaatschap, actief, zonder Mollie-koppeling.
  const startDate = atUtc(-30, 0);
  const commitEnd = new Date(startDate);
  commitEnd.setUTCFullYear(commitEnd.getUTCFullYear() + 1);
  const membershipId = await ensureRow({
    table: "memberships",
    slug: "klant-membership",
    markerColumn: "notes",
    match: { profile_id: klant.id },
    row: {
      profile_id: klant.id,
      plan_type: "groepslessen",
      plan_variant: "groepslessen_2x",
      frequency_cap: 2,
      age_category: "adult",
      price_per_cycle_cents: 8900,
      billing_cycle_weeks: 4,
      commit_months: 12,
      start_date: isoDate(startDate),
      commit_end_date: isoDate(commitEnd),
      status: "active",
      covered_pillars: ["yoga_mobility", "kettlebell"],
      source: "admin_manual",
      // Blok D: expliciet leeg, zodat de pauzeflow geen Mollie-API raakt.
      mollie_customer_id: null,
      mollie_subscription_id: null,
      notes: `${marker("klant-membership")} testdata review Marlon`,
    },
  });

  // Blok D 1b: actief trainingsprogramma met een programmadag. Een dag
  // zonder oefeningen laat K4 leeg, dus de oefeningen horen erbij.
  const programId = await ensureRow({
    table: "training_programs",
    slug: "klant-program",
    markerColumn: "notes",
    match: { profile_id: klant.id },
    row: {
      profile_id: klant.id,
      version: 1,
      status: "active",
      title: "Reviewschema",
      activated_at: new Date().toISOString(),
      notes: `${marker("klant-program")} testdata review Marlon`,
    },
  });

  let dayId: string | null = null;
  if (programId) {
    dayId = await ensureRow({
      table: "program_days",
      slug: "klant-program-day",
      markerColumn: "label",
      match: { program_id: programId },
      row: {
        program_id: programId,
        day_number: 1,
        label: `Dag 1 ${marker("klant-program-day")}`,
      },
    });
  }

  if (dayId) {
    const slots = ["A1", "A2", "B1"];
    for (let i = 0; i < slots.length; i++) {
      await ensureRow({
        table: "program_exercises",
        slug: `klant-program-exercise-${slots[i]}`,
        markerColumn: "notes",
        match: { day_id: dayId },
        row: {
          day_id: dayId,
          slot: slots[i],
          exercise_id: exercises[i].id,
          sets: 3,
          reps_min: 8,
          reps_max: 12,
          tempo_eccentric: 3,
          tempo_pause_bottom: 1,
          tempo_concentric: 1,
          tempo_pause_top: 0,
          rest_seconds: 90,
          notes: `${marker(`klant-program-exercise-${slots[i]}`)} testdata review Marlon`,
        },
      });
    }
  }

  // Blok D 1c: afgeronde boeking in het verleden. Die kan niet zonder een
  // les in het verleden om aan te hangen, dus die maken we erbij.
  const pastStart = atUtc(-7, 9);
  const pastSessionId = await ensureRow({
    table: "class_sessions",
    slug: "klant-historie-les",
    markerColumn: "notes",
    row: {
      class_type_id: classType.id,
      trainer_id: trainerId,
      pillar: classType.pillar,
      age_category: "adult",
      start_at: pastStart.toISOString(),
      end_at: plusMinutes(pastStart, 60).toISOString(),
      capacity: classType.default_capacity ?? 8,
      status: "completed",
      notes: `${marker("klant-historie-les")} testdata review Marlon`,
    },
  });

  if (pastSessionId && membershipId) {
    const w = isoWeekYear(pastStart);
    await ensureChildBooking({
      table: "bookings",
      parentColumn: "session_id",
      parentId: pastSessionId,
      profileId: klant.id,
      label: "klant-historie-boeking",
      row: {
        profile_id: klant.id,
        session_id: pastSessionId,
        membership_id: membershipId,
        status: "booked",
        iso_year: w.isoYear,
        iso_week: w.isoWeek,
        session_date: isoDate(pastStart),
        pillar: classType.pillar,
        credits_used: 1,
        attended_at: plusMinutes(pastStart, 60).toISOString(),
      },
    });
  }

  // Blok D 1d: factuurregel of betaling. Nep-payment-id, nooit via Mollie.
  if (membershipId) {
    await ensureRow({
      table: "payments",
      slug: "klant-betaling",
      markerColumn: "description",
      match: { profile_id: klant.id },
      row: {
        profile_id: klant.id,
        membership_id: membershipId,
        mollie_payment_id: `${MARKER_PREFIX}-klant-betaling`,
        amount_cents: 8900,
        status: "paid",
        method: "directdebit",
        description: `${marker("klant-betaling")} testdata review Marlon`,
        paid_at: atUtc(-30, 12).toISOString(),
      },
    });
  }

  console.log("\nTraineraccount");

  // Blok D 2b: drie lessen deze en komende week, met testboekingen erop.
  const upcomingOffsets = [1, 3, 8];
  for (let i = 0; i < upcomingOffsets.length; i++) {
    const slug = `trainer-les-${i + 1}`;
    const start = atUtc(upcomingOffsets[i], 9 + i);
    const sessionId = await ensureRow({
      table: "class_sessions",
      slug,
      markerColumn: "notes",
      row: {
        class_type_id: classType.id,
        trainer_id: trainerId,
        pillar: classType.pillar,
        age_category: "adult",
        start_at: start.toISOString(),
        end_at: plusMinutes(start, 60).toISOString(),
        capacity: classType.default_capacity ?? 8,
        status: "scheduled",
        notes: `${marker(slug)} testdata review Marlon`,
      },
    });

    if (!sessionId) continue;
    const w = isoWeekYear(start);
    for (const tk of testklanten) {
      await ensureChildBooking({
        table: "bookings",
        parentColumn: "session_id",
        parentId: sessionId,
        profileId: tk.id,
        label: `${slug}-boeking-${tk.email}`,
        row: {
          profile_id: tk.id,
          session_id: sessionId,
          status: "booked",
          iso_year: w.isoYear,
          iso_week: w.isoWeek,
          session_date: isoDate(start),
          pillar: classType.pillar,
          credits_used: 0,
        },
      });
    }
  }

  // Blok D 2c en 2d: een PT-sessie op deze trainer, met een gekoppelde klant.
  const ptStart = atUtc(2, 14);
  const ptSessionId = await ensureRow({
    table: "pt_sessions",
    slug: "trainer-pt-sessie",
    markerColumn: "notes",
    row: {
      trainer_id: trainerId,
      kind: "bookable",
      format: "one_on_one",
      mode: "studio",
      start_at: ptStart.toISOString(),
      end_at: plusMinutes(ptStart, 60).toISOString(),
      duration_min: 60,
      capacity: 1,
      status: "scheduled",
      notes: `${marker("trainer-pt-sessie")} testdata review Marlon`,
    },
  });

  if (ptSessionId && testklanten.length > 0) {
    const tk = testklanten[0];
    await ensureChildBooking({
      table: "pt_bookings",
      parentColumn: "pt_session_id",
      parentId: ptSessionId,
      profileId: tk.id,
      label: `trainer-pt-boeking-${tk.email}`,
      row: {
        profile_id: tk.id,
        pt_session_id: ptSessionId,
        price_paid_cents: 0,
        status: "booked",
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

/** Verwijdert rijen met onze marker in de opgegeven kolom. */
async function deleteMarked(table: string, markerColumn: string): Promise<void> {
  const { data: rows, error } = await db
    .from(table)
    .select("id")
    .ilike(markerColumn, `%[${MARKER_PREFIX}:%`);

  if (error) {
    logProblem(`${table}: zoeken mislukt, ${error.message}`);
    return;
  }
  if (!rows || rows.length === 0) {
    console.log(`  ${table.padEnd(20)} niets gemarkeerd gevonden`);
    return;
  }

  for (const row of rows) {
    if (!APPLY) {
      logAction(table, row.id, "zou verwijderd worden");
      continue;
    }
    const { error: delError } = await db.from(table).delete().eq("id", row.id);
    if (delError) {
      logProblem(`${table} ${row.id}: verwijderen mislukt, ${delError.message}`);
      continue;
    }
    logAction(table, row.id, "verwijderd");
  }
}

/**
 * Verwijdert kindrijen van gemarkeerde ouders. Zo blijven bookings en
 * pt_bookings, die zelf geen marker kunnen dragen, toch exact begrensd
 * tot wat dit script heeft aangemaakt.
 */
async function deleteChildrenOfMarked(opts: {
  parentTable: string;
  parentMarkerColumn: string;
  childTable: string;
  childForeignKey: string;
}): Promise<void> {
  const { data: parents, error } = await db
    .from(opts.parentTable)
    .select("id")
    .ilike(opts.parentMarkerColumn, `%[${MARKER_PREFIX}:%`);

  if (error) {
    logProblem(`${opts.parentTable}: zoeken mislukt, ${error.message}`);
    return;
  }
  const parentIds = (parents ?? []).map((p) => p.id);
  if (parentIds.length === 0) {
    console.log(`  ${opts.childTable.padEnd(20)} geen gemarkeerde ouders, niets te doen`);
    return;
  }

  const { data: children, error: childError } = await db
    .from(opts.childTable)
    .select("id")
    .in(opts.childForeignKey, parentIds);

  if (childError) {
    logProblem(`${opts.childTable}: zoeken mislukt, ${childError.message}`);
    return;
  }
  if (!children || children.length === 0) {
    console.log(`  ${opts.childTable.padEnd(20)} niets gevonden onder gemarkeerde ouders`);
    return;
  }

  for (const child of children) {
    if (!APPLY) {
      logAction(opts.childTable, child.id, "zou verwijderd worden (kind van gemarkeerde rij)");
      continue;
    }
    const { error: delError } = await db.from(opts.childTable).delete().eq("id", child.id);
    if (delError) {
      logProblem(`${opts.childTable} ${child.id}: verwijderen mislukt, ${delError.message}`);
      continue;
    }
    logAction(opts.childTable, child.id, "verwijderd (kind van gemarkeerde rij)");
  }
}

async function teardown(): Promise<void> {
  // Volgorde volgt de foreign keys: eerst wat naar andere rijen wijst.
  console.log("\nBetalingen");
  await deleteMarked("payments", "description");

  console.log("\nBoekingen onder gemarkeerde sessies");
  await deleteChildrenOfMarked({
    parentTable: "pt_sessions",
    parentMarkerColumn: "notes",
    childTable: "pt_bookings",
    childForeignKey: "pt_session_id",
  });
  await deleteChildrenOfMarked({
    parentTable: "class_sessions",
    parentMarkerColumn: "notes",
    childTable: "bookings",
    childForeignKey: "session_id",
  });

  console.log("\nSessies");
  await deleteMarked("pt_sessions", "notes");
  await deleteMarked("class_sessions", "notes");

  console.log("\nTrainingsschema");
  await deleteMarked("program_exercises", "notes");
  await deleteMarked("program_days", "label");
  await deleteMarked("training_programs", "notes");

  console.log("\nLidmaatschap");
  await deleteMarked("memberships", "notes");

  console.log(
    "\nNiet aangeraakt: tmc.events (append-only), de trainers-rij, en alles zonder onze marker.",
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(
  APPLY
    ? `[seed-review-accounts] ${command} APPLY, er wordt geschreven`
    : `[seed-review-accounts] ${command} DRY RUN, er wordt niets geschreven (voeg --apply toe om te schrijven)`,
);

console.log("\nProfielen");
const profiles = await resolveProfiles();
if (!profiles) {
  console.error("\nGestopt: niet alle profielen bestaan.");
  process.exit(1);
}

if (command === "seed") {
  await seed(profiles);
} else {
  await teardown();
}

if (issues > 0) {
  console.error(`\nKlaar met ${issues} probleem(en).`);
  process.exit(1);
}
console.log("\nKlaar.");
