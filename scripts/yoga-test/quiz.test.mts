/**
 * Yoga-quiz (spec-yoga-test.md): puntentelling en rangschikking, voorselectie
 * en de beslislogica van /proefles/code/start.
 * Run: node --import ./scripts/ts-loader.mjs --test scripts/yoga-test/quiz.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OUTCOME_KEYS,
  QUIZ_TRIAL_CODES,
  TIE_BREAK_ORDER,
  outcomes,
  questions,
  yogaQuiz,
  type OutcomeKey,
} from "../../src/lib/yoga-test/config.ts";
import {
  bucketFor,
  chosenBucket,
  emptySchedule,
  firstName,
  formatSlot,
  parseAnswers,
  rankOutcomes,
  sortSlots,
  wantsCareNote,
  type ScheduleByOutcome,
} from "../../src/lib/yoga-test/scoring.ts";
import { amsterdamDayAndTime, pickPreselectedSessionId } from "../../src/lib/yoga-test/preselect.ts";
import { resolveQuizStart } from "../../src/lib/yoga-test/start.ts";
import { codeBookingPath, paidBookingPath } from "../../src/lib/yoga-test/links.ts";

// Roosterpunten zoals live op 2026-11-07 (day: 0 = zondag).
const LIVE: ScheduleByOutcome = {
  v: [
    { day: 1, time: "10:30", trainerFirstName: "Kim" },
    { day: 2, time: "09:00", trainerFirstName: "Monique" },
    { day: 5, time: "09:00", trainerFirstName: "Kim" },
  ],
  p: [{ day: 6, time: "09:00", trainerFirstName: "Patricia" }],
  ym: [{ day: 4, time: "19:30", trainerFirstName: "Patricia" }],
  y: [
    { day: 1, time: "19:30", trainerFirstName: "Gerrianne" },
    { day: 6, time: "10:15", trainerFirstName: "Patricia" },
  ],
  r: [{ day: 3, time: "09:00", trainerFirstName: "Bionda" }],
  n: [
    { day: 2, time: "19:30", trainerFirstName: "Constanze" },
    { day: 4, time: "09:00", trainerFirstName: "Constanze" },
  ],
};

/** Alle antwoordcombinaties van de zeven vragen die de uitslag bepalen. */
function* allAnswers(): Generator<number[]> {
  const sizes = questions.slice(0, 7).map((q) => q.options.length);
  const current = sizes.map(() => 0);
  for (;;) {
    yield [...current];
    let i = sizes.length - 1;
    while (i >= 0) {
      current[i] += 1;
      if (current[i] < sizes[i]) break;
      current[i] = 0;
      i -= 1;
    }
    if (i < 0) return;
  }
}

function winShares(schedule: ScheduleByOutcome): { wins: Record<OutcomeKey, number>; total: number } {
  const wins: Record<OutcomeKey, number> = { v: 0, p: 0, ym: 0, y: 0, r: 0, n: 0 };
  let total = 0;
  for (const answers of allAnswers()) {
    const top = rankOutcomes(answers, schedule)[0];
    if (top) wins[top.key] += 1;
    total += 1;
  }
  return { wins, total };
}

test("elke uitkomst is te bereiken en het aandeel overwinningen wordt gelogd", () => {
  const { wins, total } = winShares(LIVE);
  const shares = OUTCOME_KEYS.map((k) => `${k} ${((wins[k] / total) * 100).toFixed(1)}%`).join(", ");
  console.log(`Overwinningen over ${total} combinaties met het live rooster: ${shares}`);
  for (const key of OUTCOME_KEYS) {
    assert.ok(wins[key] > 0, `uitkomst ${key} is onbereikbaar`);
  }
  assert.equal(
    Object.values(wins).reduce((a, b) => a + b, 0),
    total,
    "elke combinatie heeft precies een uitslag",
  );
});

test("een uitkomst zonder roostertijden wordt nooit getoond; de volgende schuift op", () => {
  for (const missing of OUTCOME_KEYS) {
    const schedule: ScheduleByOutcome = { ...LIVE, [missing]: [] };
    for (const answers of allAnswers()) {
      const ranking = rankOutcomes(answers, schedule);
      assert.ok(!ranking.some((r) => r.key === missing), `${missing} staat in de ranking`);
      assert.equal(ranking.length, 5);
    }
  }
});

