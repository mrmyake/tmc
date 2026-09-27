/**
 * Gesloten whitelist van de kiosk-zaalbediening (spec-kiosk-room-control.md,
 * "Whitelist per zaal"). Dit is de ENIGE plek waar Home Assistant-entity-ids
 * voorkomen aan de app-kant. De server action neemt alleen enum-waarden aan
 * (zaal, actie, scène) en vertaalt die hier naar entity-ids; niets uit de
 * invoer wordt ooit als entity-id of service-naam doorgegeven.
 *
 * Geen imports: dit bestand moet zonder server-only of runtime-afhankelijk-
 * heden in de node:test-suites (scripts/room-control/) te laden zijn.
 */

export const ROOMS = ["yoga", "kracht"] as const;
export type Room = (typeof ROOMS)[number];

export const SCENES = ["inloop", "les", "savasana", "uitloop", "schoonmaak", "uit"] as const;
export type Scene = (typeof SCENES)[number];

export const ACTIONS = ["scene", "volume", "play_pause", "all_off", "status"] as const;
export type Action = (typeof ACTIONS)[number];

export interface RoomDefinition {
  /** Weergavenaam, alleen voor foutmeldingen en events. */
  readonly label: string;
  /** Scène naar script-entity. Leeg object: de zaal heeft (nog) geen licht. */
  readonly scenes: Readonly<Partial<Record<Scene, `script.${string}`>>>;
  /** De scène die "alles uit" voor het licht betekent, of null zonder licht. */
  readonly offScene: Scene | null;
  /** Alle Sonos-spelers van de zaal; volume gaat naar elk van deze. */
  readonly players: readonly `media_player.${string}`[];
  /** De speler die play/pause en pause ontvangt. Altijd een van players. */
  readonly coordinator: `media_player.${string}`;
}

export const ROOM_WHITELIST: Readonly<Record<Room, RoomDefinition>> = {
  yoga: {
    label: "Yoga Studio",
    scenes: {
      inloop: "script.yoga_inloop",
      les: "script.yoga_les",
      savasana: "script.yoga_savasana",
      uitloop: "script.yoga_uitloop",
      schoonmaak: "script.yoga_schoonmaak",
      uit: "script.yoga_uit",
    },
    offScene: "uit",
    players: ["media_player.yoga_studio_yoga_studio"],
    coordinator: "media_player.yoga_studio_yoga_studio",
  },
  kracht: {
    // Geen lichtcontrollers gekoppeld (discovery §C); scènes komen erbij in
    // een vervolg-PR zodra die hangen. Front is de coördinator van het paar
    // (stap 0, 2026-09-27).
    label: "Kracht Studio",
    scenes: {},
    offScene: null,
    players: ["media_player.kracht_front_kracht_front", "media_player.kracht_back_kracht_back"],
    coordinator: "media_player.kracht_front_kracht_front",
  },
};

export function isRoom(value: unknown): value is Room {
  return typeof value === "string" && (ROOMS as readonly string[]).includes(value);
}

export function isScene(value: unknown): value is Scene {
  return typeof value === "string" && (SCENES as readonly string[]).includes(value);
}

export function isAction(value: unknown): value is Action {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

/**
 * Waar of de Sonos-groep precies de spelers van deze zaal bevat: niet meer
 * (een speler van een andere zaal, of een thuisrestant) en niet minder (een
 * eigen speler losgetrokken). Beide gevallen betekenen dat play/pause op de
 * coördinator niet "deze zaal" zou raken, dus beide worden geweigerd.
 */
export function isGroupIntact(room: Room, groupMembers: readonly string[]): boolean {
  const expected = ROOM_WHITELIST[room].players;
  if (groupMembers.length !== expected.length) return false;
  const set = new Set(groupMembers);
  return expected.every((p) => set.has(p));
}
