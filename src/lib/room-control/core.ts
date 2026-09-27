import type { HomeAssistantApi, HomeAssistantState } from "@/lib/home-assistant";
import type { EmitEventInput } from "@/lib/events/emit";
import {
  ROOM_WHITELIST,
  isAction,
  isGroupIntact,
  isRoom,
  isScene,
  type Action,
  type Room,
  type Scene,
} from "./whitelist";

/**
 * Kern van de kiosk-zaalbediening (spec-kiosk-room-control.md, PR 2).
 * Zelfde opzet als src/lib/access/*-core.ts en account-deletion/core.ts:
 * geen server-only imports, geen directe netwerk- of DB-calls, alles via
 * RoomControlDeps, zodat scripts/room-control/ dit met fakes doorloopt.
 * De wiring (gate, echte HA-client, emitEvent) staat in actions.ts.
 *
 * Invarianten:
 *  - De parser levert uitsluitend enum-waarden op; entity-ids komen alleen
 *    uit ROOM_WHITELIST. Niets uit `raw` bereikt ooit de HA-client.
 *  - Elke HA-fout (client null, timeout, 5xx) wordt de getypeerde uitkomst
 *    `unavailable` met vaste copy. Geen HomeAssistantError, URL of token
 *    naar de aanroeper.
 *  - play_pause en all_off lezen eerst de groepstoestand en voeren niets
 *    uit als de groep niet exact de eigen zaal is (grouped_with_other_room).
 *  - all_off gebruikt nooit de toggle: uit-script, daarna pause alleen als
 *    de coördinator speelt.
 *  - Events alleen bij een uitgevoerde actie of een HA-/groepsweigering;
 *    nooit bij status, ongeldige invoer of een auth-weigering (die laatste
 *    gebeurt al voor deze module in actions.ts).
 *  - controlRoomCore throwt nooit.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RoomControlInput =
  | { room: Room; action: "scene"; scene: Scene }
  | { room: Room; action: "volume"; level: number }
  | { room: Room; action: "play_pause" }
  | { room: Room; action: "all_off" }
  | { room: Room; action: "status" };

export type RoomStatus =
  | {
      reachable: true;
      playing: boolean;
      /** 0 t/m 100, afgerond. */
      volume: number;
      groupedWithOtherRoom: boolean;
    }
  | { reachable: false };

export type RoomControlFailReason =
  | "unauthenticated"
  | "forbidden"
  | "invalid_input"
  | "unsupported_for_room"
  | "grouped_with_other_room"
  | "unavailable";

export type RoomControlResult =
  | { ok: true; action: "scene" | "volume" | "play_pause" | "all_off" }
  | { ok: true; action: "status"; status: RoomStatus }
  | { ok: false; reason: RoomControlFailReason; message: string };

export interface RoomControlActor {
  actorType: "admin" | "trainer";
  actorId: string;
}

export interface RoomControlDeps {
  /** null als HA niet geconfigureerd is of de omgevingsguard weigert. */
  ha: HomeAssistantApi | null;
  /** emitEvent; het resultaat wordt genegeerd, emitEvent throwt zelf nooit. */
  emit: (event: EmitEventInput) => Promise<unknown>;
  actor: RoomControlActor;
}

// ---------------------------------------------------------------------------
// Copy (vaste teksten, nooit een HA-fout doorgeven)
// ---------------------------------------------------------------------------

export const ROOM_CONTROL_COPY = {
  // COPY: confirm met Marlon
  invalidInput: "Ongeldige opdracht.",
  // COPY: confirm met Marlon
  unsupportedForRoom: "Deze zaal heeft geen lichtscènes.",
  // COPY: confirm met Marlon
  groupedWithOtherRoom:
    "De Sonos van deze zaal is gekoppeld aan een andere zaal. Ontkoppel eerst in de Sonos-app.",
  // COPY: confirm met Marlon
  unavailable:
    "De bediening is nu niet bereikbaar. Gebruik de Sonos-app of de schakelaar in de zaal.",
} as const;

// ---------------------------------------------------------------------------
// Parser: strikt, handmatig (de codebase gebruikt geen schema-library)
// ---------------------------------------------------------------------------