test("zonder enig rooster is er geen uitslag", () => {
  assert.deepEqual(rankOutcomes([0, 0, 0, 0, 0, 0, 3], emptySchedule()), []);
});

test("gelijke score: volgorde v, y, p, ym, r, n", () => {
  assert.deepEqual([...TIE_BREAK_ORDER], ["v", "y", "p", "ym", "r", "n"]);
  // Over alle combinaties: de lijst is aflopend gesorteerd en bij gelijke
  // score gaat de uitkomst die eerder in de tie-breakvolgorde staat voor.
  let checked = 0;
  for (const answers of allAnswers()) {
    const ranking = rankOutcomes(answers, LIVE);
    for (let i = 1; i < ranking.length; i++) {
      const a = ranking[i - 1];
      const b = ranking[i];
      assert.ok(a.score >= b.score);
      if (a.score === b.score) {
        assert.ok(
          TIE_BREAK_ORDER.indexOf(a.key) < TIE_BREAK_ORDER.indexOf(b.key),
          `${a.key} hoort voor ${b.key} bij gelijke score`,
        );
        checked += 1;
      }
    }
  }
  assert.ok(checked > 0, "er moet minstens een gelijkspel in de combinaties zitten");
});

test("de bucketbonus volgt het live rooster en is niet hardcoded", () => {
  // Alle antwoorden 0, tijdvraag: weekend. Alleen uitkomsten met een weekendtijd krijgen +1.
  const base = [0, 0, 0, 0, 0, 0];
  const weekend = [...base, 2];
  const none = [...base, 3];
  const scoreOf = (answers: number[], schedule: ScheduleByOutcome, key: OutcomeKey) =>
    rankOutcomes(answers, schedule).find((r) => r.key === key)!.score;
  assert.equal(scoreOf(weekend, LIVE, "p"), scoreOf(none, LIVE, "p") + 1);
  assert.equal(scoreOf(weekend, LIVE, "y"), scoreOf(none, LIVE, "y") + 1);
  assert.equal(scoreOf(weekend, LIVE, "v"), scoreOf(none, LIVE, "v"));
  // Verandert het rooster, dan verandert de bonus mee.
  const changed: ScheduleByOutcome = { ...LIVE, v: [{ day: 0, time: "10:00", trainerFirstName: "Kim" }] };
  assert.equal(scoreOf(weekend, changed, "v"), scoreOf(none, changed, "v") + 1);
});

test("tijdsbuckets: ma t/m vr voor 17:00 is dag, vanaf 17:00 avond, za en zo weekend", () => {
  assert.equal(bucketFor(1, "10:30"), "weekdag-dag");
  assert.equal(bucketFor(5, "16:59"), "weekdag-dag");
  assert.equal(bucketFor(5, "17:00"), "weekdag-avond");
  assert.equal(bucketFor(2, "19:30"), "weekdag-avond");
  assert.equal(bucketFor(6, "09:00"), "weekend");
  assert.equal(bucketFor(0, "19:30"), "weekend");
});

test("zorgvraag en tijdvraag worden uit de antwoorden gelezen", () => {
  assert.equal(chosenBucket([0, 0, 0, 0, 0, 0, 1]), "weekdag-avond");
  assert.equal(chosenBucket([0, 0, 0, 0, 0, 0, 3]), null);
  assert.equal(wantsCareNote([0, 0, 0, 0, 0, 0, 0, 1]), true);
  assert.equal(wantsCareNote([0, 0, 0, 0, 0, 0, 0, 0]), false);
  assert.equal(wantsCareNote([0, 0, 0, 0, 0, 0, 0]), false);
});

