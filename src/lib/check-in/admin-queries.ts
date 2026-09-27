"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { asStaffGate, requireKioskActor } from "@/lib/kiosk/gate";
import {
  getTodayCheckInRowsCore,
  searchProfilesCore,
  type AdminProfileRow,
  type CheckInDeps,
  type TodayCheckInRow,
} from "./core";

export type { AdminProfileRow, TodayCheckInRow } from "./core";

/**
 * Leesacties voor het paneel op /kiosk/paneel. Gate-eerst, dezelfde
 * kiosk-gate als de schrijfacties in actions.ts (check-in PR 2).
 */
function liveDeps(): CheckInDeps {
  return { admin: createAdminClient(), emit: emitEvent, revalidate: revalidatePath };
}

async function kioskGate() {
  return asStaffGate(await requireKioskActor());
}

/** Zoek profiel op naam of e-mail, max 20 resultaten. */
export async function searchProfiles(q: string): Promise<AdminProfileRow[]> {
  const gate = await kioskGate();
  return searchProfilesCore(gate, liveDeps(), q);
}

/** Alle check-ins voor vandaag, nieuwste eerst, max 50. */
export async function getTodayCheckIns(): Promise<TodayCheckInRow[]> {
  const gate = await kioskGate();
  return getTodayCheckInRowsCore(gate, liveDeps());
}
