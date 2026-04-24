"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyIdentifier, normalizePhone, InvalidPhoneError } from "./normalize-phone";

export type CheckInMethod = "self_tablet" | "admin_tablet" | "admin_web";
export type AccessType =
  | "membership"
  | "guest_pass"
  | "credit"
  | "drop_in"
  | "trial"
  | "comp";

export type CheckInResult =
  | {
      ok: true;
      checkInId: string;
      profile: {
        id: string;
        firstName: string;
        lastInitial: string;
      };
      accessType: AccessType;
      pillar: string;
    }
  | { ok: false; reason: CheckInFailReason; message: string };

export type CheckInFailReason =
  | "identifier_not_found"
  | "invalid_identifier"
  | "no_eligible_access"
  | "already_checked_in"
  | "session_not_found"
  | "session_not_today"
  | "pillar_check_in_disabled"
  | "unauthorized"
  | "db_error";

const FAIL_COPY: Record<CheckInFailReason, string> = {
  identifier_not_found: "Nummer niet gevonden. Spreek Marlon even aan.",
  invalid_identifier: "Dit nummer klopt niet. Probeer opnieuw.",
  no_eligible_access:
    "Je hebt vandaag geen plek geboekt en geen vrij-trainen toegang. Spreek Marlon even aan.",
  already_checked_in: "Je bent al ingecheckt voor dit moment.",
  session_not_found: "Sessie niet gevonden.",
  session_not_today: "Deze sessie staat niet voor vandaag.",
  pillar_check_in_disabled:
    "Check-in staat uit voor dit type training. Spreek Marlon even aan.",
  unauthorized: "Geen toegang tot deze actie.",
  db_error: "Er ging iets mis. Probeer opnieuw.",
};

interface SettingsRow {
  check_in_enabled: boolean | null;
  check_in_pillars: string[] | null;
}

async function readCheckInSettings(): Promise<SettingsRow> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("booking_settings")
    .select("check_in_enabled, check_in_pillars")
    .eq("id", "singleton")
    .maybeSingle();
  return (
    data ?? {
      check_in_enabled: true,
      check_in_pillars: ["yoga_mobility", "kettlebell", "vrij_trainen"],
    }
  );
}

/**
 * Check-in op basis van tablet-input (phone of member_code). Default
 * method = self_tablet; admin-modus gebruikt admin_tablet.
 *
 * Als sessionId meegegeven: check-in wordt aan die sessie gekoppeld +
 * unique-constraint voorkomt dubbele check-in per sessie. Zonder
 * sessionId: vrij-trainen pad (1 per dag per pillar).
 *
 * Deze action wordt aangeroepen vanaf een publieke /checkin route —
 * auth.uid() is daar NULL. We schrijven via admin-client; legitimatie
 * is de fysieke aanwezigheid bij de tablet.
 */
export async function checkInByIdentifier(input: {
  identifier: string;
  pillar: string;
  sessionId?: string;
  method?: CheckInMethod;
  checkedInByProfileId?: string;
}): Promise<CheckInResult> {
  const method: CheckInMethod = input.method ?? "self_tablet";

  const settings = await readCheckInSettings();
  if (!settings.check_in_enabled) {
    return fail("pillar_check_in_disabled");
  }
  if (!(settings.check_in_pillars ?? []).includes(input.pillar)) {
    return fail("pillar_check_in_disabled");
  }

  // Identifier parsen
  const cls = classifyIdentifier(input.identifier);
  if (!cls) return fail("invalid_identifier");

  // Profile lookup
  const admin = createAdminClient();
  const lookupCol = cls.kind === "phone" ? "phone" : "member_code";
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("id, first_name, last_name")
    .eq(lookupCol, cls.value)
    .maybeSingle();

  if (profileErr) {
    console.error("[checkInByIdentifier] profile lookup", profileErr);
    return fail("db_error");
  }
  if (!profile) return fail("identifier_not_found");

  return checkInForProfile({
    profileId: profile.id,
    pillar: input.pillar,
    sessionId: input.sessionId,
    method,
    checkedInByProfileId: input.checkedInByProfileId,
    profileName: {
      firstName: profile.first_name ?? "",
      lastInitial: (profile.last_name ?? "").charAt(0).toUpperCase(),
    },
  });
}

