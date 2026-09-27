"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitEvent } from "@/lib/events/emit";
import { asStaffGate, requireKioskActor } from "@/lib/kiosk/gate";
import {
  checkInByProfileIdCore,
  createWalkInProfileCore,
  getCheckInsThisWeekCore,
  getTodayCheckInsCore,
  undoCheckInCore,
  type AccessType,
  type CheckInDeps,
  type CheckInMethod,
  type CheckInResult,
  type TodayCheckIn,
} from "./core";

export type {
  AccessType,
  CheckInFailReason,
  CheckInMethod,
  CheckInResult,
  TodayCheckIn,
} from "./core";

/**
 * Server actions voor check-in. Elke actie is gate-eerst: de kiosk-gate
 * requireKioskActor() (check-in PR 2): een ingelogde admin of actieve
 * trainer, óf een gekoppeld apparaat met een geldige, getekende
 * kiosk-sessie (naam plus PIN). Beide geven het echte staflid-id. Elke
 * aanroep hier is door de gebruiker gestart en verlengt de sessie. Daarna
 * de kern in core.ts met de echte deps.
 */
function liveDeps(): CheckInDeps {
  return { admin: createAdminClient(), emit: emitEvent, revalidate: revalidatePath };
}

async function kioskGate() {
  return asStaffGate(await requireKioskActor());
}

/** Staff checkt iemand anders in vanaf /checkin of /app/admin. */
export async function checkInByProfileId(input: {
  profileId: string;
  pillar: string;
  sessionId?: string;
  accessType?: AccessType;
  method?: CheckInMethod;
  notes?: string;
}): Promise<CheckInResult> {
  const gate = await kioskGate();
  return checkInByProfileIdCore(gate, liveDeps(), input);
}

/** Undo binnen een korte window; een credit-check-in krijgt zijn rit terug. */
export async function undoCheckIn(
  checkInId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const gate = await kioskGate();
  return undoCheckInCore(gate, liveDeps(), checkInId);
}

/** Walk-in-profiel plus auth.user voor iemand zonder account. */
export async function createWalkInProfile(input: {
  firstName: string;
  lastName: string;
  phoneRaw: string;
  email?: string;
}): Promise<{ ok: true; profileId: string } | { ok: false; message: string }> {
  const gate = await kioskGate();
  return createWalkInProfileCore(gate, liveDeps(), input);
}

/** Aantal check-ins van een profiel in de huidige ISO-week per pillar. */
export async function getCheckInsThisWeek(
  profileId: string,
  pillar: string,
): Promise<number> {
  const gate = await kioskGate();
  return getCheckInsThisWeekCore(gate, liveDeps(), profileId, pillar);
}

/** Alle check-ins van vandaag (Amsterdam-dag), nieuwste eerst. */
export async function getTodayCheckIns(): Promise<TodayCheckIn[]> {
  const gate = await kioskGate();
  return getTodayCheckInsCore(gate, liveDeps());
}
