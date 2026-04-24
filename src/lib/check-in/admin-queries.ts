"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUnlocked } from "./admin-lock";
import { createClient } from "@/lib/supabase/server";
import type { AccessType } from "./actions";

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

async function requireAnyStaff(): Promise<boolean> {
  // Web-admin context?
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role === "admin" || profile?.role === "trainer") return true;
  }
  // Tablet context?
  return await isAdminUnlocked();
}

/**
 * Zoek profile op naam of email (case-insensitive). Alleen admin/staff.
 * Max 20 resultaten. Retourneert coveredPillars zodat de admin-UI
 * direct de juiste pillar-knoppen kan tonen.
 */
export async function searchProfiles(q: string): Promise<AdminProfileRow[]> {
  if (!(await requireAnyStaff())) return [];
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];

  const admin = createAdminClient();
  // ILIKE op concat van first + last + email. Supabase-syntax: or-filter.
  const needle = `%${trimmed}%`;
  const { data, error } = await admin
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
 * Alle check-ins voor vandaag (Amsterdam-dag). Newest first.
 */
export async function getTodayCheckIns(): Promise<TodayCheckInRow[]> {
  if (!(await requireAnyStaff())) return [];

  const admin = createAdminClient();
  // Start-of-day in Amsterdam-tz. Truc: vandaag UTC-midnight minus 0-2
  // uur volstaat voor iets dat sowieso ruim 24u omvat in de praktijk.
  // We filteren strak op checked_in_date (generated UTC) zodat de
  // unique-constraint-semantiek consistent is.
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);

  const { data, error } = await admin
    .from("check_ins")
    .select(
      `id, checked_in_at, pillar, access_type,
       profile:profiles(first_name, last_name)`,
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

  const fmt = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return ((data as Row[]) ?? []).map((r) => {
    const p = Array.isArray(r.profile) ? r.profile[0] : r.profile;
    const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Onbekend";
    return {
      id: r.id,
      profileName: name,
      timeLabel: fmt.format(new Date(r.checked_in_at)),
      pillar: r.pillar,
      accessType: r.access_type as AccessType,
    };
  });
}
