import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActorType, EmitEventInput } from "@/lib/events/emit";
import type { RequireTrainerOrAdminResult } from "@/lib/admin/require-trainer-or-admin";
import { setMemberAttendance } from "@/lib/attendance/core";
import { normalizePhone, InvalidPhoneError } from "./normalize-phone";
import { zonedWallClockToUtc, amsterdamYmd } from "@/lib/scheduling/amsterdam-time";

/**
 * Kern van de check-in-acties, zonder "use server", zonder next/headers en
 * zonder eigen Supabase-client. Elke functie krijgt het gate-resultaat van
 * requireTrainerOrAdmin() als eerste argument en weigert vóór ze ook maar
 * één keer naar deps kijkt. Dat is de hele reden van dit bestand: de tests
 * in scripts/check-in/ bewijzen per actie dat een geweigerde gate nooit de
 * database raakt (fix/checkin-cookie-gate). Tot die PR accepteerden deze
 * acties ook een ongetekend cookie tmc_admin_unlock="1" als autorisatie;
 * dat cookie bestaat niet meer en wordt nergens meer gelezen.
 *
 * De "use server"-wrappers staan in actions.ts en admin-queries.ts en doen
 * niets anders dan gate ophalen, echte deps meegeven en doorgeven.
 */

export interface CheckInDeps {
  /** Service-role-client (createAdminClient()); bypasst RLS. */
  admin: SupabaseClient;
  emit: (input: EmitEventInput) => Promise<boolean>;
  revalidate: (path: string) => void;
}

export type StaffGate = RequireTrainerOrAdminResult;
export type StaffActor = { userId: string; actorType: "admin" | "trainer" };

/** Herkomst van een check-in. self_tablet bestaat niet meer (check-in-spoor PR 1). */
export type CheckInMethod = "admin_tablet" | "admin_web";
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
  | "weekly_cap_reached"
  | "unauthorized"
  | "db_error";

// COPY: confirm met Marlon (alle teksten in deze map)
export const FAIL_COPY: Record<CheckInFailReason, string> = {
  identifier_not_found: "Nummer niet gevonden. Spreek Marlon even aan.",
  invalid_identifier: "Dit nummer klopt niet. Probeer opnieuw.",
  no_eligible_access:
    "Je hebt vandaag geen plek geboekt en geen vrij-trainen toegang. Spreek Marlon even aan.",
  already_checked_in: "Je bent al ingecheckt voor dit moment.",
  session_not_found: "Sessie niet gevonden.",
  session_not_today: "Deze sessie staat niet voor vandaag.",
  pillar_check_in_disabled:
    "Check-in staat uit voor dit type training. Spreek Marlon even aan.",
  weekly_cap_reached:
    "Je weekcap voor deze discipline is bereikt. Spreek Marlon even aan.",
  unauthorized: "Geen toegang tot deze actie.",
  db_error: "Er ging iets mis. Probeer opnieuw.",
};

export interface TodayCheckIn {
  id: string;
  firstName: string;
  lastInitial: string;
  pillar: string;
  accessType: AccessType;
  checkInMethod: CheckInMethod;
  checkedInAt: string; // ISO
}

export interface AdminProfileRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  memberCode: string;
  coveredPillars: string[];
}

export interface TodayCheckInRow {
  id: string;
  profileName: string;
  timeLabel: string; // "HH:MM" Amsterdam
  pillar: string;
  accessType: AccessType;
}

export function fail(reason: CheckInFailReason): CheckInResult {
  return { ok: false, reason, message: FAIL_COPY[reason] };
}

const AMSTERDAM_TIME = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// ----------------------------------------------------------------------------
// Acties (elk begint met de gate)
// ----------------------------------------------------------------------------

