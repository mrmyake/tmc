import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LAST_MINUTE_WINDOW_MS,
  isUsableEmail,
  kindLabel,
  lastMinuteDecision,
  runLastMinuteAlert,
  type LastMinuteDeps,
  type LastMinuteEvent,
  type LastMinuteInput,
  type LastMinuteSource,
  type Recipient,
  type SessionRow,
} from "../../src/lib/alerts/last-minute-core.ts";

// Draait via `npm run test:last-minute-alerts` (node:test met de ts-loader,
// zelfde opzet als scripts/orders). Geen netwerk: alle afhankelijkheden
// zijn nep en registreren wat de kern doet.

const NOW = new Date("2026-10-22T15:00:00Z");
const TRAINER: Recipient = { email: "trainer@example.com", firstName: "Noor" };
const HEAD: Recipient = { email: "marlon@example.com", firstName: "Marlon" };
const ADMINS: Recipient[] = [
  { email: "marlon@example.com", firstName: "Marlon" },
  { email: "ilja@example.com", firstName: "Ilja" },
];

function sessionAt(startOffsetMs: number, overrides: Partial<SessionRow> = {}): SessionRow {
  const start = new Date(NOW.getTime() + startOffsetMs);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    id: "session-1",
    pillar: "yoga_mobility",
    status: "scheduled",
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    className: "Yoga & Mobility",
    trainer: { profileId: "trainer-profile", isActive: true, displayName: "Noor" },
    ...overrides,
  };
}

interface Recorded {
  sends: Array<{ to: string; toName?: string; subject: string; props: Record<string, unknown> }>;
  events: LastMinuteEvent[];
  stamps: string[];
  warnings: string[];
  errors: string[];
}

function makeDeps(args: {
  session: SessionRow | null;
  vercelEnv?: string;
  redirectEmail?: string;
  participant?: { name: string; isTest: boolean; hostFirstName?: string | null } | null;
  trainerRecipient?: Recipient | null;
  headRecipient?: Recipient | null;
  admins?: Recipient[];
  total?: number;
  sendOk?: boolean;
  stamped?: Set<string>;
}): { deps: LastMinuteDeps; rec: Recorded } {
  const rec: Recorded = { sends: [], events: [], stamps: [], warnings: [], errors: [] };
  const stamped = args.stamped ?? new Set<string>();
  const deps: LastMinuteDeps = {
    now: () => NOW,
    env: {
      // Expliciet undefined (lokaal, geen Vercel) moet als niet-productie tellen.
      vercelEnv: "vercelEnv" in args ? args.vercelEnv : "production",
      redirectEmail: args.redirectEmail,
      siteUrl: "https://www.themovementclub.nl",
    },
    loadSession: async () => args.session,
    loadParticipant: async () =>
      args.participant === undefined ? { name: "Sanne de Vries", isTest: false } : args.participant,
    stampAlerted: async (source: LastMinuteSource, id: string) => {
      const key = `${source}:${id}`;
      if (stamped.has(key)) return "already";
      stamped.add(key);
      rec.stamps.push(key);
      return "stamped";
    },
    countParticipants: async () => args.total ?? 4,
    loadProfileRecipient: async () => (args.trainerRecipient === undefined ? TRAINER : args.trainerRecipient),
    loadHeadTrainerRecipient: async () => (args.headRecipient === undefined ? HEAD : args.headRecipient),
    loadAdminRecipients: async () => args.admins ?? ADMINS,
    send: async (s) => {
      rec.sends.push({ ...s, props: s.props as unknown as Record<string, unknown> });
      return args.sendOk ?? true;
    },
    emit: async (e) => {
      rec.events.push(e);
      return true;
    },
    log: {
      info: () => {},
      warn: (msg: unknown) => void rec.warnings.push(String(msg)),
      error: (msg: unknown) => void rec.errors.push(String(msg)),
    },
  };
  return { deps, rec };
}

const INPUT: LastMinuteInput = { sessionId: "session-1", source: "member", participantId: "booking-1" };
const HOUR = 60 * 60 * 1000;

