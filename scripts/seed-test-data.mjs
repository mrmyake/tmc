#!/usr/bin/env node
/**
 * Seed test data for the TMC member-system screens.
 *
 * Pulls the real trainers from Sanity, ensures matching Supabase rows
 * (linked via sanity_id), then seeds class types, schedule templates, and
 * class sessions for last week + this week + 3 weeks ahead. Idempotent —
 * re-running syncs changes and upserts.
 *
 * Times are written as Europe/Amsterdam wall-clock, converted to UTC via
 * Intl. Works across CET/CEST (non-transition moments only — we don't
 * seed at 02:30 on DST-switch nights).
 *
 * Run:
 *   node --env-file=.env.local scripts/seed-test-data.mjs
 *
 * Requires env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_SANITY_PROJECT_ID (default hn9lkvte)
 *   NEXT_PUBLIC_SANITY_DATASET (default production)
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createSanityClient } from "@sanity/client";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with node --env-file=.env.local",
  );
  process.exit(1);
}

const admin = createSupabaseClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sanity = createSanityClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "hn9lkvte",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production",
  apiVersion: "2024-01-01",
  useCdn: false,
});

const TIME_ZONE = "Europe/Amsterdam";

// ---------- Time helpers -----------------------------------------------------

/** Convert a wall-clock date/time in a given timezone to a UTC Date. */
function zonedWallClockToUtc(year, month, day, hour, minute, timeZone) {
  const firstTry = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(firstTry));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const diffMinutes =
    hour * 60 + minute - (get("hour") * 60 + get("minute"));
  return new Date(firstTry + diffMinutes * 60_000);
}

/** Monday 00:00 Europe/Amsterdam for the ISO week of `ref`. */
function mondayOfWeekInAmsterdam(ref) {
  // What date is "ref" in Amsterdam?
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(ref);
  const y = Number(parts.find((p) => p.type === "year").value);
  const m = Number(parts.find((p) => p.type === "month").value);
  const d = Number(parts.find((p) => p.type === "day").value);
  const wdLabel = parts.find((p) => p.type === "weekday").value; // e.g. "Tue"
  const wdIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    wdLabel,
  );
  const isoDow = wdIdx === 0 ? 7 : wdIdx;
  // Subtract (isoDow - 1) days to land on Monday
  const mondayDate = new Date(Date.UTC(y, m - 1, d));
  mondayDate.setUTCDate(mondayDate.getUTCDate() - (isoDow - 1));
  return {
    year: mondayDate.getUTCFullYear(),
    month: mondayDate.getUTCMonth() + 1,
    day: mondayDate.getUTCDate(),
  };
}

function addDaysUtc(ymd, days) {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day));
  d.setUTCDate(d.getUTCDate() + days);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

// ---------- Trainer sync -----------------------------------------------------

const TEST_TRAINER_SLUGS = ["marlon", "lieke", "tom", "sanne", "remi", "fenna"];

/**
 * Map Sanity `role` to pillar_specialties we want on the Supabase row.
 * The real specialties can be overridden later by admin; this is just a
 * sensible default so schedule_templates pick the right trainer.
 */
const ROLE_TO_PILLARS = {
  head_trainer: ["kettlebell", "vrij_trainen"],
  personal_trainer: ["kettlebell", "senior"],
  yoga_mobility: ["yoga_mobility", "kids"],
};

const ROLE_TO_PT_TIER = {
  head_trainer: "premium",
  personal_trainer: "standard",
  yoga_mobility: "standard",
};

function emailForSlug(slug) {
  return `${slug}@trainers.test`;
}

function slugifyName(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .split("-")[0];
}