/**
 * Staff checkt iemand anders in vanaf /checkin of /app/admin. Een onbekende
 * method (bijvoorbeeld het oude self_tablet van een verouderde client)
 * wordt admin_web, zodat de herkomst op de rij blijft kloppen.
 *
 * Met sessionId gaat de check-in door de gedeelde aanwezigheidskern
 * (src/lib/attendance/core.ts): een booked booking is verplicht, access_type
 * komt uit de booking en er worden geen credits geraakt (die zijn bij het
 * boeken al afgeschreven). Zonder sessionId is het vrij trainen: het
 * pillar-pad hieronder, met de credit-aftrek per check-in.
 */
export async function checkInByProfileIdCore(
  gate: StaffGate,
  deps: CheckInDeps,
  input: {
    profileId: string;
    pillar: string;
    sessionId?: string;
    accessType?: AccessType;
    method?: CheckInMethod;
    notes?: string;
  },
): Promise<CheckInResult> {
  if (!gate.ok) return fail("unauthorized");

  const { data: profile } = await deps.admin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", input.profileId)
    .maybeSingle();
  const profileName: ProfileNameHint = {
    firstName: profile?.first_name ?? "",
    lastInitial: (profile?.last_name ?? "").charAt(0).toUpperCase(),
  };
  const method: CheckInMethod = input.method === "admin_tablet" ? "admin_tablet" : "admin_web";
  const actor: StaffActor = { userId: gate.userId, actorType: gate.actorType };

  if (input.sessionId) {
    return checkInForSession(deps, {
      profileId: input.profileId,
      pillar: input.pillar,
      sessionId: input.sessionId,
      method,
      actor,
      profileName,
    });
  }

  return checkInForProfile(deps, {
    profileId: input.profileId,
    pillar: input.pillar,
    method,
    actor,
    accessType: input.accessType,
    notes: input.notes,
    profileName,
  });
}

/**
 * Sessie-check-in vanaf de tablet: dezelfde vandaag- en pillar-checks als
 * voorheen, daarna de gedeelde kern. Geen boeking geeft no_eligible_access
 * (een walk-in maakt eerst een boeking; walk-in-RPC in PR 3).
 */
async function checkInForSession(
  deps: CheckInDeps,
  input: {
    profileId: string;
    pillar: string;
    sessionId: string;
    method: CheckInMethod;
    actor: StaffActor;
    profileName: ProfileNameHint;
  },
): Promise<CheckInResult> {
  const { admin } = deps;
  const settings = await readCheckInSettings(admin);
  if (!settings.check_in_enabled) return fail("pillar_check_in_disabled");
  if (!(settings.check_in_pillars ?? []).includes(input.pillar)) {
    return fail("pillar_check_in_disabled");
  }

  const { data: session } = await admin
    .from("class_sessions")
    .select("id, start_at, end_at, pillar")
    .eq("id", input.sessionId)
    .maybeSingle();
  if (!session) return fail("session_not_found");
  if (session.pillar !== input.pillar) return fail("pillar_check_in_disabled");
  const todayUtc = new Date().toISOString().slice(0, 10);
  const sessionDate = new Date(session.start_at).toISOString().slice(0, 10);
  if (sessionDate !== todayUtc) return fail("session_not_today");

  const result = await setMemberAttendance(
    { admin, emit: deps.emit },
    {
      sessionId: input.sessionId,
      profileId: input.profileId,
      present: true,
      actor: input.actor,
      method: input.method,
      source: "kiosk",
    },
  );
  if (!result.ok) {
    switch (result.reason) {
      case "session_not_found":
        return fail("session_not_found");
      case "no_booking":
      case "booking_cancelled":
      case "booking_not_found":
      case "booking_not_in_session":
        return fail("no_eligible_access");
      default:
        return fail("db_error");
    }
  }
  if (!result.changed || !result.checkInId) return fail("already_checked_in");

  deps.revalidate("/checkin");
  deps.revalidate("/app/admin");
  return {
    ok: true,
    checkInId: result.checkInId,
    profile: { id: input.profileId, ...input.profileName },
    accessType: result.accessType,
    pillar: input.pillar,
  };
}

