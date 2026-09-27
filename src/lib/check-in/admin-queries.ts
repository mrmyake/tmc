"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { requireTrainerOrAdmin } from "@/lib/admin/require-trainer-or-admin";
import {
  getTodayCheckInRowsCore,
  searchProfilesCore,
  type AdminProfileRow,
  type CheckInDeps,
  type TodayCheckInRow,
} from "./core";

export type { AdminProfileRow, TodayCheckInRow } from "./core";

/**
 * Leesacties voor het paneel op /checkin. Gate-eerst, zelfde
 * requireTrainerOrAdmin() als de schrijfacties in actions.ts; het oude
 * cookie-pad (tmc_admin_unlock) is weg.
 */
function liveDeps(): CheckInDeps {
  return { admin: createAdminClient(), emit: emitEvent, revalidate: revalidatePath };
}

/** Zoek profiel op naam of e-mail, max 20 resultaten. */
export async function searchProfiles(q: string): Promise<AdminProfileRow[]> {
  const gate = await requireTrainerOrAdmin();
  return searchProfilesCore(gate, liveDeps(), q);
}

/** Alle check-ins voor vandaag, nieuwste eerst, max 50. */
export async function getTodayCheckIns(): Promise<TodayCheckInRow[]> {
  const gate = await requireTrainerOrAdmin();
  return getTodayCheckInRowsCore(gate, liveDeps());
}