test("lastMinuteDecision: grens is strikt minder dan drie uur, en de les mag niet begonnen zijn", () => {
  const start = new Date(NOW.getTime() + LAST_MINUTE_WINDOW_MS);
  assert.equal(lastMinuteDecision(start, NOW), "before_window", "precies drie uur is niet last minute");
  assert.equal(lastMinuteDecision(new Date(start.getTime() - 1000), NOW), "last_minute", "net binnen");
  assert.equal(lastMinuteDecision(new Date(start.getTime() + 1000), NOW), "before_window", "net buiten");
  assert.equal(lastMinuteDecision(NOW, NOW), "session_started", "start is nu");
  assert.equal(lastMinuteDecision(new Date(NOW.getTime() - 1000), NOW), "session_started", "al begonnen");
});

test("net binnen de grens: mail naar de trainer, stempel en event", async () => {
  const { deps, rec } = makeDeps({ session: sessionAt(3 * HOUR - 60 * 1000) });
  const result = await runLastMinuteAlert(INPUT, deps);
  assert.equal(result.outcome, "sent");
  assert.deepEqual(rec.stamps, ["member:booking-1"]);
  assert.equal(rec.sends.length, 1);
  assert.equal(rec.sends[0].to, "trainer@example.com");
  assert.equal(rec.sends[0].toName, "Noor");
  assert.match(rec.sends[0].subject, /^Last minute inschrijving: Yoga & Mobility om \d\d:\d\d$/);
  assert.doesNotMatch(rec.sends[0].subject, /^\[TEST\]/);
  assert.equal(rec.sends[0].props.participantName, "Sanne de Vries");
  assert.equal(rec.sends[0].props.kindLabel, "lid");
  assert.equal(rec.sends[0].props.totalParticipants, 4);
  assert.equal(rec.sends[0].props.originalRecipientLabel, null);
  assert.equal(
    rec.sends[0].props.participantsUrl,
    "https://www.themovementclub.nl/app/trainer/sessies/session-1",
  );
  assert.equal(rec.events.length, 1);
  assert.equal(rec.events[0].type, "trainer.last_minute_alert_sent");
  assert.equal(rec.events[0].subjectId, "session-1");
  assert.equal(rec.events[0].payload.recipient_kind, "trainer");
  assert.equal(rec.events[0].payload.delivered, 1);
  assert.equal(rec.events[0].payload.source, "member");
});

test("net buiten de grens: niets gestempeld, niets verstuurd", async () => {
  for (const offset of [3 * HOUR, 3 * HOUR + 60 * 1000, 26 * HOUR]) {
    const { deps, rec } = makeDeps({ session: sessionAt(offset) });
    const result = await runLastMinuteAlert(INPUT, deps);
    assert.deepEqual(result, { outcome: "skipped", reason: "before_window" });
    assert.equal(rec.stamps.length, 0);
    assert.equal(rec.sends.length, 0);
    assert.equal(rec.events.length, 0);
  }
});

test("les al begonnen of voorbij: overgeslagen", async () => {
  for (const offset of [0, -5 * 60 * 1000, -2 * HOUR]) {
    const { deps, rec } = makeDeps({ session: sessionAt(offset) });
    const result = await runLastMinuteAlert(INPUT, deps);
    assert.deepEqual(result, { outcome: "skipped", reason: "session_started" });
    assert.equal(rec.sends.length, 0);
  }
});

test("vrij trainen en niet-geplande sessies krijgen geen melding", async () => {
  const vt = makeDeps({ session: sessionAt(HOUR, { pillar: "vrij_trainen" }) });
  assert.deepEqual(await runLastMinuteAlert(INPUT, vt.deps), { outcome: "skipped", reason: "vrij_trainen" });
  const cancelled = makeDeps({ session: sessionAt(HOUR, { status: "cancelled" }) });
  assert.deepEqual(await runLastMinuteAlert(INPUT, cancelled.deps), {
    outcome: "skipped",
    reason: "session_not_scheduled",
  });
  const missing = makeDeps({ session: null });
  assert.deepEqual(await runLastMinuteAlert(INPUT, missing.deps), {
    outcome: "skipped",
    reason: "session_not_found",
  });
  assert.equal(vt.rec.sends.length + cancelled.rec.sends.length + missing.rec.sends.length, 0);
});