async function findAuthUserByEmail(email) {
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

async function deleteAuthUserByEmail(email) {
  const user = await findAuthUserByEmail(email);
  if (!user) return;
  await admin.auth.admin.deleteUser(user.id);
}

async function cleanupOldTestTrainers() {
  console.log("Cleanup:");

  // Find current test trainers by slug
  const { data: currentTrainers } = await admin
    .from("trainers")
    .select("id, slug, profile_id")
    .in("slug", TEST_TRAINER_SLUGS);

  if (!currentTrainers || currentTrainers.length === 0) {
    console.log("  · nothing to clean");
    return;
  }

  const trainerIds = currentTrainers.map((t) => t.id);

  // Delete sessions → templates → trainers → auth users
  const { error: sErr } = await admin
    .from("class_sessions")
    .delete()
    .in("trainer_id", trainerIds);
  if (sErr) console.warn("  ! delete sessions:", sErr.message);

  const { error: tplErr } = await admin
    .from("schedule_templates")
    .delete()
    .in("trainer_id", trainerIds);
  if (tplErr) console.warn("  ! delete templates:", tplErr.message);

  const { error: trErr } = await admin
    .from("trainers")
    .delete()
    .in("id", trainerIds);
  if (trErr) console.warn("  ! delete trainers:", trErr.message);

  for (const tr of currentTrainers) {
    const email = emailForSlug(tr.slug);
    try {
      await deleteAuthUserByEmail(email);
    } catch (e) {
      console.warn(`  ! delete auth user ${email}:`, e.message);
    }
  }

  console.log(
    `  · removed ${trainerIds.length} trainers + linked templates/sessions/auth users`,
  );
}

async function syncSanityTrainers() {
  console.log("\nTrainers (from Sanity):");

  const sanityTrainers = await sanity.fetch(`
    *[_type == "trainer" && !(_id in path("drafts.**"))]{
      _id, name, role, bio
    } | order(order asc)
  `);

  if (sanityTrainers.length === 0) {
    throw new Error(
      "No trainers found in Sanity. Add them via /studio first.",
    );
  }

  const rows = [];
  for (const doc of sanityTrainers) {
    const slug = slugifyName(doc.name);
    const email = emailForSlug(slug);
    const role = doc.role ?? "personal_trainer";
    const pillars = ROLE_TO_PILLARS[role] ?? ["vrij_trainen"];
    const ptTier = ROLE_TO_PT_TIER[role] ?? "standard";

    // Auth user
    let user = await findAuthUserByEmail(email);
    if (!user) {
      const firstName = doc.name.split(" ")[0];
      const lastName = doc.name.split(" ").slice(1).join(" ") || firstName;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName },
      });
      if (error) throw new Error(`createUser ${email}: ${error.message}`);
      user = data.user;
    }

    // Profile: force role=trainer
    const firstName = doc.name.split(" ")[0];
    const lastName = doc.name.split(" ").slice(1).join(" ") || firstName;
    await admin
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email,
          first_name: firstName,
          last_name: lastName,
          role: "trainer",
          age_category: "adult",
        },
        { onConflict: "id" },
      );

    // Bio — Sanity bio may be portable-text. Fallback to a plain string.
    const bioText =
      typeof doc.bio === "string"
        ? doc.bio
        : Array.isArray(doc.bio)
          ? doc.bio
              .map((b) => (b.children ?? []).map((c) => c.text).join(""))
              .join("\n\n")
          : null;

    // Trainers row (upsert on slug)
    const { data: inserted, error } = await admin
      .from("trainers")
      .upsert(
        {
          profile_id: user.id,
          sanity_id: doc._id,
          slug,
          display_name: doc.name,
          bio: bioText,
          pillar_specialties: pillars,
          pt_tier: ptTier,
          pt_session_rate_cents: ptTier === "premium" ? 9500 : 8000,
          hourly_rate_in_cents: ptTier === "premium" ? null : 4000,
          is_active: true,
          is_pt_available: true,
        },
        { onConflict: "slug" },
      )
      .select("id, slug")
      .single();
    if (error) throw new Error(`upsert trainer ${slug}: ${error.message}`);
    rows.push({
      trainerId: inserted.id,
      slug,
      name: doc.name,
      pillars,
      role,
    });
    console.log(
      `  · ${slug} — ${doc.name} (${role}) → pillars: ${pillars.join(", ")}`,
    );
  }

  return rows;
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
    description: "Speels, technisch en uitdagend. Voor kinderen 7 t/m 12 jaar.",
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

async function ensureClassTypes() {
  console.log("\nClass types:");
  const out = [];
  for (const def of CLASS_TYPES) {
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
    if (error)
      throw new Error(`upsert class_type ${def.slug}: ${error.message}`);
    out.push({ ...def, classTypeId: data.id });
    console.log(`  · ${def.slug}`);
  }
  return out;
}

// ---------- Schedule templates -----------------------------------------------

/**
 * Build templates dynamically: pick the first trainer whose pillar_specialties
 * include the class pillar. If none found we skip with a warning.
 */