type ParseResult =
  | { ok: true; input: RoomControlInput }
  | { ok: false; reason: "invalid_input"; message: string };

const ALLOWED_KEYS: Record<Action, readonly string[]> = {
  scene: ["room", "action", "scene"],
  volume: ["room", "action", "level"],
  play_pause: ["room", "action"],
  all_off: ["room", "action"],
  status: ["room", "action"],
};

function invalid(): ParseResult {
  return { ok: false, reason: "invalid_input", message: ROOM_CONTROL_COPY.invalidInput };
}

/**
 * Accepteert alleen een plat object met exact de velden die bij de actie
 * horen. Onbekende velden, onbekende zalen/acties/scènes, een niet-geheel
 * of buiten-bereik level: afgewezen. Er wordt niets genormaliseerd of
 * getrimd; de UI (PR 3) stuurt exact deze vorm.
 */
export function parseRoomControlInput(raw: unknown): ParseResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return invalid();
  const obj = raw as Record<string, unknown>;
  const { room, action } = obj;
  if (!isRoom(room) || !isAction(action)) return invalid();

  const allowed = ALLOWED_KEYS[action];
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) return invalid();
  }

  switch (action) {
    case "scene": {
      const { scene } = obj;
      if (!isScene(scene)) return invalid();
      return { ok: true, input: { room, action, scene } };
    }
    case "volume": {
      const { level } = obj;
      if (typeof level !== "number" || !Number.isInteger(level) || level < 0 || level > 100) {
        return invalid();
      }
      return { ok: true, input: { room, action, level } };
    }
    case "play_pause":
    case "all_off":
    case "status":
      return { ok: true, input: { room, action } };
  }
}

// ---------------------------------------------------------------------------
// Hulpfuncties
// ---------------------------------------------------------------------------

function fail(reason: RoomControlFailReason, message: string): RoomControlResult {
  return { ok: false, reason, message };
}

function groupMembersOf(state: HomeAssistantState, coordinator: string): string[] {
  const raw = state.attributes.group_members;
  if (Array.isArray(raw) && raw.every((m) => typeof m === "string")) return raw as string[];
  // Geen attribuut: de speler staat los, dus de groep is alleen hijzelf.
  return [coordinator];
}

function volumePercent(state: HomeAssistantState): number {
  const raw = state.attributes.volume_level;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, Math.round(raw * 100)));
}

/**
 * Leest de coördinator van de zaal. Ontbreekt hij in het antwoord (HA kent
 * de entity niet, bijvoorbeeld na een hernoeming in HA), dan telt dat als
 * onbereikbaar: de whitelist en HA lopen dan uit de pas en er valt niets
 * veiligs te doen.
 */
async function readCoordinator(
  ha: HomeAssistantApi,
  room: Room,
): Promise<HomeAssistantState | null> {
  const def = ROOM_WHITELIST[room];
  const states = await ha.getStates([def.coordinator]);
  return states.find((s) => s.entity_id === def.coordinator) ?? null;
}

type EventPayload = Record<string, unknown>;

async function emitControl(
  deps: RoomControlDeps,
  type: "room.scene_activated" | "room.sonos_adjusted" | "room.control_failed",
  payload: EventPayload,
): Promise<void> {
  await deps.emit({
    type,
    actorType: deps.actor.actorType,
    actorId: deps.actor.actorId,
    subjectType: "room",
    subjectId: null,
    payload,
  });
}

async function unavailable(
  deps: RoomControlDeps,
  base: EventPayload,
  detail: string,
): Promise<RoomControlResult> {
  await emitControl(deps, "room.control_failed", {
    ...base,
    outcome: "failed",
    reason: "unavailable",
    detail,
  });
  return fail("unavailable", ROOM_CONTROL_COPY.unavailable);
}

/** Alleen de foutklasse-naam en het bericht; nooit een URL of token (de
 *  HA-client zet die er zelf al niet in). Afgekapt voor de payload. */
function describe(err: unknown): string {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return text.slice(0, 200);
}

// ---------------------------------------------------------------------------
// Acties
// ---------------------------------------------------------------------------