test("idempotent: een tweede aanroep voor dezelfde inschrijving stuurt niets meer", async () => {
  const stamped = new Set<string>();
  const first = makeDeps({ session: sessionAt(HOUR), stamped });
  const second = makeDeps({ session: sessionAt(HOUR), stamped });
  assert.equal((await runLastMinuteAlert(INPUT, first.deps)).outcome, "sent");
  assert.deepEqual(await runLastMinuteAlert(INPUT, second.deps), {
    outcome: "skipped",
    reason: "already_alerted",
  });
  assert.equal(second.rec.sends.length, 0);
  assert.equal(second.rec.events.length, 0);
  // Een andere inschrijving op dezelfde les krijgt wel weer een mail.
  const third = makeDeps({ session: sessionAt(HOUR), stamped });
  assert.equal(
    (await runLastMinuteAlert({ ...INPUT, participantId: "booking-2" }, third.deps)).outcome,
    "sent",
  );
});

test("stempel mislukt: geen mail, geen event", async () => {
  const { deps, rec } = makeDeps({ session: sessionAt(HOUR) });
  deps.stampAlerted = async () => "error";
  assert.deepEqual(await runLastMinuteAlert(INPUT, deps), { outcome: "skipped", reason: "stamp_failed" });
  assert.equal(rec.sends.length, 0);
  assert.equal(rec.events.length, 0);
});

test("fallback: inactieve trainer gaat naar de head trainer", async () => {
  const { deps, rec } = makeDeps({
    session: sessionAt(HOUR, { trainer: { profileId: "trainer-profile", isActive: false, displayName: "Noor" } }),
  });
  const result = await runLastMinuteAlert(INPUT, deps);
  assert.equal(result.outcome, "sent");
  assert.equal(result.outcome === "sent" && result.recipientKind, "fallback");
  assert.deepEqual(rec.sends.map((s) => s.to), ["marlon@example.com"]);
  assert.equal(rec.events[0].payload.recipient_kind, "fallback");
});

test("fallback: onbruikbaar trainersadres gaat naar de head trainer", async () => {
  const { deps, rec } = makeDeps({
    session: sessionAt(HOUR),
    trainerRecipient: { email: "walkin-12345678@walkin.tmc.internal", firstName: "Walk" },
  });
  assert.equal((await runLastMinuteAlert(INPUT, deps)).outcome, "sent");
  assert.deepEqual(rec.sends.map((s) => s.to), ["marlon@example.com"]);
});

test("fallback: zonder head trainer naar alle admins met een bruikbaar adres", async () => {
  const { deps, rec } = makeDeps({
    session: sessionAt(HOUR, { trainer: null }),
    headRecipient: null,
    admins: [...ADMINS, { email: "", firstName: "Leeg" }],
  });
  const result = await runLastMinuteAlert(INPUT, deps);
  assert.equal(result.outcome, "sent");
  assert.deepEqual(rec.sends.map((s) => s.to).sort(), ["ilja@example.com", "marlon@example.com"]);
  assert.equal(rec.events.length, 1);
  assert.equal(rec.events[0].payload.delivered, 2);
  assert.equal(rec.events[0].payload.recipients, 2);
});

test("geen enkele bruikbare ontvanger: niet verstuurd, wel event en foutlog", async () => {
  const { deps, rec } = makeDeps({
    session: sessionAt(HOUR, { trainer: null }),
    headRecipient: null,
    admins: [],
  });
  const result = await runLastMinuteAlert(INPUT, deps);
  assert.equal(result.outcome, "not_delivered");
  assert.equal(result.outcome === "not_delivered" && result.reason, "no_recipient");
  assert.equal(rec.sends.length, 0);
  assert.equal(rec.events[0].payload.reason, "no_recipient");
  assert.equal(rec.errors.length, 1);
});

test("testboeking in productie: geen mail en geen stempel", async () => {
  const { deps, rec } = makeDeps({
    session: sessionAt(HOUR),
    participant: { name: "Test Proef", isTest: true },
  });
  assert.deepEqual(await runLastMinuteAlert({ ...INPUT, source: "trial", participantId: "trial-1" }, deps), {
    outcome: "skipped",
    reason: "test_booking",
  });
  assert.equal(rec.sends.length, 0);
  assert.equal(rec.stamps.length, 0);
});