function pickTrainerForPillar(pillar, trainers, { notSameAs } = {}) {
  const candidates = trainers.filter((t) =>
    t.pillars.includes(pillar) && t.slug !== notSameAs,
  );
  if (candidates.length === 0) return null;
  return candidates[0];
}

function buildTemplateDefs(trainers) {
  const marlon = trainers.find((t) => t.slug === "marlon");
  const kettlebellBackup = trainers.find(
    (t) => t.pillars.includes("kettlebell") && t.slug !== "marlon",
  );
  const yogaTrainer = trainers.find((t) => t.pillars.includes("yoga_mobility"));
  const kidsTrainer = trainers.find((t) => t.pillars.includes("kids"));
  const seniorTrainer = trainers.find((t) => t.pillars.includes("senior"));

  const templates = [];

  // Kettlebell morning + evening
  if (marlon) {
    templates.push(
      { classSlug: "kettlebell-basics", trainerSlug: marlon.slug, dow: 1, time: "06:30", durationMinutes: 45, capacity: 8 },
      { classSlug: "kettlebell-power",  trainerSlug: marlon.slug, dow: 5, time: "06:30", durationMinutes: 60, capacity: 8 },
      { classSlug: "kettlebell-power",  trainerSlug: marlon.slug, dow: 1, time: "17:30", durationMinutes: 60, capacity: 8 },
      { classSlug: "kettlebell-power",  trainerSlug: marlon.slug, dow: 3, time: "17:30", durationMinutes: 60, capacity: 8 },
    );
  }
  if (kettlebellBackup) {
    templates.push(
      { classSlug: "kettlebell-basics", trainerSlug: kettlebellBackup.slug, dow: 3, time: "06:30", durationMinutes: 45, capacity: 8 },
      { classSlug: "kettlebell-basics", trainerSlug: kettlebellBackup.slug, dow: 5, time: "17:30", durationMinutes: 60, capacity: 8 },
    );
  }

  // Yoga / Mobility morning + evening
  if (yogaTrainer) {
    templates.push(
      { classSlug: "vinyasa-yoga",   trainerSlug: yogaTrainer.slug, dow: 1, time: "07:30", durationMinutes: 60, capacity: 10 },
      { classSlug: "mobility-reset", trainerSlug: yogaTrainer.slug, dow: 2, time: "07:00", durationMinutes: 60, capacity: 10 },
      { classSlug: "vinyasa-yoga",   trainerSlug: yogaTrainer.slug, dow: 3, time: "07:30", durationMinutes: 60, capacity: 10 },
      { classSlug: "mobility-reset", trainerSlug: yogaTrainer.slug, dow: 4, time: "07:00", durationMinutes: 60, capacity: 10 },
      { classSlug: "vinyasa-yoga",   trainerSlug: yogaTrainer.slug, dow: 5, time: "07:30", durationMinutes: 60, capacity: 10 },
      { classSlug: "mobility-reset", trainerSlug: yogaTrainer.slug, dow: 1, time: "18:30", durationMinutes: 60, capacity: 10 },
      { classSlug: "vinyasa-yoga",   trainerSlug: yogaTrainer.slug, dow: 3, time: "18:30", durationMinutes: 60, capacity: 10 },
    );
  }

  // Senior
  if (seniorTrainer) {
    templates.push(
      { classSlug: "senior-circuit", trainerSlug: seniorTrainer.slug, dow: 2, time: "10:00", durationMinutes: 45, capacity: 6 },
      { classSlug: "senior-circuit", trainerSlug: seniorTrainer.slug, dow: 4, time: "10:00", durationMinutes: 45, capacity: 6 },
    );
  }

  // Kids
  if (kidsTrainer) {
    templates.push(
      { classSlug: "kids-movement", trainerSlug: kidsTrainer.slug, dow: 3, time: "16:00", durationMinutes: 45, capacity: 8 },
      { classSlug: "kids-movement", trainerSlug: kidsTrainer.slug, dow: 6, time: "10:00", durationMinutes: 45, capacity: 8 },
    );
  }

  return templates;
}

