import type { RoomControlInput, RoomControlResult } from "@/lib/room-control/core";

/**
 * Gedrag van het bedieningsscherm "Licht en geluid" (spec-kiosk-room-control.md,
 * PR 3), los van React: reducer, knop-naar-actie, debounce voor volume,
 * redirect bij een auth-weigering en alle copy. De repo heeft geen
 * componenttest-opzet (geen testing-library, geen jsdom), dus dit is de laag
 * die scripts/room-control/ui-controller.test.mts met node:test doorloopt;
 * RoomControlPanel.tsx is er een dunne schil omheen.
 *
 * Geen server-only imports: alleen types uit room-control/core.
 */

export type Room = "yoga" | "kracht";
export type SceneId = "inloop" | "les" | "savasana" | "uitloop" | "schoonmaak" | "uit";

export interface SceneButton {
  id: SceneId;
  name: string;
  description: string;
}

// COPY: confirm met Marlon
export const ROOM_LABEL: Record<Room, string> = {
  yoga: "Yoga Studio",
  kracht: "Kracht Studio",
};

/**
 * Volgorde en omschrijvingen uit mockups/kiosk-prototype.html. "Uitloop"
 * staat niet in het prototype (dat kende vijf scènes); de omschrijving komt
 * uit de scènetabel in discovery-kiosk-room-control.md.
 */
// COPY: confirm met Marlon
export const YOGA_SCENES: readonly SceneButton[] = [
  { id: "inloop", name: "Inloop", description: "Warm en gedimd" },
  { id: "les", name: "Les", description: "Helder en neutraal" },
  { id: "savasana", name: "Savasana", description: "Heel zacht" },
  { id: "uitloop", name: "Uitloop", description: "Rustig omhoog" },
  { id: "schoonmaak", name: "Schoonmaak", description: "Vol licht" },
  { id: "uit", name: "Uit", description: "Alle lampen uit" },
];

/** Kracht heeft nog geen lichtcontrollers (discovery §C): geen knoppen. */
export function scenesFor(room: Room): readonly SceneButton[] {
  return room === "yoga" ? YOGA_SCENES : [];
}

// COPY: confirm met Marlon
export const COPY = {
  screenTitle: "Licht en geluid",
  back: "Vandaag",
  lightLabel: "Licht",
  musicLabel: "Muziek",
  noLight: "Nog geen lichtbediening in deze zaal.",
  connected: "Verbonden met de studio",
  connecting: "Verbinden...",
  unreachable: "Niet bereikbaar",
  unavailableBar:
    "Bediening is nu niet bereikbaar. Gebruik de afstandsbediening in de zaal, of de Sonos-app op je telefoon.",
  grouped:
    "Deze zaal is via de Sonos-app aan een andere zaal gekoppeld. Pauzeren kan daarom hier niet; volume werkt wel.",
  busy: "Bezig...",
  playing: "Speelt",
  paused: "Gepauzeerd",
  playPauseAria: "Afspelen of pauzeren",
  volume: "Volume",
  softer: "Zachter",
  louder: "Harder",
  hint: "Muziek kies je zelf in de Sonos-app op je telefoon. Hier regel je alleen volume en pauze.",
  genericError: "Dat lukte niet. Probeer het opnieuw.",
  sceneDone: (scene: string) => `${scene} staat aan`,
  allOff: (room: string) => `Licht en muziek uit in ${room}`,
  sonosName: (room: string) => `Sonos, ${room}`,
} as const;

export const VOLUME_STEP = 5;
export const VOLUME_DEBOUNCE_MS = 400;
export const STATUS_INTERVAL_MS = 15_000;
export const NOTICE_MS = 3_000;
export const LOGIN_PATH = "/login?next=/kiosk/bediening";

// ---------------------------------------------------------------------------
// Zaalkeuze
// ---------------------------------------------------------------------------

export function parseRoomParam(value: string | string[] | null | undefined): Room {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "kracht" ? "kracht" : "yoga";
}

/**
 * Standaardzaal uit de pillar van de les (spec, "de app kent geen zalen").
 * kids en senior zijn nog niet besloten (stap 0, punt 6) en vallen op Yoga.
 */
export function roomForPillar(pillar: string | null | undefined): Room {
  if (pillar === "kettlebell" || pillar === "vrij_trainen") return "kracht";
  return "yoga";
}

// ---------------------------------------------------------------------------
// State en reducer
// ---------------------------------------------------------------------------

export type Busy =
  | { kind: "scene"; scene: SceneId }
  | { kind: "play_pause" }
  | { kind: "volume"; level: number }
  | { kind: "all_off" };

export interface Notice {
  tone: "info" | "error";
  text: string;
}

export interface PanelState {
  room: Room;
  /** loading tot de eerste status binnen is; unavailable toont de balk. */
  connection: "loading" | "ready" | "unavailable";
  playing: boolean;
  /** Getoonde waarde 0 t/m 100; tijdens de debounce loopt hij vooruit op HA. */
  volume: number;
  groupedWithOtherRoom: boolean;
  /** Actie die nu loopt; alle actieknoppen zijn dan uitgeschakeld. */
  busy: Busy | null;
  notice: Notice | null;
}

export type PanelEvent =
  | { type: "switch_room"; room: Room }
  | { type: "status_result"; result: RoomControlResult; preserveVolume: boolean }
  | { type: "action_start"; busy: Busy }
  | { type: "action_result"; busy: Busy; result: RoomControlResult }
  | { type: "volume_preview"; volume: number }
  | { type: "clear_notice" };