/**
 * Undo binnen een korte window. Verwijdert de check-in-rij zodat de telling
 * en de cap-logica weer kloppen; een credit-check-in krijgt zijn rit terug.
 */
export async function undoCheckInCore(
  gate: StaffGate,
  deps: CheckInDeps,
  checkInId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!gate.ok) return { ok: false, message: FAIL_COPY.unauthorized };

  const { admin } = deps;
  // Lees profile/session/access_type vóór de delete zodat de event-payload
  // de member- en sessie-filter blijft bedienen én een credit-check-in zijn
  // rit terugkrijgt.
  const { data: ci } = await admin
    .from("check_ins")
    .select("profile_id, session_id, access_type")
    .eq("id", checkInId)
    .maybeSingle();

  // Credit-check-in: eerst de rit terugboeken via de RPC-laag, dan pas de
  // rij verwijderen. Faalt de refund, dan blijft de check-in staan zodat
  // saldo en registratie nooit uiteenlopen.
  if (ci?.access_type === "credit" && ci.profile_id) {
    const { data: card } = await admin
      .from("memberships")
      .select("id")
      .eq("profile_id", ci.profile_id)
      .eq("plan_type", "ten_ride_card")
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!card) {
      console.error("[undoCheckIn] geen rittenkaart om op terug te boeken", {
        checkInId,
      });
      return { ok: false, message: FAIL_COPY.db_error };
    }
    const { data: refund, error: refundErr } = await admin.rpc(
      "adjust_membership_credits",
      {
        p_membership_id: card.id,
        p_delta: 1,
        p_reason: "Check-in ongedaan gemaakt", // COPY: confirm met Marlon
        p_source: "refund",
        p_actor_type: gate.actorType,
        p_actor_id: gate.userId,
      },
    );
    if (refundErr || !(refund as { ok?: boolean } | null)?.ok) {
      console.error("[undoCheckIn] credit-refund faalde", refundErr ?? refund);
      return { ok: false, message: FAIL_COPY.db_error };
    }
  }

  const { error } = await admin.from("check_ins").delete().eq("id", checkInId);
  if (error) {
    console.error("[undoCheckIn] delete", error);
    return { ok: false, message: FAIL_COPY.db_error };
  }

  // Tegenkant van de attended_at-sync in checkInForProfile: volgt hetzelfde
  // patroon als markAttendance's reset-naar-"booked"-pad, zodat check_ins en
  // bookings na undo allebei weer leeg zijn.
  if (ci?.session_id && ci?.profile_id) {
    const { data: booking } = await admin
      .from("bookings")
      .select("id")
      .eq("session_id", ci.session_id)
      .eq("profile_id", ci.profile_id)
      .eq("status", "booked")
      .maybeSingle();
    if (booking) {
      await admin
        .from("bookings")
        .update({ no_show_at: null, attended_at: null })
        .eq("id", booking.id);
    }
  }

  await deps.emit({
    type: "checkin.reverted",
    actorType: gate.actorType,
    actorId: gate.userId,
    subjectType: "check_in",
    subjectId: checkInId,
    payload: {
      profile_id: ci?.profile_id ?? null,
      session_id: ci?.session_id ?? null,
      source: "undo",
    },
  });
  deps.revalidate("/checkin");
  deps.revalidate("/app/admin");
  return { ok: true };
}

/**
 * Creëert een walk-in profile + auth.user voor iemand die ter plekke
 * binnenloopt zonder account. E-mail wordt een unieke placeholder tenzij
 * opgegeven.
 */
