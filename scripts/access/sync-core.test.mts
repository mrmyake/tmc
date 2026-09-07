/**
 * Draait de ECHTE sync-kern (src/lib/access/sync-core.ts) met fakes voor
 * DB en Akiles. Bewijst: no-op zonder API-key zonder enige DB-write,
 * idempotentie over twee runs, intrekken bij opzegging, foutisolatie per
 * profiel, en de noodrem-schedules. Run: npm run test:access
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyGroupSchedules,
  ensureAccessConfig,
  groupScheduleIds,
  syncAllCore,
  syncOneCore,
} from "../../src/lib/access/sync-core";
import type {
  AccessConfigRow,
  AccessCredentialsRow,
  AccessDb,
  AccessEvent,
  AccessProfile,
  AkilesApi,
  AkilesGroupAssociation,
  AkilesPermissionRule,
  ResolvedAccessConfig,
  SyncDeps,
} from "../../src/lib/access/types";
import type { ScheduleWeekday } from "../../src/lib/access/schedule";

const NOW = new Date("2026-09-08T10:00:00.000Z");

const LIVE_OPENING_HOURS = [
  { weekday: 0, is_closed: true, opens_at: null, closes_at: null },
  { weekday: 1, is_closed: false, opens_at: "07:00:00", closes_at: "21:00:00" },
  { weekday: 2, is_closed: false, opens_at: "07:00:00", closes_at: "21:00:00" },
  { weekday: 3, is_closed: false, opens_at: "07:00:00", closes_at: "21:00:00" },
  { weekday: 4, is_closed: false, opens_at: "07:00:00", closes_at: "21:00:00" },
  { weekday: 5, is_closed: false, opens_at: "07:00:00", closes_at: "21:00:00" },
  { weekday: 6, is_closed: false, opens_at: "08:00:00", closes_at: "14:00:00" },
];

// ---------------------------------------------------------------------------
// Fake DB
// ---------------------------------------------------------------------------

class FakeDb implements AccessDb {
  config: AccessConfigRow | null = {
    lockdown: false,
    schedule_standard_id: null,
    schedule_extended_id: null,
    schedule_closed_id: null,
    schedule_staff_id: null,
    group_standard_id: null,
    group_extended_id: null,
    group_staff_id: null,
  };
  profiles = new Map<string, AccessProfile>();
  credentials = new Map<string, AccessCredentialsRow>();
  writes = 0;
  reads = 0;
  openingHours = LIVE_OPENING_HOURS;

  async getConfig() {
    this.reads++;
    return this.config ? { ...this.config } : null;
  }
  async saveConfig(patch: Partial<AccessConfigRow>) {
    this.writes++;
    this.config = { ...(this.config as AccessConfigRow), ...patch };
  }
  async getOpeningHours() {
    this.reads++;
    return this.openingHours;
  }
  async getProfile(profileId: string) {
    this.reads++;
    const p = this.profiles.get(profileId);
    return p ? { ...p, memberships: p.memberships.map((m) => ({ ...m })) } : null;
  }
  async listSyncCandidateProfileIds() {
    this.reads++;
    const ids = new Set<string>();
    for (const [id, p] of this.profiles) {
      if (p.role === "trainer" || p.role === "admin" || p.memberships.length > 0) ids.add(id);
    }
    for (const id of this.credentials.keys()) ids.add(id);
    return [...ids].sort();
  }
  async getCredentials(profileId: string) {
    this.reads++;
    const c = this.credentials.get(profileId);
    return c ? { ...c } : null;
  }
  async upsertCredentials(row: Pick<AccessCredentialsRow, "profile_id"> & Partial<AccessCredentialsRow>) {
    this.writes++;
    const existing: AccessCredentialsRow = this.credentials.get(row.profile_id) ?? {
      profile_id: row.profile_id,
      akiles_member_id: null,
      akiles_pin_id: null,
      akiles_magic_link_id: null,
      access_group: null,
      access_ends_at: null,
      last_synced_at: null,
      last_error: null,
    };
    this.credentials.set(row.profile_id, { ...existing, ...row });
  }
}

// ---------------------------------------------------------------------------
// Fake Akiles
// ---------------------------------------------------------------------------

interface FakeMember {
  id: string;
  name: string;
  ends_at: string | null;
  metadata: Record<string, string>;
  pins: Map<string, string>;
  magicLinks: Set<string>;
  associations: Map<string, AkilesGroupAssociation>;
}

class NotFound extends Error {
  status = 404;
}

class FakeAkiles implements AkilesApi {
  schedules = new Map<string, { name: string; weekdays: ScheduleWeekday[] }>();
  groups = new Map<string, { name: string; permissions: AkilesPermissionRule[] }>();
  members = new Map<string, FakeMember>();
  calls: string[] = [];
  /** profileId -> Error om te gooien bij createPin (foutisolatie-test). */
  failPinFor = new Set<string>();
  private seq = 0;

  private nextId(prefix: string) {
    this.seq++;
    return `${prefix}_${this.seq}`;
  }
  private member(id: string): FakeMember {
    const m = this.members.get(id);
    if (!m) throw new NotFound(`member ${id}`);
    return m;
  }

  async createSchedule(body: { name: string; weekdays: ScheduleWeekday[] }) {
    this.calls.push("createSchedule");
    const id = this.nextId("sch");
    this.schedules.set(id, structuredClone(body));
    return { id };
  }
  async editSchedule(id: string, body: { name: string; weekdays: ScheduleWeekday[] }) {
    this.calls.push("editSchedule");
    if (!this.schedules.has(id)) throw new NotFound(`schedule ${id}`);
    this.schedules.set(id, structuredClone(body));
    return { id };
  }
  async createMemberGroup(body: { name: string; permissions: AkilesPermissionRule[] }) {
    this.calls.push("createMemberGroup");
    const id = this.nextId("mg");
    this.groups.set(id, structuredClone(body));
    return { id };
  }
  async editMemberGroup(id: string, body: { name: string; permissions: AkilesPermissionRule[] }) {
    this.calls.push("editMemberGroup");
    if (!this.groups.has(id)) throw new NotFound(`group ${id}`);
    this.groups.set(id, structuredClone(body));
    return { id };
  }
  async createMember(body: { name: string; starts_at: string | null; ends_at: string | null; metadata: Record<string, string> }) {
    this.calls.push("createMember");
    const id = this.nextId("mem");
    this.members.set(id, {
      id,
      name: body.name,
      ends_at: body.ends_at,
      metadata: body.metadata,
      pins: new Map(),
      magicLinks: new Set(),
      associations: new Map(),
    });
    return { id };
  }
  async editMember(id: string, body: { name?: string; ends_at?: string | null }) {
    this.calls.push("editMember");
    const m = this.member(id);
    if (body.name !== undefined) m.name = body.name;
    if (body.ends_at !== undefined) m.ends_at = body.ends_at;
    return { id };
  }
  async createPin(memberId: string, body: { length: number }) {
    this.calls.push("createPin");
    const m = this.member(memberId);
    if (this.failPinFor.has(m.metadata.profile_id)) throw new Error("akiles 500 on pin");
    assert.equal(body.length, 6, "PIN altijd met length 6, nooit een eigen waarde");
    const id = this.nextId("pin");
    m.pins.set(id, String(100000 + this.seq));
    return { id };
  }
  async deletePin(memberId: string, pinId: string) {
    this.calls.push("deletePin");
    const m = this.member(memberId);
    if (!m.pins.delete(pinId)) throw new NotFound(`pin ${pinId}`);
  }
  async revealPin(memberId: string, pinId: string) {
    this.calls.push("revealPin");
    const pin = this.member(memberId).pins.get(pinId);
    if (!pin) throw new NotFound(`pin ${pinId}`);
    return { pin };
  }
  async createMagicLink(memberId: string) {
    this.calls.push("createMagicLink");
    const id = this.nextId("ml");
    this.member(memberId).magicLinks.add(id);
    return { id };
  }
  async revealMagicLink(memberId: string, magicLinkId: string) {
    this.calls.push("revealMagicLink");
    if (!this.member(memberId).magicLinks.has(magicLinkId)) throw new NotFound("ml");
    return { link: `https://link.akiles.app/#${magicLinkId}` };
  }
  async listGroupAssociations(memberId: string) {
    this.calls.push("listGroupAssociations");
    return [...this.member(memberId).associations.values()].map((a) => ({ ...a }));
  }
  async createGroupAssociation(memberId: string, body: { member_group_id: string }) {
    this.calls.push("createGroupAssociation");
    const id = this.nextId("mga");
    this.member(memberId).associations.set(id, { id, member_group_id: body.member_group_id });
    return { id };
  }
  async deleteGroupAssociation(memberId: string, associationId: string) {
    this.calls.push("deleteGroupAssociation");
    this.member(memberId).associations.delete(associationId);
  }
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function makeDeps(options: { akiles: FakeAkiles | null; now?: Date }) {
  const db = new FakeDb();
  const events: AccessEvent[] = [];
  const logs: string[] = [];
  const deps: SyncDeps = {
    db,
    akiles: options.akiles,
    emit: async (e) => {
      events.push(e);
    },
    now: () => options.now ?? NOW,
    log: {
      info: (m) => logs.push(`info:${m}`),
      error: (m) => logs.push(`error:${m}`),
    },
  };
  return { deps, db, events, logs };
}