export function initialState(room: Room): PanelState {
  return {
    room,
    connection: "loading",
    playing: false,
    volume: 0,
    groupedWithOtherRoom: false,
    busy: null,
    notice: null,
  };
}

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function reduce(state: PanelState, event: PanelEvent): PanelState {
  switch (event.type) {
    case "switch_room":
      return initialState(event.room);

    case "volume_preview":
      return { ...state, volume: clampVolume(event.volume) };

    case "clear_notice":
      return { ...state, notice: null };

    case "action_start":
      return { ...state, busy: event.busy, notice: null };

    case "status_result": {
      const r = event.result;
      if (!r.ok) {
        // unauthenticated/forbidden: het component redirect; hier alleen
        // de verbinding op unavailable zetten zodat er niets bedienbaar blijft.
        return { ...state, connection: "unavailable" };
      }
      if (r.action !== "status") return state;
      if (!r.status.reachable) {
        return { ...state, connection: "unavailable" };
      }
      return {
        ...state,
        connection: "ready",
        playing: r.status.playing,
        volume: event.preserveVolume ? state.volume : r.status.volume,
        groupedWithOtherRoom: r.status.groupedWithOtherRoom,
      };
    }

    case "action_result": {
      const r = event.result;
      const base: PanelState = { ...state, busy: null };
      if (!r.ok) {
        switch (r.reason) {
          case "unavailable":
            return { ...base, connection: "unavailable", notice: null };
          case "grouped_with_other_room":
            return {
              ...base,
              groupedWithOtherRoom: true,
              notice: { tone: "error", text: COPY.grouped },
            };
          case "unauthenticated":
          case "forbidden":
            // Redirect gebeurt in het component (redirectFor); geen melding.
            return base;
          default:
            return { ...base, notice: { tone: "error", text: COPY.genericError } };
        }
      }
      const ready: PanelState = { ...base, connection: "ready" };
      switch (event.busy.kind) {
        case "scene":
          return {
            ...ready,
            notice: { tone: "info", text: COPY.sceneDone(sceneName(event.busy.scene)) },
          };
        case "play_pause":
          // Optimistisch tot de volgende status; die volgt direct na de actie.
          return { ...ready, playing: !state.playing, groupedWithOtherRoom: false };
        case "volume":
          return ready;
        case "all_off":
          return {
            ...ready,
            playing: false,
            notice: { tone: "info", text: COPY.allOff(ROOM_LABEL[state.room]) },
          };
      }
    }
  }
}

export function sceneName(scene: SceneId): string {
  return YOGA_SCENES.find((s) => s.id === scene)?.name ?? scene;
}

// ---------------------------------------------------------------------------
// Knop naar server-action-invoer
// ---------------------------------------------------------------------------

/** De enige plek waar de UI een RoomControlInput bouwt; nooit entity-ids. */
export function inputFor(room: Room, busy: Busy): RoomControlInput {
  switch (busy.kind) {
    case "scene":
      return { room, action: "scene", scene: busy.scene };
    case "volume":
      return { room, action: "volume", level: clampVolume(busy.level) };
    case "play_pause":
      return { room, action: "play_pause" };
    case "all_off":
      return { room, action: "all_off" };
  }
}

export function statusInput(room: Room): RoomControlInput {
  return { room, action: "status" };
}

/** Bij een auth-weigering terug naar de bestaande loginflow, met next. */
export function redirectFor(result: RoomControlResult): string | null {
  if (result.ok) return null;
  return result.reason === "unauthenticated" || result.reason === "forbidden" ? LOGIN_PATH : null;
}

// ---------------------------------------------------------------------------
// Afgeleide weergave
// ---------------------------------------------------------------------------

/** Scènes, all_off en volume: uit zolang er een verzoek loopt of HA weg is. */
export function isActionDisabled(state: PanelState): boolean {
  return state.busy !== null || state.connection !== "ready";
}

/** Play/pauze: als hierboven, plus geweigerd zolang de zaal gekoppeld is. */
export function isPlayPauseDisabled(state: PanelState): boolean {
  return isActionDisabled(state) || state.groupedWithOtherRoom;
}

export function connectionText(state: PanelState): string {
  switch (state.connection) {
    case "loading":
      return COPY.connecting;
    case "ready":
      return COPY.connected;
    case "unavailable":
      return COPY.unreachable;
  }
}

// ---------------------------------------------------------------------------
// Volume-debounce: snelle tikken worden één verzoek met de eindwaarde
// ---------------------------------------------------------------------------

export interface VolumeDebouncerDeps {
  delayMs: number;
  schedule: (fn: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
  onFlush: (level: number) => void;
}

export interface VolumeDebouncer {
  /** Telt delta op bij de laatst gevraagde (of getoonde) waarde; geeft de nieuwe getoonde waarde terug. */
  tap(shown: number, delta: number): number;
  /** Stuurt de opgebouwde eindwaarde nu, als er een is. */
  flush(): void;
  isPending(): boolean;
  dispose(): void;
}

export function createVolumeDebouncer(deps: VolumeDebouncerDeps): VolumeDebouncer {
  let target: number | null = null;
  let handle: unknown = null;

  function flush() {
    if (handle !== null) {
      deps.cancel(handle);
      handle = null;
    }
    if (target === null) return;
    const level = target;
    target = null;
    deps.onFlush(level);
  }

  return {
    tap(shown, delta) {
      const base = target ?? shown;
      target = clampVolume(base + delta);
      if (handle !== null) deps.cancel(handle);
      handle = deps.schedule(flush, deps.delayMs);
      return target;
    },
    flush,
    isPending: () => target !== null,
    dispose() {
      if (handle !== null) deps.cancel(handle);
      handle = null;
      target = null;
    },
  };
}