export async function createWalkInProfileCore(
  gate: StaffGate,
  deps: CheckInDeps,
  input: {
    firstName: string;
    lastName: string;
    phoneRaw: string;
    email?: string;
  },
): Promise<{ ok: true; profileId: string } | { ok: false; message: string }> {
  if (!gate.ok) return { ok: false, message: FAIL_COPY.unauthorized };

  let phone: string;
  try {
    phone = normalizePhone(input.phoneRaw);
  } catch (err) {
    if (err instanceof InvalidPhoneError) {
      return { ok: false, message: err.message };
    }
    throw err;
  }

  const { admin } = deps;

  // Dubbel-check op phone: bestaat er al een profile, gebruik die.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (existing) {
    return { ok: true, profileId: existing.id };
  }

  // Maak auth.user aan. Walk-ins krijgen een generated placeholder-email
  // tenzij de admin er eentje invult. email_confirm=true zodat de user
  // direct "bestaat" voor een toekomstige magic-link-upgrade.
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

  await deps.emit({
    type: "member.created",
    actorType: gate.actorType,
    actorId: gate.userId,
    subjectType: "profile",
    subjectId: created.user.id,
    payload: { profile_id: created.user.id, source: "walk_in" },
  });

  return { ok: true, profileId: created.user.id };
}

/**
 * Aantal check-ins van een profiel in de huidige ISO-week per pillar.
 */
export async function getCheckInsThisWeekCore(
  gate: StaffGate,
  deps: CheckInDeps,
  profileId: string,
  pillar: string,
): Promise<number> {
  if (!gate.ok) return 0;
  return countCheckInsThisWeek(deps.admin, profileId, pillar);
}

/**
 * Alle check-ins van vandaag (Amsterdam-lokale dag), nieuwste eerst.
 * Voor het admin "Vrij trainen vandaag"-paneel op /app/admin/rooster.
 */
export async function getTodayCheckInsCore(
  gate: StaffGate,
  deps: CheckInDeps,
): Promise<TodayCheckIn[]> {
  if (!gate.ok) return [];

  const now = new Date();
  const { year, month, day } = amsterdamYmd(now);
  const dayStart = zonedWallClockToUtc(year, month, day, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const { data, error } = await deps.admin
    .from("check_ins")
    .select(
      "id, pillar, access_type, check_in_method, checked_in_at, profile:profiles!check_ins_profile_id_fkey(first_name, last_name)",
    )
    .gte("checked_in_at", dayStart.toISOString())
    .lt("checked_in_at", dayEnd.toISOString())
    .order("checked_in_at", { ascending: false });

  if (error) {
    console.error("[getTodayCheckIns]", error);
    return [];
  }

  return (data ?? []).map((r) => {
    const profile = Array.isArray(r.profile) ? r.profile[0] : r.profile;
    return {
      id: r.id,
      firstName: profile?.first_name ?? "Onbekend",
      lastInitial: (profile?.last_name ?? "").charAt(0).toUpperCase(),
      pillar: r.pillar,
      accessType: r.access_type as AccessType,
      checkInMethod: r.check_in_method as CheckInMethod,
      checkedInAt: r.checked_in_at,
    };
  });
}

/**
 * Zoek profile op naam of e-mail (case-insensitive), max 20 resultaten.
 * Retourneert coveredPillars zodat de admin-UI direct de juiste
 * pillar-knoppen kan tonen.
 */
export async function searchProfilesCore(
  gate: StaffGate,
  deps: CheckInDeps,
  q: string,
): Promise<AdminProfileRow[]> {
  if (!gate.ok) return [];
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];

  // ILIKE op first + last + email. Supabase-syntax: or-filter.
  const needle = `%${trimmed}%`;
  const { data, error } = await deps.admin
    .from("profiles")
    .select(
      `id, first_name, last_name, email, phone, member_code,
       memberships(covered_pillars, status)`,
    )
    .or(
      `first_name.ilike.${needle},last_name.ilike.${needle},email.ilike.${needle}`,
    )
    .limit(20);

  if (error) {
    console.error("[searchProfiles]", error);
    return [];
  }

  type Row = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    member_code: string | null;
    memberships: Array<{
      covered_pillars: string[] | null;
      status: string | null;
    }> | null;
  };

  return ((data as Row[]) ?? []).map((r) => {
    const active = (r.memberships ?? []).find((m) => m.status === "active");
    return {
      id: r.id,
      firstName: r.first_name ?? "",
      lastName: r.last_name ?? "",
      phone: r.phone ?? "",
      memberCode: r.member_code ?? "",
      coveredPillars: active?.covered_pillars ?? [],
    };
  });
}