function profile(
  id: string,
  role: string,
  memberships: AccessProfile["memberships"],
): AccessProfile {
  return {
    id,
    first_name: "Test",
    last_name: id,
    role,
    is_test: true,
    memberships,
  };
}

const ACTIVE = {
  plan_type: "all_inclusive",
  status: "active",
  extended_access: false,
  cancellation_effective_date: null,
  pause_effective_date: null,
};

function snapshot(db: FakeDb, akiles: FakeAkiles) {
  const creds = [...db.credentials.values()].map((c) => ({ ...c, last_synced_at: null }));
  return JSON.stringify({
    config: db.config,
    creds,
    schedules: [...akiles.schedules.entries()],
    groups: [...akiles.groups.entries()],
    members: [...akiles.members.values()].map((m) => ({
      id: m.id,
      name: m.name,
      ends_at: m.ends_at,
      pins: [...m.pins.keys()],
      magicLinks: [...m.magicLinks],
      associations: [...m.associations.values()],
    })),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("zonder AKILES_API_KEY: schone no-op, geen enkele DB-read of -write, een logregel", async () => {
  const { deps, db, events, logs } = makeDeps({ akiles: null });
  db.profiles.set("p1", profile("p1", "member", [ACTIVE]));

  const all = await syncAllCore(deps);
  assert.deepEqual(all, { ok: true, skipped: true, processed: 0, failed: 0, failures: [] });

  const one = await syncOneCore(deps, "p1");
  assert.equal(one.ok, true);
  assert.equal(one.outcome, "noop");

  assert.equal(db.reads, 0, "geen reads");
  assert.equal(db.writes, 0, "geen writes");
  assert.equal(db.credentials.size, 0);
  assert.equal(events.length, 0);
  assert.equal(logs.filter((l) => l.includes("AKILES_API_KEY ontbreekt")).length, 2, "een keer per run");
});

test("eerste run provisiont config en member; tweede run is identiek en maakt niets nieuws aan", async () => {
  const akiles = new FakeAkiles();
  const { deps, db, events } = makeDeps({ akiles });
  db.profiles.set("member1", profile("member1", "member", [ACTIVE]));
  db.profiles.set("ext1", profile("ext1", "member", [{ ...ACTIVE, extended_access: true }]));
  db.profiles.set("staff1", profile("staff1", "trainer", []));
  db.profiles.set("cancelled1", profile("cancelled1", "member", [{ ...ACTIVE, status: "cancelled" }]));

  const first = await syncAllCore(deps);
  assert.equal(first.ok, true);
  assert.equal(first.failed, 0);
  assert.equal(first.processed, 4, "elke profiel met een membership-rij is kandidaat; cancelled1 is een noop");

  // Config: vier schedules, drie groepen, ids teruggeschreven.
  const cfg = db.config as AccessConfigRow;
  assert.equal(akiles.schedules.size, 4);
  assert.equal(akiles.groups.size, 3);
  for (const key of [
    "schedule_standard_id",
    "schedule_extended_id",
    "schedule_closed_id",
    "schedule_staff_id",
    "group_standard_id",
    "group_extended_id",
    "group_staff_id",
  ] as const) {
    assert.ok(cfg[key], key);
  }
  const standard = akiles.schedules.get(cfg.schedule_standard_id as string);
  assert.deepEqual(standard?.weekdays[0].ranges, [{ start: 25_200, end: 75_600 }]);
  assert.deepEqual(standard?.weekdays[5].ranges, [{ start: 28_800, end: 50_400 }]);
  assert.deepEqual(standard?.weekdays[6].ranges, []);
  const extendedGroup = akiles.groups.get(cfg.group_extended_id as string);
  assert.deepEqual(extendedGroup?.permissions, [
    {
      schedule_id: cfg.schedule_extended_id,
      access_methods: { online: false, bluetooth: false, mobile_nfc: true, pin: true, card: false },
    },
  ]);

  // Members: drie, elk met een PIN, een magic link en precies een associatie.
  assert.equal(akiles.members.size, 3);
  const credMember = db.credentials.get("member1") as AccessCredentialsRow;
  assert.equal(credMember.access_group, "standard");
  assert.equal(credMember.access_ends_at, "2026-09-15T10:00:00.000Z", "rollend venster: nu + 7 dagen");
  assert.equal(credMember.last_error, null);
  const akMember = akiles.members.get(credMember.akiles_member_id as string) as FakeMember;
  assert.equal(akMember.pins.size, 1);
  assert.ok(akMember.pins.has(credMember.akiles_pin_id as string));
  assert.equal(akMember.magicLinks.size, 1);
  assert.equal(akMember.associations.size, 1);
  assert.equal([...akMember.associations.values()][0].member_group_id, cfg.group_standard_id);
  assert.equal(akMember.metadata.profile_id, "member1");

  assert.equal(db.credentials.get("ext1")?.access_group, "extended");
  assert.equal(db.credentials.get("staff1")?.access_group, "staff");
  const staffMember = akiles.members.get(db.credentials.get("staff1")?.akiles_member_id as string) as FakeMember;
  assert.equal([...staffMember.associations.values()][0].member_group_id, cfg.group_staff_id);

  assert.equal(events.filter((e) => e.type === "access.granted").length, 3);
  assert.equal(events.filter((e) => e.type === "access.revoked").length, 0);

  // Tweede run: zelfde invoer, zelfde uitkomst, geen creates.
  const before = snapshot(db, akiles);
  akiles.calls = [];
  events.length = 0;
  const second = await syncAllCore(deps);
  assert.equal(second.ok, true);
  assert.equal(second.processed, 4);
  assert.equal(second.failed, 0);
  assert.equal(snapshot(db, akiles), before, "identieke toestand");
  const creates = akiles.calls.filter((c) => c.startsWith("create"));
  assert.deepEqual(creates, [], "geen enkele create in de tweede run");
  assert.equal(events.length, 0, "geen nieuwe events zonder overgang");
  assert.ok(akiles.calls.includes("editSchedule"), "schedules worden wel bijgepatcht");
});

test("gewijzigde openingstijd komt de volgende run door in het standaardschedule", async () => {
  const akiles = new FakeAkiles();
  const { deps, db } = makeDeps({ akiles });
  await syncAllCore(deps);
  db.openingHours = LIVE_OPENING_HOURS.map((r) =>
    r.weekday === 6 ? { ...r, opens_at: "09:00:00", closes_at: "13:00:00" } : r,
  );
  await syncAllCore(deps);
  const cfg = db.config as AccessConfigRow;
  const standard = akiles.schedules.get(cfg.schedule_standard_id as string);
  assert.deepEqual(standard?.weekdays[5].ranges, [{ start: 32_400, end: 46_800 }]);
  assert.equal(akiles.schedules.size, 4, "geen nieuw schedule, bestaand gepatcht");
});

test("rollend venster schuift elke run op", async () => {
  const akiles = new FakeAkiles();
  let now = NOW;
  const { deps, db } = makeDeps({ akiles });
  deps.now = () => now;
  db.profiles.set("m", profile("m", "member", [ACTIVE]));
  await syncAllCore(deps);
  assert.equal(db.credentials.get("m")?.access_ends_at, "2026-09-15T10:00:00.000Z");
  now = new Date("2026-09-09T02:15:00.000Z");
  await syncAllCore(deps);
  assert.equal(db.credentials.get("m")?.access_ends_at, "2026-09-16T02:15:00.000Z");
  const member = akiles.members.get(db.credentials.get("m")?.akiles_member_id as string);
  assert.equal(member?.ends_at, "2026-09-16T02:15:00.000Z");
});

test("harde datum wint: opzegging zet ends_at op de effectieve datum, niet op het rollende venster", async () => {
  const akiles = new FakeAkiles();
  const { deps, db } = makeDeps({ akiles });
  db.profiles.set("c", profile("c", "member", [
    { ...ACTIVE, status: "cancellation_requested", cancellation_effective_date: "2026-10-06" },
  ]));
  await syncAllCore(deps);
  assert.equal(db.credentials.get("c")?.access_ends_at, "2026-10-06T22:00:00.000Z");
});

test("opzegging effectief: ends_at in het verleden, PIN weg, member-id blijft, event access.revoked", async () => {
  const akiles = new FakeAkiles();
  const { deps, db, events } = makeDeps({ akiles });
  db.profiles.set("m", profile("m", "member", [ACTIVE]));
  await syncAllCore(deps);
  const beforeCred = db.credentials.get("m") as AccessCredentialsRow;
  const memberId = beforeCred.akiles_member_id as string;
  const pinId = beforeCred.akiles_pin_id as string;
  const linkId = beforeCred.akiles_magic_link_id as string;

  db.profiles.set("m", profile("m", "member", [{ ...ACTIVE, status: "cancelled" }]));
  events.length = 0;
  const run = await syncAllCore(deps);
  assert.equal(run.processed, 1, "profiel met credentials blijft kandidaat");

  const after = db.credentials.get("m") as AccessCredentialsRow;
  assert.equal(after.akiles_member_id, memberId, "member-id blijft als spoor");
  assert.equal(after.akiles_pin_id, null);
  assert.equal(after.akiles_magic_link_id, linkId, "magic link blijft");
  assert.equal(after.access_group, null);
  assert.ok(new Date(after.access_ends_at as string) < NOW, "ends_at in het verleden");
  const member = akiles.members.get(memberId) as FakeMember;
  assert.equal(member.pins.has(pinId), false, "PIN verwijderd in Akiles");
  assert.ok(new Date(member.ends_at as string) < NOW);
  assert.deepEqual(events.map((e) => e.type), ["access.revoked"]);

  // Derde run: al dicht, niets verandert, geen nieuw event.
  const snap = snapshot(db, akiles);
  events.length = 0;
  akiles.calls = [];
  await syncAllCore(deps);
  assert.equal(snapshot(db, akiles), snap);
  assert.equal(events.length, 0);
  assert.equal(akiles.calls.filter((c) => c === "deletePin" || c === "editMember").length, 0);

  // Heraanmelding: zelfde member, nieuwe PIN, event access.granted.
  db.profiles.set("m", profile("m", "member", [ACTIVE]));
  events.length = 0;
  await syncAllCore(deps);
  const again = db.credentials.get("m") as AccessCredentialsRow;
  assert.equal(again.akiles_member_id, memberId);
  assert.ok(again.akiles_pin_id && again.akiles_pin_id !== pinId, "nieuwe PIN");
  assert.equal(again.akiles_magic_link_id, linkId);
  assert.deepEqual(events.map((e) => e.type), ["access.granted"]);
});

test("verwijderd profiel met credentials wordt dichtgezet", async () => {
  const akiles = new FakeAkiles();
  const { deps, db, events } = makeDeps({ akiles });
  db.profiles.set("gone", profile("gone", "member", [ACTIVE]));
  await syncAllCore(deps);
  db.profiles.delete("gone");
  events.length = 0;
  await syncAllCore(deps);
  const cred = db.credentials.get("gone") as AccessCredentialsRow;
  assert.equal(cred.akiles_pin_id, null);
  assert.ok(new Date(cred.access_ends_at as string) < NOW);
  assert.deepEqual(events.map((e) => e.type), ["access.revoked"]);
});

test("groepswissel: associatie wordt vervangen, nooit gestapeld", async () => {
  const akiles = new FakeAkiles();
  const { deps, db } = makeDeps({ akiles });
  db.profiles.set("u", profile("u", "member", [ACTIVE]));
  await syncAllCore(deps);
  db.profiles.set("u", profile("u", "member", [{ ...ACTIVE, extended_access: true }]));
  await syncAllCore(deps);
  const cfg = db.config as AccessConfigRow;
  const member = akiles.members.get(db.credentials.get("u")?.akiles_member_id as string) as FakeMember;
  assert.equal(member.associations.size, 1);
  assert.equal([...member.associations.values()][0].member_group_id, cfg.group_extended_id);
  assert.equal(db.credentials.get("u")?.access_group, "extended");
});

test("een mislukt profiel stopt de run niet en landt in last_error", async () => {
  const akiles = new FakeAkiles();
  const { deps, db, events } = makeDeps({ akiles });
  db.profiles.set("a", profile("a", "member", [ACTIVE]));
  db.profiles.set("b", profile("b", "member", [ACTIVE]));
  db.profiles.set("c", profile("c", "member", [ACTIVE]));
  akiles.failPinFor.add("b");

  const run = await syncAllCore(deps);
  assert.equal(run.ok, true);
  assert.equal(run.processed, 2);
  assert.equal(run.failed, 1);
  assert.equal(run.failures[0].profileId, "b");
  assert.match(db.credentials.get("b")?.last_error ?? "", /akiles 500 on pin/);
  assert.ok(db.credentials.get("b")?.akiles_member_id, "member-id is al bewaard, geen wees bij herhaling");
  assert.equal(db.credentials.get("b")?.akiles_pin_id, null);
  assert.equal(db.credentials.get("a")?.last_error, null);
  assert.equal(db.credentials.get("c")?.last_error, null);
  assert.equal(events.filter((e) => e.type === "access.granted").length, 2);

  // Herstel: de volgende run maakt geen tweede member aan.
  akiles.failPinFor.clear();
  const memberCount = akiles.members.size;
  const fixed = await syncAllCore(deps);
  assert.equal(fixed.failed, 0);
  assert.equal(akiles.members.size, memberCount);
  assert.equal(db.credentials.get("b")?.last_error, null);
  assert.ok(db.credentials.get("b")?.akiles_pin_id);
});

test("noodrem: beide ledengroepen naar gesloten, staf blijft; sync respecteert de vlag", async () => {
  const akiles = new FakeAkiles();
  const { deps, db } = makeDeps({ akiles });
  const cfg = await ensureAccessConfig(deps, akiles);

  const locked: ResolvedAccessConfig = { ...cfg, lockdown: true };
  assert.deepEqual(groupScheduleIds(locked), {
    standard: cfg.schedule_closed_id,
    extended: cfg.schedule_closed_id,
    staff: cfg.schedule_staff_id,
  });
  await applyGroupSchedules(akiles, locked);
  assert.equal(akiles.groups.get(cfg.group_standard_id)?.permissions[0].schedule_id, cfg.schedule_closed_id);
  assert.equal(akiles.groups.get(cfg.group_extended_id)?.permissions[0].schedule_id, cfg.schedule_closed_id);
  assert.equal(akiles.groups.get(cfg.group_staff_id)?.permissions[0].schedule_id, cfg.schedule_staff_id);

  // De nachtelijke sync draait de noodrem niet terug zolang de vlag staat.
  db.config = { ...(db.config as AccessConfigRow), lockdown: true };
  await syncAllCore(deps);
  assert.equal(akiles.groups.get(cfg.group_standard_id)?.permissions[0].schedule_id, cfg.schedule_closed_id);

  // Vlag eraf: eigen schedules terug.
  db.config = { ...(db.config as AccessConfigRow), lockdown: false };
  await syncAllCore(deps);
  assert.equal(akiles.groups.get(cfg.group_standard_id)?.permissions[0].schedule_id, cfg.schedule_standard_id);
  assert.equal(akiles.groups.get(cfg.group_extended_id)?.permissions[0].schedule_id, cfg.schedule_extended_id);
});

test("noodrem overleeft twee opeenvolgende cron-runs; alleen de admin-action zet hem terug", async () => {
  const akiles = new FakeAkiles();
  const { deps, db } = makeDeps({ akiles });
  db.profiles.set("m", profile("m", "member", [ACTIVE]));
  await syncAllCore(deps);
  const cfg = db.config as AccessConfigRow;

  // Admin-action: vlag aan en groepen direct naar Gesloten.
  db.config = { ...cfg, lockdown: true };
  await applyGroupSchedules(akiles, { ...(db.config as ResolvedAccessConfig) });

  for (let run = 1; run <= 2; run++) {
    const result = await syncAllCore(deps);
    assert.equal(result.ok, true, `run ${run}`);
    assert.equal(akiles.groups.get(cfg.group_standard_id as string)?.permissions[0].schedule_id, cfg.schedule_closed_id, `standard run ${run}`);
    assert.equal(akiles.groups.get(cfg.group_extended_id as string)?.permissions[0].schedule_id, cfg.schedule_closed_id, `extended run ${run}`);
    assert.equal(akiles.groups.get(cfg.group_staff_id as string)?.permissions[0].schedule_id, cfg.schedule_staff_id, `staff run ${run}`);
  }
  // Schedules zelf worden wel bijgewerkt tijdens de noodrem.
  db.openingHours = LIVE_OPENING_HOURS.map((r) => (r.weekday === 1 ? { ...r, opens_at: "06:30:00" } : r));
  await syncAllCore(deps);
  assert.deepEqual(akiles.schedules.get(cfg.schedule_standard_id as string)?.weekdays[0].ranges, [{ start: 23_400, end: 75_600 }]);
  assert.equal(akiles.groups.get(cfg.group_standard_id as string)?.permissions[0].schedule_id, cfg.schedule_closed_id, "koppeling blijft Gesloten");
  assert.equal((db.config as AccessConfigRow).lockdown, true, "de sync raakt de vlag niet aan");

  // Enige weg terug: de vlag uit via de admin-action, daarna herstelt de sync de koppeling.
  db.config = { ...(db.config as AccessConfigRow), lockdown: false };
  await applyGroupSchedules(akiles, { ...(db.config as ResolvedAccessConfig) });
  await syncAllCore(deps);
  assert.equal(akiles.groups.get(cfg.group_standard_id as string)?.permissions[0].schedule_id, cfg.schedule_standard_id);
});

test("opgezegd abonnement plus actieve rittenkaart: toegang wordt ingetrokken en blijft dicht", async () => {
  const akiles = new FakeAkiles();
  const { deps, db, events } = makeDeps({ akiles });
  db.profiles.set("r", profile("r", "member", [ACTIVE]));
  await syncAllCore(deps);
  assert.ok(db.credentials.get("r")?.akiles_pin_id);

  db.profiles.set("r", profile("r", "member", [
    { ...ACTIVE, status: "cancellation_requested", cancellation_effective_date: "2026-09-01" },
    { ...ACTIVE, plan_type: "ten_ride_card", status: "active" },
  ]));
  events.length = 0;
  await syncAllCore(deps);
  const cred = db.credentials.get("r") as AccessCredentialsRow;
  assert.equal(cred.akiles_pin_id, null);
  assert.ok(new Date(cred.access_ends_at as string) < NOW);
  assert.deepEqual(events.map((e) => e.type), ["access.revoked"]);

  // Volgende nacht: de rittenkaart-rij mag het venster niet heropenen.
  events.length = 0;
  await syncAllCore(deps);
  assert.equal(db.credentials.get("r")?.akiles_pin_id, null);
  assert.equal(events.length, 0);
});

test("in Akiles verwijderd schedule of member wordt opnieuw aangemaakt", async () => {
  const akiles = new FakeAkiles();
  const { deps, db } = makeDeps({ akiles });
  db.profiles.set("m", profile("m", "member", [ACTIVE]));
  await syncAllCore(deps);
  const cfgBefore = db.config as AccessConfigRow;
  const memberBefore = db.credentials.get("m")?.akiles_member_id as string;

  akiles.schedules.delete(cfgBefore.schedule_standard_id as string);
  akiles.members.delete(memberBefore);
  const run = await syncAllCore(deps);
  assert.equal(run.failed, 0);
  const cfgAfter = db.config as AccessConfigRow;
  assert.notEqual(cfgAfter.schedule_standard_id, cfgBefore.schedule_standard_id);
  assert.ok(akiles.schedules.has(cfgAfter.schedule_standard_id as string));
  const memberAfter = db.credentials.get("m")?.akiles_member_id as string;
  assert.notEqual(memberAfter, memberBefore);
  assert.ok(akiles.members.get(memberAfter)?.pins.size === 1);
});

test("ontbrekende access_config-rij: run faalt luid, geen profielen aangeraakt", async () => {
  const akiles = new FakeAkiles();
  const { deps, db } = makeDeps({ akiles });
  db.config = null;
  db.profiles.set("m", profile("m", "member", [ACTIVE]));
  const run = await syncAllCore(deps);
  assert.equal(run.ok, false);
  assert.match(run.error ?? "", /access_config ontbreekt/);
  assert.equal(akiles.members.size, 0);
});