/**
 * Admin/trainer checkt iemand anders in via admin-modus of /app/admin.
 * Verifieert admin-rol op caller-side (server action context heeft
 * auth.uid() wel).
 */
export async function checkInByProfileId(input: {
  profileId: string;
  pillar: string;
  sessionId?: string;
  accessType?: AccessType;
  method?: CheckInMethod;
  notes?: string;
}): Promise<CheckInResult> {
  const authCheck = await requireStaff();
  if (!authCheck.ok) return fail("unauthorized");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", input.profileId)
    .maybeSingle();

  return checkInForProfile({
    profileId: input.profileId,
    pillar: input.pillar,
    sessionId: input.sessionId,
    method: input.method ?? "admin_web",
    checkedInByProfileId: authCheck.userId,
    accessType: input.accessType,
    notes: input.notes,
    profileName: {
      firstName: profile?.first_name ?? "",
      lastInitial: (profile?.last_name ?? "").charAt(0).toUpperCase(),
    },
  });
}

/**
 * Admin-only undo binnen een korte window. Verwijdert de check-in rij
 * zodat de telling + cap-logica weer klopt.
 */
export async function undoCheckIn(checkInId: string): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const authCheck = await requireStaff();
  if (!authCheck.ok) {
    return { ok: false, message: FAIL_COPY.unauthorized };
  }
  const admin = createAdminClient();
  const { error } = await admin.from("check_ins").delete().eq("id", checkInId);
  if (error) {
    console.error("[undoCheckIn] delete", error);
    return { ok: false, message: FAIL_COPY.db_error };
  }
  revalidatePath("/checkin");
  revalidatePath("/app/admin");
  return { ok: true };
}

/**
 * Creëert een walk-in profile + auth.user voor iemand die ter plekke
 * binnenloopt zonder account. Admin-only; tablet admin-modus "Nieuwe
 * gast/drop-in". E-mail wordt een unieke placeholder tenzij opgegeven.
 */
export async function createWalkInProfile(input: {
  firstName: string;
  lastName: string;
  phoneRaw: string;
  email?: string;
}): Promise<
  | { ok: true; profileId: string }
  | { ok: false; message: string }
> {
  const authCheck = await requireStaff();
  if (!authCheck.ok) return { ok: false, message: FAIL_COPY.unauthorized };

  let phone: string;
  try {
    phone = normalizePhone(input.phoneRaw);
  } catch (err) {
    if (err instanceof InvalidPhoneError) {
      return { ok: false, message: err.message };
    }
    throw err;
  }

  const admin = createAdminClient();

  // Dubbel-check op phone — als er al een profile bestaat, gebruik die.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (existing) {
    return { ok: true, profileId: existing.id };
  }

  // Maak auth.user aan. Walk-ins krijgen een generated placeholder-
  // email tenzij de admin er eentje invult. email_confirm=true zodat
  // de user direct "bestaat" voor toekomstige magic-link upgrade.
  const email =
    input.email?.trim() ||
    `walkin-${phone.slice(-8)}@walkin.tmc.internal`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      first_name: input.firstName,
      last_name: input.lastName,
      phone,
    },
  });
  if (createErr || !created.user) {
    console.error("[createWalkInProfile] createUser", createErr);
    return { ok: false, message: FAIL_COPY.db_error };
  }

  // De trigger handle_new_auth_user vult profiles + member_code al aan.
  // Als phone NIET in user_metadata belandt (trigger-race), zet 'm hier
  // expliciet via update.
  await admin
    .from("profiles")
    .update({ phone, first_name: input.firstName, last_name: input.lastName })
    .eq("id", created.user.id);

  return { ok: true, profileId: created.user.id };
}

/**
 * Bepaal aantal check-ins voor een profile in huidige ISO-week per
 * pillar. Gebruikt door de nieuwe cap-check (PR3) en de member-UI
 * counter op /app/vrij-trainen + /app/abonnement.
 */
export async function getCheckInsThisWeek(
  profileId: string,
  pillar: string,
): Promise<number> {
  const admin = createAdminClient();
  const now = new Date();
  // ISO-week start: monday 00:00 UTC (approximatie; de cap-logica
  // elders gebruikt bookings.iso_week gedenormaliseerd, voor check-ins
  // berekenen we hier in TS om aan het schema-agnostische pad te
  // houden).
  const day = now.getUTCDay() || 7;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - (day - 1));
  monday.setUTCHours(0, 0, 0, 0);

  const { count, error } = await admin
    .from("check_ins")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("pillar", pillar)
    .gte("checked_in_at", monday.toISOString());
  if (error) {
    console.error("[getCheckInsThisWeek]", error);
    return 0;
  }
  return count ?? 0;
}

