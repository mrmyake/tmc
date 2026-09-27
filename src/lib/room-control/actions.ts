"use server";

import { requireTrainerOrAdmin } from "@/lib/admin/require-trainer-or-admin";
import { getHomeAssistantClient } from "@/lib/home-assistant";
import { emitEvent } from "@/lib/events/emit";
import { ROOM_CONTROL_COPY, controlRoomWithGate, type RoomControlResult } from "./core";

/**
 * Server action voor de kiosk-zaalbediening (spec-kiosk-room-control.md,
 * PR 2). Server action en geen route handler: alle staff-mutaties in deze
 * codebase zijn server actions met requireTrainerOrAdmin() als eerste regel
 * (pt-booking-actions, pt-busy-actions, customer-actions), en een server
 * action krijgt de same-origin-bescherming van Next gratis mee. Route
 * handlers zijn hier voorbehouden aan webhooks, crons en OAuth-callbacks.
 *
 * Volgorde: gate (401/403-equivalent als getypeerde reason), dan de kern
 * met de echte HA-client en emitEvent. `raw` gaat ongewijzigd naar de
 * parser in core.ts; er wordt hier niets uit gelezen. Throwt nooit.
 * Types voor de UI (PR 3): RoomControlInput, RoomControlResult en
 * RoomStatus uit ./core.
 */
export async function controlRoom(raw: unknown): Promise<RoomControlResult> {
  try {
    return await controlRoomWithGate(
      await requireTrainerOrAdmin(),
      (actor) => ({ ha: getHomeAssistantClient(), emit: emitEvent, actor }),
      raw,
    );
  } catch (err) {
    console.error("[controlRoom] threw", err instanceof Error ? err.message : String(err));
    return { ok: false, reason: "unavailable", message: ROOM_CONTROL_COPY.unavailable };
  }
}