test("buiten productie gaat alles naar het omleidingsadres, nooit naar de trainer", async () => {
  for (const vercelEnv of ["preview", "development", undefined]) {
    for (const isTest of [false, true]) {
      const { deps, rec } = makeDeps({
        session: sessionAt(HOUR),
        vercelEnv,
        redirectEmail: "redirect@example.com",
        participant: { name: "Sanne de Vries", isTest },
      });
      const result = await runLastMinuteAlert(INPUT, deps);
      assert.equal(result.outcome, "sent", `env ${vercelEnv} isTest ${isTest}`);
      assert.equal(result.outcome === "sent" && result.recipientKind, "redirect");
      assert.deepEqual(rec.sends.map((s) => s.to), ["redirect@example.com"]);
      assert.ok(!rec.sends.some((s) => s.to === TRAINER.email), "trainersadres nooit aangeschreven");
      assert.match(rec.sends[0].subject, /^\[TEST\] Last minute inschrijving: /);
      assert.equal(rec.sends[0].props.originalRecipientLabel, "trainer: trainer@example.com");
      assert.equal(rec.events[0].payload.recipient_kind, "redirect");
      assert.equal(rec.stamps.length, 1, "ook buiten productie wordt gestempeld");
    }
  }
});

test("buiten productie met fallback-ontvanger noemt de fallback in de body", async () => {
  const { deps, rec } = makeDeps({
    session: sessionAt(HOUR, { trainer: { profileId: "trainer-profile", isActive: false, displayName: "Noor" } }),
    vercelEnv: "preview",
    redirectEmail: "redirect@example.com",
  });
  assert.equal((await runLastMinuteAlert(INPUT, deps)).outcome, "sent");
  assert.equal(rec.sends[0].props.originalRecipientLabel, "fallback: marlon@example.com");
});

test("buiten productie zonder omleidingsadres: overgeslagen met waarschuwing, nooit naar de trainer", async () => {
  for (const redirectEmail of [undefined, "", "geen-adres"]) {
    const { deps, rec } = makeDeps({ session: sessionAt(HOUR), vercelEnv: "preview", redirectEmail });
    const result = await runLastMinuteAlert(INPUT, deps);
    assert.equal(result.outcome, "not_delivered");
    assert.equal(result.outcome === "not_delivered" && result.reason, "redirect_missing");
    assert.equal(rec.sends.length, 0);
    assert.equal(rec.warnings.length, 1);
    assert.match(rec.warnings[0], /LAST_MINUTE_ALERT_REDIRECT_EMAIL/);
    assert.equal(rec.events.length, 1);
    assert.equal(rec.events[0].payload.delivered, 0);
    assert.equal(rec.events[0].payload.reason, "redirect_missing");
  }
});

test("soort per bron: wachtlijst, proefles en gast van een lid", async () => {
  const cases: Array<[LastMinuteSource, { name: string; isTest: boolean; hostFirstName?: string | null }, string]> = [
    ["waitlist", { name: "Sanne de Vries", isTest: false }, "van de wachtlijst"],
    ["trial", { name: "Kim Proef", isTest: false }, "proefles"],
    ["guest", { name: "Gast Jansen", isTest: false, hostFirstName: "Sanne" }, "gast van Sanne"],
    ["guest", { name: "Gast Jansen", isTest: false, hostFirstName: null }, "gast van een lid"],
  ];
  for (const [source, participant, expected] of cases) {
    const { deps, rec } = makeDeps({ session: sessionAt(HOUR), participant, total: 6 });
    assert.equal((await runLastMinuteAlert({ ...INPUT, source, participantId: `${source}-1` }, deps)).outcome, "sent");
    assert.equal(rec.sends[0].props.kindLabel, expected);
    assert.equal(rec.sends[0].props.totalParticipants, 6);
  }
  assert.equal(kindLabel("member"), "lid");
});

test("mislukte verzending: event met delivered 0, uitkomst not_delivered", async () => {
  const { deps, rec } = makeDeps({ session: sessionAt(HOUR), sendOk: false });
  const result = await runLastMinuteAlert(INPUT, deps);
  assert.equal(result.outcome, "not_delivered");
  assert.equal(result.outcome === "not_delivered" && result.reason, "send_failed");
  assert.equal(rec.events[0].payload.delivered, 0);
  assert.equal(rec.errors.length, 1);
});

test("isUsableEmail weigert lege waarden, ongeldige adressen en interne placeholders", () => {
  assert.equal(isUsableEmail(null), false);
  assert.equal(isUsableEmail(""), false);
  assert.equal(isUsableEmail("geen-adres"), false);
  assert.equal(isUsableEmail("walkin-12345678@walkin.tmc.internal"), false);
  assert.equal(isUsableEmail(" trainer@example.com "), true);
});