/**
 * Alle check-ins voor vandaag (UTC-dag), nieuwste eerst, max 50. Voor het
 * paneel op /checkin.
 */
export async function getTodayCheckInRowsCore(
  gate: StaffGate,
  deps: CheckInDeps,
): Promise<TodayCheckInRow[]> {
  if (!gate.ok) return [];

  // Start-of-day UTC volstaat voor iets dat sowieso ruim 24u omvat in de
  // praktijk; checked_in_date (generated UTC) houdt de unique-constraint
  // consistent.
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);

  const { data, error } = await deps.admin
    .from("check_ins")
    .select(
      `id, checked_in_at, pillar, access_type,
       profile:profiles!check_ins_profile_id_fkey(first_name, last_name)`,
    )
    .gte("checked_in_at", todayUtc.toISOString())
    .order("checked_in_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[getTodayCheckIns]", error);
    return [];
  }

  type Row = {
    id: string;
    checked_in_at: string;
    pillar: string;
    access_type: string;
    profile: {
      first_name: string | null;
      last_name: string | null;
    } | Array<{ first_name: string | null; last_name: string | null }> | null;
  };

  return ((data as Row[]) ?? []).map((r) => {
    const p = Array.isArray(r.profile) ? r.profile[0] : r.profile;
    const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Onbekend";
    return {
      id: r.id,
      profileName: name,
      timeLabel: AMSTERDAM_TIME.format(new Date(r.checked_in_at)),
      pillar: r.pillar,
      accessType: r.access_type as AccessType,
    };
  });
}

// ----------------------------------------------------------------------------
// Interne helpers (alleen bereikbaar via een functie die de gate al deed)
// ----------------------------------------------------------------------------

interface SettingsRow {
  check_in_enabled: boolean | null;
  check_in_pillars: string[] | null;
}