// ----------------------------------------------------------------------------
// Interne helpers
// ----------------------------------------------------------------------------

type ProfileNameHint = { firstName: string; lastInitial: string };

async function checkInForProfile(input: {
  profileId: string;
  pillar: string;
  sessionId?: string;
  method: CheckInMethod;
  checkedInByProfileId?: string;
  accessType?: AccessType;
  notes?: string;
  profileName: ProfileNameHint;
}): Promise<CheckInResult> {
  const admin = createAdminClient();

  // Valideer session als meegegeven
  if (input.sessionId) {
    const { data: session } = await admin
      .from("class_sessions")
      .select("id, start_at, end_at, pillar")
      .eq("id", input.sessionId)
      .maybeSingle();
    if (!session) return fail("session_not_found");
    if (session.pillar !== input.pillar) {
      return fail("pillar_check_in_disabled");
    }
    const todayUtc = new Date().toISOString().slice(0, 10);
    const sessionDate = new Date(session.start_at).toISOString().slice(0, 10);
    if (sessionDate !== todayUtc) {
      return fail("session_not_today");
    }
  }

  // Access-type resolven als niet expliciet — simpele regel: bestaande
  // active/paused membership met pillar coverage = "membership", anders
  // "drop_in". Guest-pass / credit / trial / comp flows komen in PR2
  // waar admin ze expliciet selecteert.
  let accessType: AccessType = input.accessType ?? "membership";
  if (!input.accessType) {
    const { data: memberships } = await admin
      .from("memberships")
      .select("covered_pillars, status, plan_type, credits_remaining")
      .eq("profile_id", input.profileId)
      .in("status", ["active", "paused"]);
    const covers = (memberships ?? []).find((m) =>
      (m.covered_pillars ?? []).includes(input.pillar),
    );
    if (covers) {
      accessType = "membership";
    } else {
      const credit = (memberships ?? []).find(
        (m) =>
          m.plan_type === "ten_ride_card" &&
          (m.credits_remaining ?? 0) > 0,
      );
      accessType = credit ? "credit" : "drop_in";
    }
    if (accessType === "drop_in") {
      // Self-mode stuurt drop-ins niet door — admin moet betaling regelen.
      if (input.method === "self_tablet") {
        return fail("no_eligible_access");
      }
    }
  }

  const { data: inserted, error: insertErr } = await admin
    .from("check_ins")
    .insert({
      profile_id: input.profileId,
      session_id: input.sessionId ?? null,
      booking_id: null, // PR2 wired als booking_id lookup
      checked_in_by: input.checkedInByProfileId ?? null,
      check_in_method: input.method,
      access_type: accessType,
      pillar: input.pillar,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      return fail("already_checked_in");
    }
    console.error("[checkInForProfile] insert", insertErr);
    return fail("db_error");
  }

  // Credit-decrement voor ten-ride-kaart
  if (accessType === "credit") {
    await decrementCredit(input.profileId);
  }

  revalidatePath("/checkin");
  revalidatePath("/app/admin");

  return {
    ok: true,
    checkInId: inserted.id,
    profile: {
      id: input.profileId,
      firstName: input.profileName.firstName,
      lastInitial: input.profileName.lastInitial,
    },
    accessType,
    pillar: input.pillar,
  };
}

async function decrementCredit(profileId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("memberships")
    .select("id, credits_remaining")
    .eq("profile_id", profileId)
    .eq("plan_type", "ten_ride_card")
    .eq("status", "active")
    .gt("credits_remaining", 0)
    .limit(1)
    .maybeSingle();
  if (!data) return;
  await admin
    .from("memberships")
    .update({ credits_remaining: (data.credits_remaining ?? 1) - 1 })
    .eq("id", data.id);
}

async function requireStaff(): Promise<
  { ok: true; userId: string } | { ok: false }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "trainer") {
    return { ok: false };
  }
  return { ok: true, userId: user.id };
}

function fail(reason: CheckInFailReason): CheckInResult {
  return { ok: false, reason, message: FAIL_COPY[reason] };
}
