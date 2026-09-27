"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { requireAdmin } from "./require-admin";
import {
  KIOSK_DEVICE_COOKIE,
  KIOSK_DEVICE_MAX_AGE_S,
  KIOSK_PIN_LENGTH,
} from "@/lib/kiosk/constants";
import { kioskSecret } from "@/lib/kiosk/gate";
import { newDevicePayload, signToken, verifyToken } from "@/lib/kiosk/session";

/**
 * Admin-acties voor de kiosk (check-in PR 2): apparaten koppelen en
 * intrekken, staf-PIN's instellen, resetten en verwijderen. Alles achter
 * requireAdmin(). De PIN-RPC's lopen via de user-client zodat is_admin()
 * in de database de tweede poort is; apparaten via de service-role-client
 * (de tabel heeft geen policies).
 */

type Result = { ok: true; message: string } | { ok: false; message: string };

const PIN_PATTERN = new RegExp(`^[0-9]{${KIOSK_PIN_LENGTH}}$`);

export interface StaffPinRow {
  profileId: string;
  name: string;
  role: "admin" | "trainer";
  hasPin: boolean;
  pinVersion: number | null;
  setAt: string | null;
}

export interface KioskDeviceRow {
  id: string;
  label: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  /** True als dit de browser is waarin de admin nu kijkt. */
  isThisDevice: boolean;
}

/** Staf (admins plus actieve trainers) met PIN-status. */
export async function listStaffPins(): Promise<StaffPinRow[]> {
  const auth = await requireAdmin();
  if (!auth.ok) return [];
  const admin = createAdminClient();
  const [{ data: admins }, { data: trainers }, { data: pins }] = await Promise.all([
    admin.from("profiles").select("id, first_name, last_name").eq("role", "admin"),
    admin
      .from("trainers")
      .select("profile_id, display_name")
      .eq("is_active", true),
    admin.from("staff_pins").select("profile_id, pin_version, is_active, set_at"),
  ]);
  const pinBy = new Map((pins ?? []).map((p) => [p.profile_id as string, p]));
  const rows = new Map<string, StaffPinRow>();
  for (const t of trainers ?? []) {
    rows.set(t.profile_id as string, {
      profileId: t.profile_id as string,
      name: t.display_name as string,
      role: "trainer",
      hasPin: false,
      pinVersion: null,
      setAt: null,
    });
  }
  for (const a of admins ?? []) {
    const existing = rows.get(a.id as string);
    rows.set(a.id as string, {
      profileId: a.id as string,
      name: existing?.name ?? `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim(),
      role: "admin",
      hasPin: false,
      pinVersion: null,
      setAt: null,
    });
  }
  for (const row of rows.values()) {
    const pin = pinBy.get(row.profileId);
    if (pin && pin.is_active) {
      row.hasPin = true;
      row.pinVersion = pin.pin_version as number;
      row.setAt = pin.set_at as string;
    }
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, "nl"));
}

export async function setStaffPin(input: { profileId: string; pin: string }): Promise<Result> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!PIN_PATTERN.test(input.pin)) {
    // COPY: confirm met Marlon
    return { ok: false, message: `Een pincode is ${KIOSK_PIN_LENGTH} cijfers.` };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_staff_pin", {
    p_profile_id: input.profileId,
    p_pin: input.pin,
  });
  if (error) {
    console.error("[setStaffPin]", error);
    return {
      ok: false,
      // COPY: confirm met Marlon
      message: error.message.includes("Geen staflid")
        ? "Dit profiel is geen staflid."
        : "Opslaan lukte niet.",
    };
  }
  await emitEvent({
    type: "staff_pin.set",
    actorType: "admin",
    actorId: auth.userId,
    subjectType: "profile",
    subjectId: input.profileId,
    payload: { pin_version: data },
  });
  revalidatePath("/app/admin/instellingen");
  // COPY: confirm met Marlon
  return { ok: true, message: "Pincode opgeslagen. Lopende kiosk-sessies van dit staflid zijn vervallen." };
}

export async function clearStaffPin(profileId: string): Promise<Result> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_staff_pin", { p_profile_id: profileId });
  if (error) {
    console.error("[clearStaffPin]", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Verwijderen lukte niet." };
  }
  await emitEvent({
    type: "staff_pin.cleared",
    actorType: "admin",
    actorId: auth.userId,
    subjectType: "profile",
    subjectId: profileId,
    payload: {},
  });
  revalidatePath("/app/admin/instellingen");
  // COPY: confirm met Marlon
  return { ok: true, message: "Pincode verwijderd." };
}

export async function listKioskDevices(): Promise<KioskDeviceRow[]> {
  const auth = await requireAdmin();
  if (!auth.ok) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("kiosk_devices")
    .select("id, label, created_at, last_seen_at, revoked_at")
    .order("created_at", { ascending: false });
  const store = await cookies();
  const mine = verifyToken("device", store.get(KIOSK_DEVICE_COOKIE)?.value, kioskSecret());
  return (data ?? []).map((d) => ({
    id: d.id as string,
    label: d.label as string,
    createdAt: d.created_at as string,
    lastSeenAt: (d.last_seen_at as string | null) ?? null,
    revokedAt: (d.revoked_at as string | null) ?? null,
    isThisDevice: mine?.device_id === d.id,
  }));
}

/**
 * Koppelt de browser waarin de admin nu zit als kiosk-apparaat: rij plus
 * langlevend, getekend apparaat-cookie. Alleen op /kiosk/koppelen, op de
 * tablet zelf.
 */
export async function pairKioskDevice(label: string): Promise<Result> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const secret = kioskSecret();
  if (!secret) {
    // COPY: confirm met Marlon
    return { ok: false, message: "KIOSK_SESSION_SECRET ontbreekt op deze omgeving; koppelen kan niet." };
  }
  const trimmed = label.trim().slice(0, 60);
  if (trimmed.length < 2) {
    // COPY: confirm met Marlon
    return { ok: false, message: "Geef het apparaat een naam." };
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("kiosk_devices")
    .insert({ label: trimmed, created_by: auth.userId })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[pairKioskDevice] insert", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Koppelen lukte niet." };
  }
  const store = await cookies();
  store.set(KIOSK_DEVICE_COOKIE, signToken<"device">(newDevicePayload(data.id, Date.now()), secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: KIOSK_DEVICE_MAX_AGE_S,
  });
  await emitEvent({
    type: "kiosk.device_paired",
    actorType: "admin",
    actorId: auth.userId,
    subjectType: "kiosk_device",
    subjectId: data.id,
    payload: { label: trimmed },
  });
  revalidatePath("/app/admin/instellingen");
  // COPY: confirm met Marlon
  return { ok: true, message: `Gekoppeld als "${trimmed}".` };
}

export async function revokeKioskDevice(deviceId: string): Promise<Result> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const admin = createAdminClient();
  const { error } = await admin
    .from("kiosk_devices")
    .update({ revoked_at: new Date().toISOString(), revoked_by: auth.userId })
    .eq("id", deviceId)
    .is("revoked_at", null);
  if (error) {
    console.error("[revokeKioskDevice]", error);
    // COPY: confirm met Marlon
    return { ok: false, message: "Intrekken lukte niet." };
  }
  await emitEvent({
    type: "kiosk.device_revoked",
    actorType: "admin",
    actorId: auth.userId,
    subjectType: "kiosk_device",
    subjectId: deviceId,
    payload: {},
  });
  revalidatePath("/app/admin/instellingen");
  // COPY: confirm met Marlon
  return { ok: true, message: "Apparaat ingetrokken." };
}