async function readCheckInSettings(admin: SupabaseClient): Promise<SettingsRow> {
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

async function countCheckInsThisWeek(
  admin: SupabaseClient,
  profileId: string,
  pillar: string,
): Promise<number> {
  const now = new Date();
  // ISO-week start: maandag 00:00 UTC (approximatie; de cap-logica elders
  // gebruikt bookings.iso_week gedenormaliseerd, voor check-ins berekenen we
  // hier in TS om aan het schema-agnostische pad te houden).
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

type ProfileNameHint = { firstName: string; lastInitial: string };

/**
 * Vrij trainen (geen sessie, geen boeking): pillar-check-in met de
 * credit-aftrek per check-in. Sessie-check-ins lopen via checkInForSession.
 */
async function checkInForProfile(
  deps: CheckInDeps,
  input: {
    profileId: string;
    pillar: string;
    method: CheckInMethod;
    actor: StaffActor;
    accessType?: AccessType;
    notes?: string;
    profileName: ProfileNameHint;
  },
): Promise<CheckInResult> {
  const { admin } = deps;

  const settings = await readCheckInSettings(admin);
  if (!settings.check_in_enabled) {
    return fail("pillar_check_in_disabled");
  }
  if (!(settings.check_in_pillars ?? []).includes(input.pillar)) {
    return fail("pillar_check_in_disabled");
  }

  // Access-type resolven als niet expliciet: bestaande active/paused
  // membership met pillar coverage = "membership", anders "credit" bij een
  // geldige rittenkaart, anders "drop_in" (betaling regelt de admin).
  let accessType: AccessType = input.accessType ?? "membership";
  if (!input.accessType) {
    const { data: memberships } = await admin
      .from("memberships")
      .select(
        "covered_pillars, status, plan_type, credits_remaining, credits_expires_at, frequency_cap",
      )
      .eq("profile_id", input.profileId)
      // cancellation_requested = opgezegd maar nog binnen de opzegtermijn:
      // houdt volledige toegang tot de cron op effective_date naar cancelled
      // flipt.
      .in("status", ["active", "paused", "cancellation_requested"]);
    const covers = (memberships ?? []).find((m) =>
      (m.covered_pillars ?? []).includes(input.pillar),
    );
    if (covers) {
      accessType = "membership";
    } else {
      // Kaart moet op het check-in-moment geldig zijn (expiry-besluit
      // 2026-07-10); zelfde UTC-datum als current_date op de DB.
      const todayUtc = new Date().toISOString().slice(0, 10);
      const credit = (memberships ?? []).find(
        (m) =>
          m.plan_type === "ten_ride_card" &&
          (m.credits_remaining ?? 0) > 0 &&
          (!m.credits_expires_at || m.credits_expires_at >= todayUtc),
      );
      accessType = credit ? "credit" : "drop_in";
    }
  }

  // Geen weekcap-weigering: die bestond alleen voor de zelf-check-in. Staff
  // beslist zelf of iemand over de cap traint.
  const { data: inserted, error: insertErr } = await admin
    .from("check_ins")
    .insert({
      profile_id: input.profileId,
      session_id: null,
      booking_id: null,
      checked_in_by: input.actor.userId,
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

  // Actor is altijd de ingelogde staff uit de gate; nooit "tablet" zonder id.
  const actorType: ActorType = input.actor.actorType;
  const actorId = input.actor.userId;

  // Credit-decrement voor ten-ride-kaart, via de RPC-laag onder row lock
  // (adjust_membership_credits). De RPC schrijft zelf het
  // credits.adjusted-event in dezelfde transactie.
  if (accessType === "credit") {
    await decrementCredit(admin, input.profileId, actorType, actorId);
  }

  await deps.emit({
    type: "checkin.recorded",
    actorType,
    actorId,
    subjectType: "check_in",
    subjectId: inserted.id,
    payload: {
      profile_id: input.profileId,
      session_id: null,
      pillar: input.pillar,
      access_type: accessType,
      method: input.method,
    },
  });

  deps.revalidate("/checkin");
  deps.revalidate("/app/admin");

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

async function decrementCredit(
  admin: SupabaseClient,
  profileId: string,
  actorType: ActorType,
  actorId: string | null,
): Promise<void> {
  const todayUtc = new Date().toISOString().slice(0, 10);
  const { data } = await admin
    .from("memberships")
    .select("id")
    .eq("profile_id", profileId)
    .eq("plan_type", "ten_ride_card")
    .eq("status", "active")
    .gt("credits_remaining", 0)
    // Zelfde expiry-regel als de accessType-resolutie en de RPC-debit-tak.
    .or(`credits_expires_at.is.null,credits_expires_at.gte.${todayUtc}`)
    .limit(1)
    .maybeSingle();
  if (!data) {
    // De check-in-rij is al met access_type 'credit' weggeschreven;
    // zonder kaart om af te boeken lopen saldo en registratie uiteen.
    console.error("[decrementCredit] geen actieve rittenkaart met saldo", {
      profileId,
    });
    return;
  }
  // De RPC lockt de rij en weigert bij onvoldoende saldo; de race waarin
  // een andere transactie de kaart net leegtrok verliest hier dus hooguit
  // met een nette reason, nooit met een lost update.
  const { data: result, error } = await admin.rpc("adjust_membership_credits", {
    p_membership_id: data.id,
    p_delta: -1,
    p_reason: "Check-in rittenkaart",
    p_source: "check_in",
    p_actor_type: actorType,
    p_actor_id: actorId,
  });
  if (error || !(result as { ok?: boolean } | null)?.ok) {
    console.error("[decrementCredit] adjust_membership_credits", error ?? result);
  }
}
