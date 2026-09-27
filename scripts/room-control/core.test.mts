/**
 * Contract van src/lib/room-control/core.ts (spec-kiosk-room-control.md,
 * PR 2) tegen een fake HA-client en een fake emit: strikte parser, gate,
 * whitelist (nooit invoer als entity-id), de Sonos-regels, all_off zonder
 * toggle, `unavailable` en de events per uitkomst.
 * Run: npm run test:room-control
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { HomeAssistantApi, HomeAssistantState } from "../../src/lib/home-assistant";
import type { EmitEventInput } from "../../src/lib/events/emit";
import {
  controlRoomCore,
  controlRoomWithGate,
  parseRoomControlInput,
  type RoomControlDeps,
} from "../../src/lib/room-control/core";
import { ROOM_WHITELIST } from "../../src/lib/room-control/whitelist";

const YOGA = "media_player.yoga_studio_yoga_studio";
const FRONT = "media_player.kracht_front_kracht_front";
const BACK = "media_player.kracht_back_kracht_back";

type Call = { fn: string; args: unknown[] };

interface FakeHa extends HomeAssistantApi {
  calls: Call[];
}

function state(
  entityId: string,
  s: string,
  attributes: Record<string, unknown> = {},
): HomeAssistantState {
  return { entity_id: entityId, state: s, attributes };
}

function fakeHa(opts: { states?: HomeAssistantState[]; failOn?: string[] } = {}): FakeHa {
  const calls: Call[] = [];
  const failOn = new Set(opts.failOn ?? []);
  const maybeFail = (fn: string) => {
    if (failOn.has(fn)) throw new Error(`HomeAssistantError: ${fn} faalt (fake)`);
  };
  return {
    calls,
    async runScript(id) {
      calls.push({ fn: "runScript", args: [id] });
      maybeFail("runScript");
    },
    async setVolume(id, level) {
      calls.push({ fn: "setVolume", args: [id, level] });
      maybeFail("setVolume");
    },
    async playPause(id) {
      calls.push({ fn: "playPause", args: [id] });
      maybeFail("playPause");
    },
    async pause(id) {
      calls.push({ fn: "pause", args: [id] });
      maybeFail("pause");
    },
    async getStates(ids) {
      calls.push({ fn: "getStates", args: [ids] });
      maybeFail("getStates");
      return (opts.states ?? []).filter((s) => ids.includes(s.entity_id));
    },
  };
}

function deps(ha: HomeAssistantApi | null): RoomControlDeps & { events: EmitEventInput[] } {
  const events: EmitEventInput[] = [];
  return {
    ha,
    events,
    emit: async (e) => {
      events.push(e);
      return true;
    },
    actor: { actorType: "trainer", actorId: "00000000-0000-0000-0000-000000000001" },
  };
}

const ALL_ENTITY_IDS = new Set<string>(
  Object.values(ROOM_WHITELIST).flatMap((r) => [
    ...Object.values(r.scenes),
    ...r.players,
    r.coordinator,
  ]),
);

function assertOnlyWhitelistedIds(ha: FakeHa) {
  for (const c of ha.calls) {
    const ids = c.fn === "getStates" ? (c.args[0] as string[]) : [c.args[0] as string];
    for (const id of ids) {
      assert.ok(ALL_ENTITY_IDS.has(id), `${c.fn} kreeg een id buiten de whitelist: ${id}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Parser en afwijzingen
// ---------------------------------------------------------------------------

test("parser: onbekende zaal, actie, scène, level buiten bereik en extra velden worden afgewezen", () => {
  const bad: unknown[] = [
    null,
    "yoga",
    [],
    {},
    { room: "entree", action: "scene", scene: "les" },
    { room: "yoga", action: "dance" },
    { room: "yoga", action: "scene", scene: "disco" },
    { room: "yoga", action: "scene", scene: "script.yoga_les" },
    { room: "yoga", action: "scene" },
    { room: "yoga", action: "volume", level: -1 },
    { room: "yoga", action: "volume", level: 101 },
    { room: "yoga", action: "volume", level: 12.5 },
    { room: "yoga", action: "volume", level: "50" },
    { room: "yoga", action: "volume", level: "media_player.buiten_buiten" },
    { room: "yoga", action: "volume" },
    { room: "yoga", action: "play_pause", level: 3 },
    { room: "yoga", action: "status", entity_id: "light.x" },
    { room: "yoga", action: "scene", scene: "les", service: "homeassistant.restart" },
  ];
  for (const raw of bad) {
    const r = parseRoomControlInput(raw);
    assert.equal(r.ok, false, JSON.stringify(raw));
    assert.equal(r.ok === false && r.reason, "invalid_input", JSON.stringify(raw));
  }
  for (const raw of [
    { room: "yoga", action: "scene", scene: "les" },
    { room: "kracht", action: "volume", level: 0 },
    { room: "kracht", action: "volume", level: 100 },
    { room: "yoga", action: "play_pause" },
    { room: "kracht", action: "all_off" },
    { room: "yoga", action: "status" },
  ]) {
    assert.equal(parseRoomControlInput(raw).ok, true, JSON.stringify(raw));
  }
});

test("ongeldige invoer raakt HA niet en schrijft geen event", async () => {
  const ha = fakeHa();
  const d = deps(ha);
  const r = await controlRoomCore(d, { room: "yoga", action: "scene", scene: "script.evil" });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "invalid_input");
  assert.equal(ha.calls.length, 0);
  assert.equal(d.events.length, 0);
});

test("scène op Kracht (geen licht): unsupported_for_room, geen HA-call, geen event", async () => {
  const ha = fakeHa();
  const d = deps(ha);
  const r = await controlRoomCore(d, { room: "kracht", action: "scene", scene: "les" });
  assert.deepEqual(r.ok === false && r.reason, "unsupported_for_room");
  assert.equal(ha.calls.length, 0);
  assert.equal(d.events.length, 0);
});

// ---------------------------------------------------------------------------
// Gate (401/403-equivalent)
// ---------------------------------------------------------------------------

test("gate: niet ingelogd geeft unauthenticated, geen staff geeft forbidden; deps worden niet gebouwd", async () => {
  let built = 0;
  const build = () => {
    built += 1;
    return deps(fakeHa());
  };
  const r401 = await controlRoomWithGate(
    { ok: false, reason: "unauthenticated", message: "Je bent uitgelogd." },
    build,
    { room: "yoga", action: "status" },
  );
  assert.deepEqual(r401, { ok: false, reason: "unauthenticated", message: "Je bent uitgelogd." });
  const r403 = await controlRoomWithGate(
    { ok: false, reason: "forbidden", message: "Geen toegang." },
    build,
    { room: "yoga", action: "scene", scene: "les" },
  );
  assert.deepEqual(r403, { ok: false, reason: "forbidden", message: "Geen toegang." });
  assert.equal(built, 0, "zonder geslaagde gate geen deps, dus geen HA en geen events");

  const ha = fakeHa();
  const d = deps(ha);
  const ok = await controlRoomWithGate(
    { ok: true, userId: "u1", actorType: "admin" },
    (actor) => ({ ...d, actor }),
    { room: "yoga", action: "scene", scene: "les" },
  );
  assert.deepEqual(ok, { ok: true, action: "scene" });
  assert.equal(d.events[0]?.actorType, "admin");
  assert.equal(d.events[0]?.actorId, "u1");
});

// ---------------------------------------------------------------------------
// Whitelist en scènes
// ---------------------------------------------------------------------------

test("scène: exact het whitelist-script, nooit iets uit de invoer, plus room.scene_activated", async () => {
  const ha = fakeHa();
  const d = deps(ha);
  const r = await controlRoomCore(d, { room: "yoga", action: "scene", scene: "savasana" });
  assert.deepEqual(r, { ok: true, action: "scene" });
  assert.deepEqual(ha.calls, [{ fn: "runScript", args: ["script.yoga_savasana"] }]);
  assertOnlyWhitelistedIds(ha);
  assert.equal(d.events.length, 1);
  assert.equal(d.events[0].type, "room.scene_activated");
  assert.equal(d.events[0].subjectType, "room");
  assert.equal(d.events[0].subjectId, null);
  assert.deepEqual(d.events[0].payload, {
    room: "yoga",
    action: "scene",
    scene: "savasana",
    script_entity_id: "script.yoga_savasana",
    outcome: "ok",
  });
});

test("alle zes Yoga-scènes mappen op script.yoga_<scène>", async () => {
  for (const scene of ["inloop", "les", "savasana", "uitloop", "schoonmaak", "uit"]) {
    const ha = fakeHa();
    await controlRoomCore(deps(ha), { room: "yoga", action: "scene", scene });
    assert.deepEqual(ha.calls, [{ fn: "runScript", args: [`script.yoga_${scene}`] }]);
  }
});

// ---------------------------------------------------------------------------
// Sonos-regels
// ---------------------------------------------------------------------------

test("volume: beide Kracht-spelers op hetzelfde niveau (0 t/m 1), event met level 0 t/m 100", async () => {
  const ha = fakeHa();
  const d = deps(ha);
  const r = await controlRoomCore(d, { room: "kracht", action: "volume", level: 40 });
  assert.deepEqual(r, { ok: true, action: "volume" });
  assert.deepEqual(ha.calls, [
    { fn: "setVolume", args: [FRONT, 0.4] },
    { fn: "setVolume", args: [BACK, 0.4] },
  ]);
  assertOnlyWhitelistedIds(ha);
  assert.equal(d.events[0].type, "room.sonos_adjusted");
  assert.equal(d.events[0].payload?.level, 40);
  assert.deepEqual(d.events[0].payload?.players, [FRONT, BACK]);
});

test("volume: Yoga heeft één speler", async () => {
  const ha = fakeHa();
  await controlRoomCore(deps(ha), { room: "yoga", action: "volume", level: 0 });
  assert.deepEqual(ha.calls, [{ fn: "setVolume", args: [YOGA, 0] }]);
});

test("play_pause: geweigerd als de coördinator gegroepeerd is met een andere zaal, niets uitgevoerd", async () => {
  const ha = fakeHa({ states: [state(FRONT, "paused", { group_members: [YOGA, FRONT, BACK] })] });
  const d = deps(ha);
  const r = await controlRoomCore(d, { room: "kracht", action: "play_pause" });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "grouped_with_other_room");
  assert.deepEqual(
    ha.calls.map((c) => c.fn),
    ["getStates"],
    "alleen gelezen, geen playPause",
  );
  assert.equal(d.events.length, 1);
  assert.equal(d.events[0].type, "room.control_failed");
  assert.equal(d.events[0].payload?.reason, "grouped_with_other_room");
  assert.equal(d.events[0].payload?.outcome, "refused");
});

test("play_pause: ook geweigerd als een eigen speler is losgetrokken (Kracht Back ontbreekt)", async () => {
  const ha = fakeHa({ states: [state(FRONT, "playing", { group_members: [FRONT] })] });
  const r = await controlRoomCore(deps(ha), { room: "kracht", action: "play_pause" });
  assert.equal(r.ok === false && r.reason, "grouped_with_other_room");
  assert.equal(ha.calls.some((c) => c.fn === "playPause"), false);
});

test("play_pause: intacte groep, toggle alleen op de coördinator, event room.sonos_adjusted", async () => {
  const ha = fakeHa({ states: [state(FRONT, "playing", { group_members: [FRONT, BACK] })] });
  const d = deps(ha);
  const r = await controlRoomCore(d, { room: "kracht", action: "play_pause" });
  assert.deepEqual(r, { ok: true, action: "play_pause" });
  assert.deepEqual(ha.calls[1], { fn: "playPause", args: [FRONT] });
  assert.equal(ha.calls.length, 2);
  assert.equal(d.events[0].type, "room.sonos_adjusted");
  assert.equal(d.events[0].payload?.was_playing, true);
});

test("play_pause: Yoga zonder group_members-attribuut telt als losstaand en mag", async () => {
  const ha = fakeHa({ states: [state(YOGA, "paused")] });
  const r = await controlRoomCore(deps(ha), { room: "yoga", action: "play_pause" });
  assert.deepEqual(r, { ok: true, action: "play_pause" });
  assert.deepEqual(ha.calls[1], { fn: "playPause", args: [YOGA] });
});

// ---------------------------------------------------------------------------
// all_off
// ---------------------------------------------------------------------------

test("all_off Yoga met spelende muziek: uit-script en pause, nooit de toggle", async () => {
  const ha = fakeHa({ states: [state(YOGA, "playing", { group_members: [YOGA] })] });
  const d = deps(ha);
  const r = await controlRoomCore(d, { room: "yoga", action: "all_off" });
  assert.deepEqual(r, { ok: true, action: "all_off" });
  assert.deepEqual(
    ha.calls.map((c) => c.fn),
    ["getStates", "runScript", "pause"],
  );
  assert.deepEqual(ha.calls[1].args, ["script.yoga_uit"]);
  assert.deepEqual(ha.calls[2].args, [YOGA]);
  assert.equal(ha.calls.some((c) => c.fn === "playPause"), false);
  assert.equal(d.events[0].type, "room.sonos_adjusted");
  assert.deepEqual(
    { lights_off: d.events[0].payload?.lights_off, paused: d.events[0].payload?.paused },
    { lights_off: true, paused: true },
  );
});

test("all_off Yoga met gepauzeerde muziek: alleen het uit-script, geen pause", async () => {
  const ha = fakeHa({ states: [state(YOGA, "paused", { group_members: [YOGA] })] });
  const d = deps(ha);
  await controlRoomCore(d, { room: "yoga", action: "all_off" });
  assert.deepEqual(
    ha.calls.map((c) => c.fn),
    ["getStates", "runScript"],
  );
  assert.equal(d.events[0].payload?.paused, false);
});

test("all_off Kracht: geen licht dus geen script, pause alleen als de coördinator speelt", async () => {
  const playing = fakeHa({ states: [state(FRONT, "playing", { group_members: [FRONT, BACK] })] });
  await controlRoomCore(deps(playing), { room: "kracht", action: "all_off" });
  assert.deepEqual(
    playing.calls.map((c) => c.fn),
    ["getStates", "pause"],
  );
  assert.deepEqual(playing.calls[1].args, [FRONT]);

  const paused = fakeHa({ states: [state(FRONT, "paused", { group_members: [FRONT, BACK] })] });
  const d = deps(paused);
  const r = await controlRoomCore(d, { room: "kracht", action: "all_off" });
  assert.deepEqual(r, { ok: true, action: "all_off" });
  assert.deepEqual(
    paused.calls.map((c) => c.fn),
    ["getStates"],
  );
  assert.deepEqual(
    { lights_off: d.events[0].payload?.lights_off, paused: d.events[0].payload?.paused },
    { lights_off: false, paused: false },
  );
});

test("all_off: bij een afwijkende groep gebeurt er niets, ook niet met het licht", async () => {
  const ha = fakeHa({ states: [state(YOGA, "playing", { group_members: [YOGA, FRONT, BACK] })] });
  const r = await controlRoomCore(deps(ha), { room: "yoga", action: "all_off" });
  assert.equal(r.ok === false && r.reason, "grouped_with_other_room");
  assert.deepEqual(
    ha.calls.map((c) => c.fn),
    ["getStates"],
  );
});

// ---------------------------------------------------------------------------
// unavailable en status
// ---------------------------------------------------------------------------

test("HA niet geconfigureerd (client null): unavailable met vaste copy en room.control_failed", async () => {
  const d = deps(null);
  const r = await controlRoomCore(d, { room: "yoga", action: "scene", scene: "les" });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "unavailable");
  assert.ok(r.ok === false && r.message.length > 0);
  assert.equal(d.events.length, 1);
  assert.equal(d.events[0].type, "room.control_failed");
  assert.equal(d.events[0].payload?.reason, "unavailable");
  assert.deepEqual(
    { room: d.events[0].payload?.room, action: d.events[0].payload?.action },
    { room: "yoga", action: "scene" },
  );
});

test("HA-fout tijdens een call: unavailable, geen HA-details in de melding, room.control_failed", async () => {
  const ha = fakeHa({ failOn: ["runScript"] });
  const d = deps(ha);
  const r = await controlRoomCore(d, { room: "yoga", action: "scene", scene: "les" });
  assert.equal(r.ok === false && r.reason, "unavailable");
  assert.ok(r.ok === false && !r.message.includes("fake"), "de HA-fout zelf hoort niet in de melding");
  assert.equal(d.events[0].type, "room.control_failed");
  assert.equal(d.events[0].payload?.reason, "unavailable");
});

test("volume: faalt de tweede speler, dan unavailable met de al toegepaste spelers in de payload", async () => {
  let n = 0;
  const ha = fakeHa();
  const original = ha.setVolume;
  ha.setVolume = async (id, level) => {
    await original(id, level);
    n += 1;
    if (n === 2) throw new Error("HomeAssistantError: 503");
  };
  const d = deps(ha);
  const r = await controlRoomCore(d, { room: "kracht", action: "volume", level: 20 });
  assert.equal(r.ok === false && r.reason, "unavailable");
  assert.deepEqual(d.events[0].payload?.applied, [FRONT]);
});

test("status: HA null geeft reachable false zonder event", async () => {
  const d = deps(null);
  const r = await controlRoomCore(d, { room: "kracht", action: "status" });
  assert.deepEqual(r, { ok: true, action: "status", status: { reachable: false } });
  assert.equal(d.events.length, 0);
});

test("status: speelt, volume 0 t/m 100 en groepering, alleen die velden, geen event", async () => {
  const ha = fakeHa({
    states: [state(FRONT, "playing", { group_members: [YOGA, FRONT, BACK], volume_level: 0.084, media_title: "geheim" })],
  });
  const d = deps(ha);
  const r = await controlRoomCore(d, { room: "kracht", action: "status" });
  assert.deepEqual(r, {
    ok: true,
    action: "status",
    status: { reachable: true, playing: true, volume: 8, groupedWithOtherRoom: true },
  });
  assert.equal(d.events.length, 0);

  const ok = fakeHa({ states: [state(YOGA, "paused", { group_members: [YOGA], volume_level: 0.12 })] });
  const r2 = await controlRoomCore(deps(ok), { room: "yoga", action: "status" });
  assert.deepEqual(
    r2.ok && r2.action === "status" && r2.status,
    { reachable: true, playing: false, volume: 12, groupedWithOtherRoom: false },
  );
});

test("status: getStates faalt of de coördinator is unavailable geeft reachable false", async () => {
  const failing = fakeHa({ failOn: ["getStates"] });
  const r1 = await controlRoomCore(deps(failing), { room: "yoga", action: "status" });
  assert.deepEqual(r1, { ok: true, action: "status", status: { reachable: false } });

  const offline = fakeHa({ states: [state(YOGA, "unavailable")] });
  const r2 = await controlRoomCore(deps(offline), { room: "yoga", action: "status" });
  assert.deepEqual(r2, { ok: true, action: "status", status: { reachable: false } });
});
