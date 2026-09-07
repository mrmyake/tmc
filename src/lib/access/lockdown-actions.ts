"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/require-admin";
import { emitEvent } from "@/lib/events/emit";
import { getAkilesClient, isAkilesConfigured } from "@/lib/akiles";
import { ACCESS_CONFIG_ID } from "./constants";
import { applyGroupSchedules } from "./sync-core";
import type { AccessConfigRow, ResolvedAccessConfig } from "./types";

export type LockdownActionResult =
  | { ok: true; lockdown: boolean; message: string }
  | { ok: false; message: string };

/**
 * Noodrem. Zet access_config.lockdown om en laat beide ledengroepen in
 * Akiles direct naar het gesloten schedule wijzen (of terug naar hun eigen
 * schedule). Staf houdt toegang. De nachtelijke sync leest dezelfde vlag,
 * dus een gemiste Akiles-call hier wordt de volgende run alsnog toegepast.
 *
 * Zonder AKILES_API_KEY of zonder geprovisionde groepen wordt alleen de
 * vlag opgeslagen; de eerste sync met key past hem toe.
 */
export async function setAccessLockdown(
  enabled: boolean,
): Promise<LockdownActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { data: cfg, error: readErr } = await admin
    .from("access_config")
    .select(
      "lockdown, schedule_standard_id, schedule_extended_id, schedule_closed_id, schedule_staff_id, group_standard_id, group_extended_id, group_staff_id",
    )
    .eq("id", ACCESS_CONFIG_ID)
    .maybeSingle();
  if (readErr || !cfg) {
    console.error("[access-lockdown] access_config lezen mislukt", readErr);
    // COPY: confirm met Marlon
    return { ok: false, message: "Toegangsconfiguratie niet gevonden." };
  }

  const { error: writeErr } = await admin
    .from("access_config")
    .update({ lockdown: enabled, updated_at: new Date().toISOString() })
    .eq("id", ACCESS_CONFIG_ID);
  if (writeErr) {
    console.error("[access-lockdown] access_config schrijven mislukt", writeErr);
    // COPY: confirm met Marlon
    return { ok: false, message: "Opslaan mislukt. Probeer het opnieuw." };
  }

  const row = cfg as AccessConfigRow;
  const provisioned =
    row.schedule_standard_id &&
    row.schedule_extended_id &&
    row.schedule_closed_id &&
    row.schedule_staff_id &&
    row.group_standard_id &&
    row.group_extended_id &&
    row.group_staff_id;

  let appliedInAkiles = false;
  const akiles = getAkilesClient();
  if (akiles && provisioned) {
    try {
      await applyGroupSchedules(akiles, {
        ...(row as ResolvedAccessConfig),
        lockdown: enabled,
      });
      appliedInAkiles = true;
    } catch (err) {
      console.error(
        "[access-lockdown] Akiles-groepen bijwerken mislukt",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  await emitEvent({
    type: enabled ? "access.lockdown_enabled" : "access.lockdown_disabled",
    actorType: "admin",
    actorId: auth.userId,
    subjectType: "profile",
    subjectId: auth.userId,
    payload: {
      applied_in_akiles: appliedInAkiles,
      akiles_configured: isAkilesConfigured(),
    },
  });

  revalidatePath("/app/admin/instellingen");

  if (!isAkilesConfigured()) {
    return {
      ok: true,
      lockdown: enabled,
      // COPY: confirm met Marlon
      message: enabled
        ? "Noodrem opgeslagen. Akiles is nog niet gekoppeld; de deur verandert pas na koppeling."
        : "Noodrem opgeheven. Akiles is nog niet gekoppeld.",
    };
  }
  if (!appliedInAkiles) {
    return {
      ok: true,
      lockdown: enabled,
      // COPY: confirm met Marlon
      message: enabled
        ? "Noodrem opgeslagen, maar Akiles bevestigde het nog niet. De nachtelijke sync past het toe; controleer zo nodig het Akiles-paneel."
        : "Noodrem opgeheven, maar Akiles bevestigde het nog niet. De nachtelijke sync past het toe.",
    };
  }
  return {
    ok: true,
    lockdown: enabled,
    // COPY: confirm met Marlon
    message: enabled
      ? "Noodrem actief. Leden kunnen de deur niet meer openen; staf wel."
      : "Noodrem opgeheven. Leden kunnen weer naar binnen volgens hun schema.",
  };
}