test("parseAnswers weigert ongeldige invoer", () => {
  assert.deepEqual(parseAnswers([0, 0, 0, 0, 0, 0, 0]), [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(parseAnswers([0, 0, 0, 0, 0, 0]), null);
  assert.equal(parseAnswers([0, 0, 0, 0, 0, 0, 4]), null);
  assert.equal(parseAnswers([0, 0, 0, 0, 0, 3, 0]), null);
  assert.equal(parseAnswers([0, 0, 0, 0, 0, 0, 0.5]), null);
  assert.equal(parseAnswers("0000000"), null);
  assert.equal(parseAnswers(null), null);
});

test("weergave: voornaam trainer en rooster als 'ma 10:30, met Kim'", () => {
  assert.equal(firstName("Kim Pfaff"), "Kim");
  assert.equal(firstName(null), "");
  assert.equal(formatSlot(LIVE.v[0]), "ma 10:30, met Kim");
  assert.equal(formatSlot({ day: 0, time: "09:00", trainerFirstName: "" }), "zo 09:00");
  const sorted = sortSlots([
    { day: 0, time: "09:00", trainerFirstName: "A" },
    { day: 2, time: "09:00", trainerFirstName: "B" },
    { day: 1, time: "19:30", trainerFirstName: "C" },
    { day: 1, time: "10:30", trainerFirstName: "D" },
  ]);
  assert.deepEqual(sorted.map((s) => `${s.day} ${s.time}`), ["1 10:30", "1 19:30", "2 09:00", "0 09:00"]);
});

test("config: acht vragen, zes uitkomsten op class_types.id, JOUWYOGA in hoofdletters", () => {
  assert.equal(questions.length, 8);
  assert.equal(yogaQuiz.trialCode, "JOUWYOGA");
  assert.equal(yogaQuiz.trialCode, yogaQuiz.trialCode.toUpperCase());
  assert.deepEqual(QUIZ_TRIAL_CODES, { yoga: "JOUWYOGA" });
  const ids = OUTCOME_KEYS.map((k) => outcomes[k].classTypeId);
  assert.equal(new Set(ids).size, 6);
  for (const id of ids) assert.match(id, /^[0-9a-f-]{36}$/);
});

test("geen em dashes in de quizconfiguratie", () => {
  const text = JSON.stringify({ questions, outcomes, yogaQuiz });
  assert.ok(!text.includes("\u2014"), "em dash gevonden");
  assert.ok(!text.includes("\u2013"), "en dash gevonden");
});

// ---- Voorselectie ----

const CT_V = outcomes.v.classTypeId;
const CT_Y = outcomes.y.classTypeId;

test("Amsterdamse dag en tijd, ook rond zomer- en wintertijd", () => {
  // 2026-11-09 is een maandag; 09:30 UTC is 10:30 in Amsterdam (wintertijd).
  assert.deepEqual(amsterdamDayAndTime("2026-11-09T09:30:00Z"), { day: 1, time: "10:30" });
  // 2026-10-03 (zaterdag) 07:00 UTC is 09:00 in Amsterdam (zomertijd).
  assert.deepEqual(amsterdamDayAndTime("2026-10-03T07:00:00Z"), { day: 6, time: "09:00" });
  assert.equal(amsterdamDayAndTime("onzin"), null);
});

test("voorselectie: eerste sessie in de gekozen bucket, anders de eerstvolgende van de les", () => {
  const options = [
    { id: "a", startAt: "2026-11-09T09:30:00Z", classTypeId: CT_V }, // ma 10:30
    { id: "b", startAt: "2026-11-10T08:00:00Z", classTypeId: CT_V }, // di 09:00
    { id: "c", startAt: "2026-11-10T18:30:00Z", classTypeId: CT_Y }, // di 19:30
    { id: "d", startAt: "2026-11-14T09:15:00Z", classTypeId: CT_Y }, // za 10:15
  ];
  assert.equal(pickPreselectedSessionId(options, CT_V, null), "a");
  assert.equal(pickPreselectedSessionId(options, CT_V, "weekdag-dag"), "a");
  // Vinyasa Flow heeft geen avond of weekend: de eerstvolgende sessie van de les.
  assert.equal(pickPreselectedSessionId(options, CT_V, "weekdag-avond"), "a");
  assert.equal(pickPreselectedSessionId(options, CT_V, "weekend"), "a");
  assert.equal(pickPreselectedSessionId(options, CT_Y, "weekend"), "d");
  assert.equal(pickPreselectedSessionId(options, CT_Y, "weekdag-avond"), "c");
  assert.equal(pickPreselectedSessionId(options, CT_Y, "onzin"), "c");
  assert.equal(pickPreselectedSessionId(options, "geen-uuid", null), null);
  assert.equal(pickPreselectedSessionId(options, outcomes.n.classTypeId, null), null);
  assert.equal(pickPreselectedSessionId(options, undefined, null), null);
});

// ---- Startroute ----

function deps(scope: string | null, cookieOk = true) {
  const calls = { lookup: [] as string[], cookie: [] as string[] };
  return {
    calls,
    deps: {
      lookupScope: async (code: string) => {
        calls.lookup.push(code);
        return scope;
      },
      setCookie: async (code: string) => {
        calls.cookie.push(code);
        return cookieOk;
      },
    },
  };
}
const LES = outcomes.p.classTypeId;
const qs = (s: string) => new URLSearchParams(s);

test("start: bekende quiz met bruikbare code zet het cookie en gaat naar de codeflow met de les", async () => {
  const d = deps("yoga_mobility");
  const target = await resolveQuizStart(qs(`quiz=yoga&les=${LES}&tijd=weekend`), d.deps);
  assert.deepEqual(d.calls.lookup, ["JOUWYOGA"]);
  assert.deepEqual(d.calls.cookie, ["JOUWYOGA"]);
  assert.equal(target, `/proefles/code?les=${LES}&tijd=weekend`);
  assert.ok(!target.includes("JOUWYOGA"), "de code staat nooit in de redirect");
});

test("start: scope all vraagt om de groepsles-tak, group is bruikbaar", async () => {
  const all = await resolveQuizStart(qs(`quiz=yoga&les=${LES}`), deps("all").deps);
  assert.equal(all, `/proefles/code?les=${LES}&soort=les`);
  const group = await resolveQuizStart(qs(`quiz=yoga&les=${LES}`), deps("group").deps);
  assert.equal(group, `/proefles/code?les=${LES}`);
});

test("start: onbekend quiz-id valt terug, zonder opzoeking en zonder cookie", async () => {
  for (const quiz of ["kracht", "", "constructor", "__proto__", "toString"]) {
    const d = deps("yoga_mobility");
    const target = await resolveQuizStart(qs(`quiz=${quiz}&les=${LES}`), d.deps);
    assert.equal(target, `/proefles/code?les=${LES}`, `quiz "${quiz}"`);
    assert.equal(d.calls.lookup.length, 0);
    assert.equal(d.calls.cookie.length, 0);
  }
  const d = deps("yoga_mobility");
  assert.equal(await resolveQuizStart(qs(`les=${LES}`), d.deps), `/proefles/code?les=${LES}`);
  assert.equal(d.calls.cookie.length, 0);
});

test("start: een meegegeven ?code= wordt genegeerd", async () => {
  const unknown = deps("yoga_mobility");
  const t1 = await resolveQuizStart(qs(`quiz=kracht&code=GRATIS&les=${LES}`), unknown.deps);
  assert.equal(t1, `/proefles/code?les=${LES}`);
  assert.equal(unknown.calls.cookie.length, 0);

  const known = deps("yoga_mobility");
  const t2 = await resolveQuizStart(qs(`quiz=yoga&code=MOVENOW&les=${LES}`), known.deps);
  assert.deepEqual(known.calls.lookup, ["JOUWYOGA"]);
  assert.deepEqual(known.calls.cookie, ["JOUWYOGA"]);
  assert.ok(!t2.includes("MOVENOW") && !t2.includes("code="));
});

test("start: negatieve lookup gaat naar de betaalde proefles met dezelfde voorselectie", async () => {
  for (const scope of [null, "kettlebell", "vrij_trainen"]) {
    const d = deps(scope);
    const target = await resolveQuizStart(qs(`quiz=yoga&les=${LES}&tijd=weekdag-avond`), d.deps);
    assert.equal(target, `/proefles/boeken?les=${LES}&tijd=weekdag-avond`, `scope ${scope}`);
    assert.equal(d.calls.cookie.length, 0, "geen cookie bij een negatieve lookup");
  }
});

test("start: cookie dat niet gezet kan worden valt terug op de ingevulde code", async () => {
  const d = deps("yoga_mobility", false);
  const target = await resolveQuizStart(qs(`quiz=yoga&les=${LES}`), d.deps);
  assert.equal(target, `/proefles/code?les=${LES}&code=JOUWYOGA`);
});

test("start: ongeldige les en tijd worden weggelaten", async () => {
  const target = await resolveQuizStart(qs("quiz=yoga&les=niet-een-uuid&tijd=nacht"), deps("yoga_mobility").deps);
  assert.equal(target, "/proefles/code");
  // Een geldige UUID die geen quizles is, telt ook niet.
  const other = await resolveQuizStart(
    qs("quiz=yoga&les=06e5bc5b-0d81-49d3-9ecb-741e6d0395be"),
    deps("yoga_mobility").deps,
  );
  assert.equal(other, "/proefles/code");
});

test("start: attributieparameters overleven de redirect, in elk van de drie uitkomsten", async () => {
  const params =
    `quiz=yoga&les=${LES}&gclid=abc123&gbraid=gb1&wbraid=wb1&fbclid=fb1` +
    `&utm_source=google&utm_medium=cpc&utm_campaign=yoga&utm_term=t&utm_content=c` +
    `&lp=${encodeURIComponent("/welke-yoga-past-bij-jou?gclid=abc123")}`;
  const check = (target: string) => {
    const url = new URL(target, "https://example.test");
    for (const [k, v] of [
      ["gclid", "abc123"],
      ["gbraid", "gb1"],
      ["wbraid", "wb1"],
      ["fbclid", "fb1"],
      ["utm_source", "google"],
      ["utm_medium", "cpc"],
      ["utm_campaign", "yoga"],
      ["utm_term", "t"],
      ["utm_content", "c"],
      ["lp", "/welke-yoga-past-bij-jou?gclid=abc123"],
    ]) {
      assert.equal(url.searchParams.get(k), v, `${k} in ${target}`);
    }
    assert.equal(url.searchParams.get("les"), LES);
    assert.equal(url.searchParams.has("quiz"), false);
  };
  const positive = await resolveQuizStart(qs(params), deps("yoga_mobility").deps);
  assert.ok(positive.startsWith("/proefles/code?"));
  check(positive);
  const negative = await resolveQuizStart(qs(params), deps(null).deps);
  assert.ok(negative.startsWith("/proefles/boeken?"));
  check(negative);
  const unknown = await resolveQuizStart(qs(params.replace("quiz=yoga", "quiz=nee")), deps("yoga_mobility").deps);
  assert.ok(unknown.startsWith("/proefles/code?"));
  check(unknown);
});

// ---- Links ----

test("links: de codelink bevat nooit de code en draagt les, tijd en bron mee", () => {
  const href = codeBookingPath(LES, "weekend", { gclid: "g1", utm_source: "instagram", utm_medium: "social" });
  assert.ok(href.startsWith("/proefles/code/start?"));
  assert.ok(!/JOUWYOGA/i.test(href));
  const url = new URL(href, "https://example.test");
  assert.equal(url.searchParams.get("quiz"), "yoga");
  assert.equal(url.searchParams.get("les"), LES);
  assert.equal(url.searchParams.get("tijd"), "weekend");
  assert.equal(url.searchParams.get("gclid"), "g1");
  assert.equal(url.searchParams.get("utm_source"), "instagram", "een eigen bron blijft staan");
});

test("links: zonder eigen bron krijgt de doorlink de quizbron; de betaalde link gaat naar boeken", () => {
  const url = new URL(paidBookingPath(LES, null, {}), "https://example.test");
  assert.equal(url.pathname, "/proefles/boeken");
  assert.equal(url.searchParams.get("les"), LES);
  assert.equal(url.searchParams.get("utm_source"), "yoga_test");
  assert.equal(url.searchParams.get("utm_medium"), "quiz");
  assert.equal(url.searchParams.has("tijd"), false);
});
