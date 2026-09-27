/**
 * Gedrag van het bedieningsscherm (src/app/kiosk/bediening/_lib/controller.ts)
 * zonder React: knop naar actie, Kracht zonder lichtknoppen, debounce van
 * volume, uitgeschakelde knoppen tijdens een verzoek, en de drie foutstaten
 * (unavailable, grouped_with_other_room, auth-weigering). De repo heeft geen
 * componenttest-opzet; RoomControlPanel.tsx is een dunne schil om deze laag.
 * Run: npm run test:room-control
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COPY,
  LOGIN_PATH,
  connectionText,
  createVolumeDebouncer,
  initialState,
  inputFor,
  isActionDisabled,
  isPlayPauseDisabled,
  parseRoomParam,
  reduce,
  redirectFor,
  roomForPillar,
  scenesFor,
  statusInput,
  type PanelState,
} from "../../src/app/kiosk/bediening/_lib/controller";
import type { RoomControlResult } from "../../src/lib/room-control/core";

function ready(overrides: Partial<PanelState> = {}): PanelState {
  return { ...initialState("yoga"), connection: "ready", volume: 30, ...overrides };
}

const okStatus = (
  s: { playing: boolean; volume: number; groupedWithOtherRoom: boolean },
): RoomControlResult => ({ ok: true, action: "status", status: { reachable: true, ...s } });

// ---------------------------------------------------------------------------
// Zaalkeuze en knoppen
// ---------------------------------------------------------------------------

test("zaalparameter en pillar: yoga is de standaard, kracht alleen expliciet", () => {
  assert.equal(parseRoomParam("kracht"), "kracht");
  assert.equal(parseRoomParam("yoga"), "yoga");
  assert.equal(parseRoomParam("entree"), "yoga");
  assert.equal(parseRoomParam(undefined), "yoga");
  assert.equal(parseRoomParam(["kracht"]), "kracht");
  assert.equal(roomForPillar("kettlebell"), "kracht");
  assert.equal(roomForPillar("vrij_trainen"), "kracht");
  assert.equal(roomForPillar("yoga_mobility"), "yoga");
  assert.equal(roomForPillar("kids"), "yoga");
  assert.equal(roomForPillar(null), "yoga");
});

test("Yoga toont zes scènes in de vaste volgorde, Kracht geen enkele", () => {
  assert.deepEqual(
    scenesFor("yoga").map((s) => s.id),
    ["inloop", "les", "savasana", "uitloop", "schoonmaak", "uit"],
  );
  assert.deepEqual(
    scenesFor("yoga").map((s) => s.name),
    ["Inloop", "Les", "Savasana", "Uitloop", "Schoonmaak", "Uit"],
  );
  assert.deepEqual(scenesFor("kracht"), []);
  assert.equal(COPY.noLight, "Nog geen lichtbediening in deze zaal.");
});

test("elke knop bouwt precies de bijbehorende server-action-invoer, zonder entity-ids", () => {
  assert.deepEqual(inputFor("yoga", { kind: "scene", scene: "savasana" }), {
    room: "yoga",
    action: "scene",
    scene: "savasana",
  });
  assert.deepEqual(inputFor("kracht", { kind: "volume", level: 45 }), {
    room: "kracht",
    action: "volume",
    level: 45,
  });
  assert.deepEqual(inputFor("kracht", { kind: "volume", level: 123 }), {
    room: "kracht",
    action: "volume",
    level: 100,
  });
  assert.deepEqual(inputFor("kracht", { kind: "play_pause" }), { room: "kracht", action: "play_pause" });
  assert.deepEqual(inputFor("yoga", { kind: "all_off" }), { room: "yoga", action: "all_off" });
  assert.deepEqual(statusInput("kracht"), { room: "kracht", action: "status" });
  for (const input of [inputFor("yoga", { kind: "scene", scene: "les" }), statusInput("yoga")]) {
    assert.equal(JSON.stringify(input).includes("media_player."), false);
    assert.equal(JSON.stringify(input).includes("script."), false);
  }
});

// ---------------------------------------------------------------------------
// Debounce
// ---------------------------------------------------------------------------

test("volume-debounce: snelle tikken worden één verzoek met de eindwaarde, na de vertraging", () => {
  const scheduled: Array<{ fn: () => void; ms: number; cancelled: boolean }> = [];
  const flushed: number[] = [];
  const d = createVolumeDebouncer({
    delayMs: 400,
    schedule: (fn, ms) => {
      const entry = { fn, ms, cancelled: false };
      scheduled.push(entry);
      return entry;
    },
    cancel: (h) => {
      (h as { cancelled: boolean }).cancelled = true;
    },
    onFlush: (level) => flushed.push(level),
  });

  assert.equal(d.tap(30, 5), 35);
  assert.equal(d.tap(35, 5), 40);
  assert.equal(d.tap(40, -5), 35);
  assert.equal(d.tap(35, 5), 40);
  assert.equal(d.isPending(), true);
  assert.equal(flushed.length, 0, "nog niets verstuurd tijdens het tikken");
  assert.equal(scheduled.length, 4);
  assert.equal(scheduled.filter((s) => s.cancelled).length, 3, "elke tik verschuift de timer");
  assert.equal(scheduled[3].ms, 400);

  scheduled[3].fn();
  assert.deepEqual(flushed, [40], "één verzoek met de eindwaarde");
  assert.equal(d.isPending(), false);
});

test("volume-debounce: klemt op 0 en 100, en flush() stuurt direct", () => {
  const flushed: number[] = [];
  const d = createVolumeDebouncer({
    delayMs: 400,
    schedule: () => ({}),
    cancel: () => {},
    onFlush: (level) => flushed.push(level),
  });
  assert.equal(d.tap(98, 5), 100);
  assert.equal(d.tap(100, 5), 100);
  d.flush();
  assert.deepEqual(flushed, [100]);
  assert.equal(d.tap(3, -5), 0);
  d.flush();
  assert.deepEqual(flushed, [100, 0]);
  d.flush();
  assert.deepEqual(flushed, [100, 0], "zonder opgebouwde waarde stuurt flush niets");
});

// ---------------------------------------------------------------------------
// Reducer: verzoek loopt, resultaat per knop
// ---------------------------------------------------------------------------

test("tijdens een verzoek zijn alle actieknoppen uit; daarna weer aan", () => {
  const s0 = ready();
  assert.equal(isActionDisabled(s0), false);
  const s1 = reduce(s0, { type: "action_start", busy: { kind: "scene", scene: "les" } });
  assert.equal(isActionDisabled(s1), true);
  assert.equal(isPlayPauseDisabled(s1), true);
  const s2 = reduce(s1, {
    type: "action_result",
    busy: { kind: "scene", scene: "les" },
    result: { ok: true, action: "scene" },
  });
  assert.equal(isActionDisabled(s2), false);
  assert.deepEqual(s2.notice, { tone: "info", text: "Les staat aan" });
});

test("laadstaat: tot de eerste status binnen is, staan de knoppen uit", () => {
  const s = initialState("yoga");
  assert.equal(isActionDisabled(s), true);
  assert.equal(connectionText(s), COPY.connecting);
  const s2 = reduce(s, {
    type: "status_result",
    result: okStatus({ playing: true, volume: 12, groupedWithOtherRoom: false }),
    preserveVolume: false,
  });
  assert.equal(isActionDisabled(s2), false);
  assert.equal(s2.playing, true);
  assert.equal(s2.volume, 12);
  assert.equal(connectionText(s2), COPY.connected);
});

test("status tijdens een lopende volume-debounce overschrijft de getoonde waarde niet", () => {
  const s = reduce(ready({ volume: 45 }), {
    type: "status_result",
    result: okStatus({ playing: false, volume: 30, groupedWithOtherRoom: false }),
    preserveVolume: true,
  });
  assert.equal(s.volume, 45);
});

test("play/pauze en alles-uit: optimistische speelstand en melding", () => {
  const playing = ready({ playing: true });
  const paused = reduce(playing, {
    type: "action_result",
    busy: { kind: "play_pause" },
    result: { ok: true, action: "play_pause" },
  });
  assert.equal(paused.playing, false);

  const off = reduce(ready({ playing: true, room: "kracht" }), {
    type: "action_result",
    busy: { kind: "all_off" },
    result: { ok: true, action: "all_off" },
  });
  assert.equal(off.playing, false);
  assert.deepEqual(off.notice, { tone: "info", text: "Licht en muziek uit in Kracht Studio" });
});

test("tabwissel zet de staat terug naar laden voor de nieuwe zaal", () => {
  const s = reduce(ready({ playing: true, volume: 80 }), { type: "switch_room", room: "kracht" });
  assert.equal(s.room, "kracht");
  assert.equal(s.connection, "loading");
  assert.equal(s.busy, null);
});

// ---------------------------------------------------------------------------
// Foutstaten
// ---------------------------------------------------------------------------

test("unavailable: balk, statusindicator Niet bereikbaar, alle knoppen uit", () => {
  const s = reduce(ready(), {
    type: "action_result",
    busy: { kind: "scene", scene: "inloop" },
    result: { ok: false, reason: "unavailable", message: "x" },
  });
  assert.equal(s.connection, "unavailable");
  assert.equal(connectionText(s), COPY.unreachable);
  assert.equal(isActionDisabled(s), true);
  assert.equal(isPlayPauseDisabled(s), true);
  assert.equal(s.notice, null, "de balk is de melding; geen extra toast");
  assert.match(COPY.unavailableBar, /niet bereikbaar/);

  const viaStatus = reduce(ready(), {
    type: "status_result",
    result: { ok: true, action: "status", status: { reachable: false } },
    preserveVolume: false,
  });
  assert.equal(viaStatus.connection, "unavailable");
});

test("grouped_with_other_room: melding, play/pauze uit, volume blijft werken", () => {
  const s = reduce(ready(), {
    type: "action_result",
    busy: { kind: "play_pause" },
    result: { ok: false, reason: "grouped_with_other_room", message: "x" },
  });
  assert.equal(s.groupedWithOtherRoom, true);
  assert.deepEqual(s.notice, { tone: "error", text: COPY.grouped });
  assert.equal(isPlayPauseDisabled(s), true);
  assert.equal(isActionDisabled(s), false, "volume en scènes blijven bedienbaar");

  const viaStatus = reduce(ready(), {
    type: "status_result",
    result: okStatus({ playing: true, volume: 10, groupedWithOtherRoom: true }),
    preserveVolume: false,
  });
  assert.equal(isPlayPauseDisabled(viaStatus), true);
  assert.equal(isActionDisabled(viaStatus), false);
});

test("unauthenticated en forbidden: naar de loginflow met next, geen melding", () => {
  for (const reason of ["unauthenticated", "forbidden"] as const) {
    const result: RoomControlResult = { ok: false, reason, message: "x" };
    assert.equal(redirectFor(result), LOGIN_PATH);
    const s = reduce(ready(), { type: "action_result", busy: { kind: "all_off" }, result });
    assert.equal(s.notice, null);
    assert.equal(s.busy, null);
  }
  assert.equal(redirectFor({ ok: true, action: "scene" }), null);
  assert.equal(redirectFor({ ok: false, reason: "unavailable", message: "x" }), null);
  assert.equal(LOGIN_PATH, "/login?next=/kiosk/bediening");
});

test("overige afwijzingen (invalid_input, unsupported_for_room) geven een generieke melding", () => {
  const s = reduce(ready(), {
    type: "action_result",
    busy: { kind: "scene", scene: "les" },
    result: { ok: false, reason: "unsupported_for_room", message: "x" },
  });
  assert.deepEqual(s.notice, { tone: "error", text: COPY.genericError });
  assert.equal(isActionDisabled(s), false);
});