async function runScene(
  deps: RoomControlDeps,
  ha: HomeAssistantApi,
  room: Room,
  scene: Scene,
): Promise<RoomControlResult> {
  const entityId = ROOM_WHITELIST[room].scenes[scene];
  const base = { room, action: "scene", scene };
  if (!entityId) return fail("unsupported_for_room", ROOM_CONTROL_COPY.unsupportedForRoom);
  try {
    await ha.runScript(entityId);
  } catch (err) {
    return unavailable(deps, base, describe(err));
  }
  await emitControl(deps, "room.scene_activated", {
    ...base,
    script_entity_id: entityId,
    outcome: "ok",
  });
  return { ok: true, action: "scene" };
}

async function setRoomVolume(
  deps: RoomControlDeps,
  ha: HomeAssistantApi,
  room: Room,
  level: number,
): Promise<RoomControlResult> {
  const def = ROOM_WHITELIST[room];
  const base = { room, action: "volume", level };
  // Sequentieel: bij een fout halverwege staat een deel van de zaal al op
  // het nieuwe niveau. Dat is zichtbaar in de payload (applied) en de UI
  // toont de offline-melding; de volgende poging zet alles opnieuw.
  const applied: string[] = [];
  for (const player of def.players) {
    try {
      await ha.setVolume(player, level / 100);
      applied.push(player);
    } catch (err) {
      return unavailable(deps, { ...base, applied }, describe(err));
    }
  }
  await emitControl(deps, "room.sonos_adjusted", {
    ...base,
    players: def.players,
    outcome: "ok",
  });
  return { ok: true, action: "volume" };
}

async function togglePlayPause(
  deps: RoomControlDeps,
  ha: HomeAssistantApi,
  room: Room,
): Promise<RoomControlResult> {
  const def = ROOM_WHITELIST[room];
  const base = { room, action: "play_pause" };
  let state: HomeAssistantState | null;
  try {
    state = await readCoordinator(ha, room);
  } catch (err) {
    return unavailable(deps, base, describe(err));
  }
  if (!state) return unavailable(deps, base, "coördinator ontbreekt in /api/states");

  const members = groupMembersOf(state, def.coordinator);
  if (!isGroupIntact(room, members)) {
    await emitControl(deps, "room.control_failed", {
      ...base,
      outcome: "refused",
      reason: "grouped_with_other_room",
      group_members: members,
    });
    return fail("grouped_with_other_room", ROOM_CONTROL_COPY.groupedWithOtherRoom);
  }

  try {
    await ha.playPause(def.coordinator);
  } catch (err) {
    return unavailable(deps, base, describe(err));
  }
  await emitControl(deps, "room.sonos_adjusted", {
    ...base,
    media_entity_id: def.coordinator,
    was_playing: state.state === "playing",
    outcome: "ok",
  });
  return { ok: true, action: "play_pause" };
}

async function allOff(
  deps: RoomControlDeps,
  ha: HomeAssistantApi,
  room: Room,
): Promise<RoomControlResult> {
  const def = ROOM_WHITELIST[room];
  const base = { room, action: "all_off" };

  // Eerst lezen, dan pas doen: als de groep afwijkt gebeurt er helemaal
  // niets, ook niet met het licht. Zo blijft "alles uit" één ondeelbare
  // bedoeling in plaats van "licht wel, muziek niet".
  let state: HomeAssistantState | null;
  try {
    state = await readCoordinator(ha, room);
  } catch (err) {
    return unavailable(deps, base, describe(err));
  }
  if (!state) return unavailable(deps, base, "coördinator ontbreekt in /api/states");

  const members = groupMembersOf(state, def.coordinator);
  if (!isGroupIntact(room, members)) {
    await emitControl(deps, "room.control_failed", {
      ...base,
      outcome: "refused",
      reason: "grouped_with_other_room",
      group_members: members,
    });
    return fail("grouped_with_other_room", ROOM_CONTROL_COPY.groupedWithOtherRoom);
  }

  const offScript = def.offScene ? def.scenes[def.offScene] : undefined;
  let lightsOff = false;
  if (offScript) {
    try {
      await ha.runScript(offScript);
      lightsOff = true;
    } catch (err) {
      return unavailable(deps, base, describe(err));
    }
  }

  // Nooit de toggle: die zou muziek starten die al uit stond.
  let paused = false;
  if (state.state === "playing") {
    try {
      await ha.pause(def.coordinator);
      paused = true;
    } catch (err) {
      return unavailable(deps, { ...base, lights_off: lightsOff }, describe(err));
    }
  }

  await emitControl(deps, "room.sonos_adjusted", {
    ...base,
    media_entity_id: def.coordinator,
    lights_off: lightsOff,
    paused,
    outcome: "ok",
  });
  return { ok: true, action: "all_off" };
}

