#!/usr/bin/env node
/**
 * Seed test data for the TMC member-system screens.
 *
 * Creates (idempotent):
 *   - 4 test trainers in the .test TLD (auth user + profile + trainers row)
 *   - 6 class types across all pillars except vrij_trainen
 *   - 12 schedule templates covering a realistic week
 *   - class_sessions for last week + this week + 3 weeks ahead
 *
 * Run:
 *   node --env-file=.env.local scripts/seed-test-data.mjs
 *
 * Requires env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with node --env-file=.env.local",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------- Trainers ---------------------------------------------------------

const TRAINERS = [
  {
    email: "marlon@trainers.test",
    firstName: "Marlon",
    lastName: "Verhoef",
    slug: "marlon",
    displayName: "Marlon Verhoef",
    bio: "Head trainer en oprichtster. Marlon combineert kettlebell, mobility en persoonlijke coaching. Werkt al jaren één-op-één met leden die serieus willen bouwen.",
    pillarSpecialties: ["kettlebell", "vrij_trainen"],
    ptTier: "premium",
    ptSessionRateCents: 9500,
    hourlyRateCents: null,
  },
  {
    email: "lieke@trainers.test",
    firstName: "Lieke",
    lastName: "van den Berg",
    slug: "lieke",
    displayName: "Lieke van den Berg",
    bio: "Kettlebell en senior-circuit specialist. Rustige, technische stijl met veel aandacht voor houding.",
    pillarSpecialties: ["kettlebell", "senior"],
    ptTier: "standard",
    ptSessionRateCents: 8000,
    hourlyRateCents: 4000,
  },
  {
    email: "tom@trainers.test",
    firstName: "Tom",
    lastName: "Huisman",
    slug: "tom",
    displayName: "Tom Huisman",
    bio: "Yoga & mobility docent. Gefocust op ademhaling, mobiliteit en de basis-bewegingen die de rest van je week dragen.",
    pillarSpecialties: ["yoga_mobility"],
    ptTier: "standard",
    ptSessionRateCents: 8000,
    hourlyRateCents: 4000,
  },
  {
    email: "sanne@trainers.test",
    firstName: "Sanne",
    lastName: "de Wit",
    slug: "sanne",
    displayName: "Sanne de Wit",
    bio: "Yoga en kids. Speels, helder en geduldig — of het nu volwassenen of kinderen zijn.",
    pillarSpecialties: ["yoga_mobility", "kids"],
    ptTier: "standard",
    ptSessionRateCents: 8000,
    hourlyRateCents: 4000,
  },
];

async function findAuthUserByEmail(email) {
  // admin.listUsers with email filter is the official way
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error) throw error;
  return data.users.find((u) => u.email === email) ?? null;
}

async function ensureTrainer(def) {
  let authUser = await findAuthUserByEmail(def.email);
  if (!authUser) {
    const { data, error } = await admin.auth.admin.createUser({
      email: def.email,
      email_confirm: true,
      user_metadata: { first_name: def.firstName, last_name: def.lastName },
    });
    if (error) throw new Error(`createUser ${def.email}: ${error.message}`);
    authUser = data.user;
    console.log(`  + auth user: ${def.email}`);
  } else {
    console.log(`  · auth user exists: ${def.email}`);
  }

  // Ensure profile role
  await admin
    .from("profiles")
    .upsert(
      {
        id: authUser.id,
        email: def.email,
        first_name: def.firstName,
        last_name: def.lastName,
        role: "trainer",
        age_category: "adult",
      },
      { onConflict: "id" },
    );

  // Ensure trainers row
  const { data: existing } = await admin
    .from("trainers")
    .select("id")
    .eq("slug", def.slug)
    .maybeSingle();

  if (existing) {
    console.log(`  · trainer row exists: ${def.slug}`);
    return { ...def, trainerId: existing.id };
  }

  const { data: inserted, error } = await admin
    .from("trainers")
    .insert({
      profile_id: authUser.id,
      slug: def.slug,
      display_name: def.displayName,
      bio: def.bio,
      pillar_specialties: def.pillarSpecialties,
      pt_tier: def.ptTier,
      pt_session_rate_cents: def.ptSessionRateCents,
      hourly_rate_in_cents: def.hourlyRateCents,
      is_active: true,
      is_pt_available: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(`insert trainer ${def.slug}: ${error.message}`);
  console.log(`  + trainer row: ${def.slug}`);
  return { ...def, trainerId: inserted.id };
}

// ---------- Class types ------------------------------------------------------

const CLASS_TYPES = [
  {
    slug: "kettlebell-basics",
    name: "Kettlebell Basics",
    pillar: "kettlebell",
    ageCategory: "adult",
    defaultCapacity: 8,
    defaultDurationMinutes: 45,
    description:
      "De kettlebell-fundamenten: swing, clean, deadlift. Techniek voor techniek.",
  },
  {
    slug: "kettlebell-power",
    name: "Kettlebell Power",
    pillar: "kettlebell",
    ageCategory: "adult",
    defaultCapacity: 8,
    defaultDurationMinutes: 60,
    description:
      "Voortgezette flows en complexes voor leden die de basis onder de knie hebben.",
  },
  {
    slug: "vinyasa-yoga",
    name: "Vinyasa Yoga",
    pillar: "yoga_mobility",
    ageCategory: "adult",
    defaultCapacity: 10,
    defaultDurationMinutes: 60,
    description: "Stromende sessie die ademhaling en beweging koppelt.",
  },
  {
    slug: "mobility-reset",
    name: "Mobility Reset",
    pillar: "yoga_mobility",
    ageCategory: "adult",
    defaultCapacity: 10,
    defaultDurationMinutes: 60,
    description:
      "Gerichte mobility-werk voor heupen, schouders, thoracale wervelkolom.",
  },
  {
    slug: "kids-movement",
    name: "Kids Movement",
    pillar: "kids",
    ageCategory: "kids",
    defaultCapacity: 8,
    defaultDurationMinutes: 45,
    description:
      "Speels, technisch en uitdagend. Voor kinderen 7 t/m 12 jaar.",
  },
  {
    slug: "senior-circuit",
    name: "Senior Circuit 65+",
    pillar: "senior",
    ageCategory: "senior",
    defaultCapacity: 6,
    defaultDurationMinutes: 45,
    description:
      "Circuit met lichte weerstand, balans en mobiliteit. Rustig tempo, veel aandacht.",
  },
];

async function ensureClassType(def) {
  const { data, error } = await admin
    .from("class_types")
    .upsert(
      {
        slug: def.slug,
        name: def.name,
        pillar: def.pillar,
        age_category: def.ageCategory,
        default_capacity: def.defaultCapacity,
        default_duration_minutes: def.defaultDurationMinutes,
        description: def.description,
        is_active: true,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  if (error) throw new Error(`upsert class_type ${def.slug}: ${error.message}`);
  console.log(`  · class_type: ${def.slug}`);
  return { ...def, classTypeId: data.id };
}

// ---------- Schedule templates -----------------------------------------------

// day_of_week: 0=Sunday, 1=Monday, ..., 6=Saturday
// Times are HH:MM local (Europe/Amsterdam is default in the app for display;
// we store as plain "time" type so template generates local wall-clock slots).
const TEMPLATES = [
  // Morning — Kettlebell
  { classSlug: "kettlebell-basics", trainerSlug: "marlon", dow: 1, time: "06:30", durationMinutes: 45, capacity: 8 },
  { classSlug: "kettlebell-basics", trainerSlug: "lieke",  dow: 3, time: "06:30", durationMinutes: 45, capacity: 8 },
  { classSlug: "kettlebell-power",  trainerSlug: "marlon", dow: 5, time: "06:30", durationMinutes: 60, capacity: 8 },

  // Morning — Yoga / Mobility
  { classSlug: "vinyasa-yoga",  trainerSlug: "tom",   dow: 1, time: "07:30", durationMinutes: 60, capacity: 10 },
  { classSlug: "mobility-reset",trainerSlug: "tom",   dow: 2, time: "07:00", durationMinutes: 60, capacity: 10 },
  { classSlug: "vinyasa-yoga",  trainerSlug: "sanne", dow: 3, time: "07:30", durationMinutes: 60, capacity: 10 },
  { classSlug: "mobility-reset",trainerSlug: "tom",   dow: 4, time: "07:00", durationMinutes: 60, capacity: 10 },
  { classSlug: "vinyasa-yoga",  trainerSlug: "tom",   dow: 5, time: "07:30", durationMinutes: 60, capacity: 10 },

  // Mid-morning — Senior
  { classSlug: "senior-circuit", trainerSlug: "lieke", dow: 2, time: "10:00", durationMinutes: 45, capacity: 6 },
  { classSlug: "senior-circuit", trainerSlug: "lieke", dow: 4, time: "10:00", durationMinutes: 45, capacity: 6 },

  // Afternoon — Kids
  { classSlug: "kids-movement", trainerSlug: "sanne", dow: 3, time: "16:00", durationMinutes: 45, capacity: 8 },
  { classSlug: "kids-movement", trainerSlug: "sanne", dow: 6, time: "10:00", durationMinutes: 45, capacity: 8 },

  // Evening — Kettlebell Power + Mobility
  { classSlug: "kettlebell-power", trainerSlug: "marlon", dow: 1, time: "17:30", durationMinutes: 60, capacity: 8 },
  { classSlug: "mobility-reset",   trainerSlug: "tom",    dow: 1, time: "18:30", durationMinutes: 60, capacity: 10 },
  { classSlug: "kettlebell-power", trainerSlug: "marlon", dow: 3, time: "17:30", durationMinutes: 60, capacity: 8 },
  { classSlug: "vinyasa-yoga",     trainerSlug: "sanne",  dow: 3, time: "18:30", durationMinutes: 60, capacity: 10 },
  { classSlug: "kettlebell-basics",trainerSlug: "lieke",  dow: 5, time: "17:30", durationMinutes: 60, capacity: 8 },
];

async function ensureTemplate(def, classTypeId, trainerId) {
  // Natural uniqueness: same class + trainer + day + start_time + active.
  const { data: existing } = await admin
    .from("schedule_templates")
    .select("id")
    .eq("class_type_id", classTypeId)
    .eq("trainer_id", trainerId)
    .eq("day_of_week", def.dow)
    .eq("start_time", def.time)
    .eq("is_active", true)
    .maybeSingle();

  if (existing) return existing.id;

  const today = new Date();
  const validFrom = today.toISOString().slice(0, 10);

  const { data, error } = await admin
    .from("schedule_templates")
    .insert({
      class_type_id: classTypeId,
      trainer_id: trainerId,
      day_of_week: def.dow,
      start_time: def.time,
      duration_minutes: def.durationMinutes,
      capacity: def.capacity,
      valid_from: validFrom,
      is_active: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(`insert template: ${error.message}`);
  return data.id;
}

// ---------- Sessions ---------------------------------------------------------

/** Start of ISO week (Monday 00:00 local) for a given date. */
function startOfWeekLocal(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayNum = d.getDay() || 7;
  d.setDate(d.getDate() - dayNum + 1);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function buildSessionStart(weekStart, dayOfWeek, hhmm) {
  // Map Sun(0)..Sat(6) to offset from Monday start.
  const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const date = addDays(weekStart, offset);
  const [h, m] = hhmm.split(":").map(Number);
  date.setHours(h, m, 0, 0);
  return date;
}

async function ensureSessionsForWeek(
  weekStart,
  templates,
  classTypes,
  trainers,
) {
  let inserted = 0;
  let skipped = 0;
  for (const def of TEMPLATES) {
    const ct = classTypes.find((c) => c.slug === def.classSlug);
    const tr = trainers.find((t) => t.slug === def.trainerSlug);
    if (!ct || !tr) {
      console.warn(
        `  ! skip template: class=${def.classSlug} trainer=${def.trainerSlug}`,
      );
      continue;
    }
    const templateId = templates[`${def.classSlug}|${def.trainerSlug}|${def.dow}|${def.time}`];
    if (!templateId) continue;

    const startAt = buildSessionStart(weekStart, def.dow, def.time);
    const endAt = new Date(startAt.getTime() + def.durationMinutes * 60000);

    const { error } = await admin
      .from("class_sessions")
      .upsert(
        {
          class_type_id: ct.classTypeId,
          trainer_id: tr.trainerId,
          template_id: templateId,
          pillar: ct.pillar,
          age_category: ct.ageCategory,
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
          capacity: def.capacity,
          status: "scheduled",
        },
        { onConflict: "template_id,start_at", ignoreDuplicates: true },
      );
    if (error) {
      console.warn(`  ! session insert: ${error.message}`);
      skipped += 1;
    } else {
      inserted += 1;
    }
  }
  return { inserted, skipped };
}

// ---------- Main -------------------------------------------------------------

async function main() {
  console.log("Seeding test data...\n");

  console.log("Trainers:");
  const trainers = [];
  for (const def of TRAINERS) {
    trainers.push(await ensureTrainer(def));
  }

  console.log("\nClass types:");
  const classTypes = [];
  for (const def of CLASS_TYPES) {
    classTypes.push(await ensureClassType(def));
  }

  console.log("\nSchedule templates:");
  const templates = {};
  for (const def of TEMPLATES) {
    const ct = classTypes.find((c) => c.slug === def.classSlug);
    const tr = trainers.find((t) => t.slug === def.trainerSlug);
    if (!ct || !tr) {
      console.warn(
        `  ! missing class_type=${def.classSlug} or trainer=${def.trainerSlug}`,
      );
      continue;
    }
    const id = await ensureTemplate(def, ct.classTypeId, tr.trainerId);
    templates[`${def.classSlug}|${def.trainerSlug}|${def.dow}|${def.time}`] = id;
    console.log(`  · ${def.classSlug} / ${def.trainerSlug} / dow=${def.dow} / ${def.time}`);
  }

  console.log("\nSessions — last week, this week, +3 weeks ahead:");
  const thisWeek = startOfWeekLocal(new Date());
  const weeks = [-1, 0, 1, 2, 3];
  for (const offset of weeks) {
    const weekStart = addDays(thisWeek, offset * 7);
    const result = await ensureSessionsForWeek(
      weekStart,
      templates,
      classTypes,
      trainers,
    );
    console.log(
      `  · week of ${weekStart.toISOString().slice(0, 10)} — attempted ${
        result.inserted + result.skipped
      }`,
    );
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