async function ensureTemplates(templateDefs, classTypes, trainers) {
  console.log("\nSchedule templates:");
  const map = {};
  for (const def of templateDefs) {
    const ct = classTypes.find((c) => c.slug === def.classSlug);
    const tr = trainers.find((t) => t.slug === def.trainerSlug);
    if (!ct || !tr) {
      console.warn(
        `  ! skip: class=${def.classSlug} trainer=${def.trainerSlug}`,
      );
      continue;
    }

    const { data: existing } = await admin
      .from("schedule_templates")
      .select("id")
      .eq("class_type_id", ct.classTypeId)
      .eq("trainer_id", tr.trainerId)
      .eq("day_of_week", def.dow)
      .eq("start_time", def.time)
      .maybeSingle();

    let id = existing?.id;
    if (!id) {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await admin
        .from("schedule_templates")
        .insert({
          class_type_id: ct.classTypeId,
          trainer_id: tr.trainerId,
          day_of_week: def.dow,
          start_time: def.time,
          duration_minutes: def.durationMinutes,
          capacity: def.capacity,
          valid_from: today,
          is_active: true,
        })
        .select("id")
        .single();
      if (error) throw new Error(`insert template: ${error.message}`);
      id = data.id;
    }
    map[`${def.classSlug}|${def.trainerSlug}|${def.dow}|${def.time}`] = id;
    console.log(
      `  · ${def.classSlug} / ${def.trainerSlug} / dow=${def.dow} / ${def.time} (${def.durationMinutes}min)`,
    );
  }
  return map;
}

// ---------- Sessions ---------------------------------------------------------

async function ensureSessionsForWeek(mondayYmd, templateDefs, templateIds, classTypes, trainers) {
  let touched = 0;
  let errors = 0;
  for (const def of templateDefs) {
    const ct = classTypes.find((c) => c.slug === def.classSlug);
    const tr = trainers.find((t) => t.slug === def.trainerSlug);
    const templateId =
      templateIds[`${def.classSlug}|${def.trainerSlug}|${def.dow}|${def.time}`];
    if (!ct || !tr || !templateId) continue;

    // ISO day-of-week: 1=Mon..7=Sun. Our def.dow uses Sun=0..Sat=6 (JS style).
    const mondayOffset = def.dow === 0 ? 6 : def.dow - 1;
    const dayYmd = addDaysUtc(mondayYmd, mondayOffset);

    const [h, m] = def.time.split(":").map(Number);
    const startUtc = zonedWallClockToUtc(
      dayYmd.year,
      dayYmd.month,
      dayYmd.day,
      h,
      m,
      TIME_ZONE,
    );
    const endUtc = new Date(startUtc.getTime() + def.durationMinutes * 60_000);

    const { error } = await admin
      .from("class_sessions")
      .upsert(
        {
          class_type_id: ct.classTypeId,
          trainer_id: tr.trainerId,
          template_id: templateId,
          pillar: ct.pillar,
          age_category: ct.ageCategory,
          start_at: startUtc.toISOString(),
          end_at: endUtc.toISOString(),
          capacity: def.capacity,
          status: "scheduled",
        },
        { onConflict: "template_id,start_at", ignoreDuplicates: true },
      );
    if (error) {
      errors += 1;
      console.warn(`  ! session: ${error.message}`);
    } else {
      touched += 1;
    }
  }
  return { touched, errors };
}

// ---------- Main -------------------------------------------------------------

async function main() {
  console.log("Seeding test data...\n");

  await cleanupOldTestTrainers();
  const trainers = await syncSanityTrainers();
  const classTypes = await ensureClassTypes();
  const templateDefs = buildTemplateDefs(trainers);
  const templateIds = await ensureTemplates(templateDefs, classTypes, trainers);

  console.log("\nSessions (last week + this week + 3 weeks ahead, Europe/Amsterdam):");
  const today = new Date();
  const thisMonday = mondayOfWeekInAmsterdam(today);
  for (const offset of [-1, 0, 1, 2, 3]) {
    const weekMonday = addDaysUtc(thisMonday, offset * 7);
    const r = await ensureSessionsForWeek(
      weekMonday,
      templateDefs,
      templateIds,
      classTypes,
      trainers,
    );
    console.log(
      `  · week of ${String(weekMonday.year).padStart(4, "0")}-${String(weekMonday.month).padStart(2, "0")}-${String(weekMonday.day).padStart(2, "0")} — ${r.touched} sessions${r.errors ? ` (${r.errors} errors)` : ""}`,
    );
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