async function readStatus(ha: HomeAssistantApi | null, room: Room): Promise<RoomStatus> {
  if (!ha) return { reachable: false };
  const def = ROOM_WHITELIST[room];
  let state: HomeAssistantState | null;
  try {
    state = await readCoordinator(ha, room);
  } catch {
    return { reachable: false };
  }
  if (!state || state.state === "unavailable") return { reachable: false };
  return {
    reachable: true,
    playing: state.state === "playing",
    volume: volumePercent(state),
    groupedWithOtherRoom: !isGroupIntact(room, groupMembersOf(state, def.coordinator)),
  };
}

// ---------------------------------------------------------------------------
// Ingang
// ---------------------------------------------------------------------------

/** Vorm van requireTrainerOrAdmin(), hier als type zodat core testbaar blijft. */
export type RoomControlGate =
  | { ok: true; userId: string; actorType: "admin" | "trainer" }
  | { ok: false; reason: "unauthenticated" | "forbidden"; message: string };

/**
 * Gate eerst, dan pas deps bouwen en de kern draaien. Een afgewezen gate
 * (401/403-equivalent) raakt HA niet en schrijft geen event; buildDeps
 * wordt dan niet eens aangeroepen. actions.ts is een dunne wrapper hierom.
 */
export async function controlRoomWithGate(
  gate: RoomControlGate,
  buildDeps: (actor: RoomControlActor) => RoomControlDeps,
  raw: unknown,
): Promise<RoomControlResult> {
  if (!gate.ok) return fail(gate.reason, gate.message);
  return controlRoomCore(buildDeps({ actorType: gate.actorType, actorId: gate.userId }), raw);
}

/**
 * Parseert, voert uit, logt. Autorisatie is al gebeurd (controlRoomWithGate
 * of actions.ts); deze functie vertrouwt deps.actor. Throwt nooit: elke
 * onverwachte fout wordt `unavailable`.
 */
export async function controlRoomCore(
  deps: RoomControlDeps,
  raw: unknown,
): Promise<RoomControlResult> {
  const parsed = parseRoomControlInput(raw);
  if (!parsed.ok) return fail(parsed.reason, parsed.message);
  const input = parsed.input;

  try {
    if (input.action === "status") {
      return { ok: true, action: "status", status: await readStatus(deps.ha, input.room) };
    }

    // Een scène op een zaal zonder licht is een fout in de aanroep, geen
    // HA-storing: die check komt vóór de configuratiecheck.
    if (input.action === "scene" && !ROOM_WHITELIST[input.room].scenes[input.scene]) {
      return fail("unsupported_for_room", ROOM_CONTROL_COPY.unsupportedForRoom);
    }

    if (!deps.ha) {
      return unavailable(
        deps,
        { room: input.room, action: input.action },
        "Home Assistant niet geconfigureerd",
      );
    }

    switch (input.action) {
      case "scene":
        return await runScene(deps, deps.ha, input.room, input.scene);
      case "volume":
        return await setRoomVolume(deps, deps.ha, input.room, input.level);
      case "play_pause":
        return await togglePlayPause(deps, deps.ha, input.room);
      case "all_off":
        return await allOff(deps, deps.ha, input.room);
    }
  } catch (err) {
    // Vangnet; de acties vangen hun eigen HA-fouten al.
    return unavailable(deps, { room: input.room, action: input.action }, describe(err));
  }
}
