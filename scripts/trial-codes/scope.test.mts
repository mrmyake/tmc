import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCOPE_LABEL,
  SELECTABLE_TRIAL_CODE_SCOPES,
  TRIAL_CODE_SCOPES,
  isTrialCodeScope,
  pillarsForScope,
} from "../../src/lib/trial-codes/scope.ts";
import { trialCodesCsv, kindText } from "../../src/lib/trial-codes/csv.ts";

// Proefcodes met scope (PR 1): de pillar-lijst per scope spiegelt
// tmc.redeem_trial_code; de server blijft leidend.

test("pillarsForScope: yoga en kettlebell per pillar, group is de v2-lijst", () => {
  assert.deepEqual(pillarsForScope("yoga_mobility"), ["yoga_mobility"]);
  assert.deepEqual(pillarsForScope("kettlebell"), ["kettlebell"]);
  assert.deepEqual(pillarsForScope("group"), ["yoga_mobility", "kettlebell", "kids", "senior"]);
});

test("pillarsForScope: vrij trainen heeft geen sessielijst en group nooit vrij trainen", () => {
  assert.deepEqual(pillarsForScope("vrij_trainen"), []);
  assert.ok(!pillarsForScope("group").includes("vrij_trainen"));
});

test("scopes: vier in de database, vrij trainen niet kiesbaar in PR 1", () => {
  assert.equal(TRIAL_CODE_SCOPES.length, 4);
  assert.deepEqual([...SELECTABLE_TRIAL_CODE_SCOPES], ["yoga_mobility", "kettlebell", "group"]);
  for (const s of TRIAL_CODE_SCOPES) assert.ok(SCOPE_LABEL[s].length > 0);
});

test("isTrialCodeScope: alleen de vier bekende waarden", () => {
  assert.equal(isTrialCodeScope("group"), true);
  assert.equal(isTrialCodeScope("vrij_trainen"), true);
  assert.equal(isTrialCodeScope("yoga"), false);
  assert.equal(isTrialCodeScope(null), false);
  assert.equal(isTrialCodeScope(undefined), false);
});

test("kindText: eenmalig, X keer, onbeperkt", () => {
  assert.equal(kindText(1), "Eenmalig");
  assert.equal(kindText(5), "5 keer");
  assert.equal(kindText(null), "Onbeperkt");
});

test("trialCodesCsv: kolommen code, label, soort, scope, aangemaakt op; aanhalingstekens ontsnapt", () => {
  const csv = trialCodesCsv([
    {
      id: "1",
      code: "AAAA2222",
      label: 'Flyers "bakkerij"',
      maxUses: 1,
      scope: "yoga_mobility",
      createdAt: "2026-09-30T20:00:00.000Z",
    },
    {
      id: "2",
      code: "BBBB3333",
      label: "Actie",
      maxUses: null,
      scope: "group",
      createdAt: "2026-09-30T20:00:00.000Z",
    },
  ]);
  const lines = csv.split("\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0], '"Code","Label","Soort","Scope","Aangemaakt op"');
  assert.equal(
    lines[1],
    '"AAAA2222","Flyers ""bakkerij""","Eenmalig","Yoga & mobility","2026-09-30T20:00:00.000Z"',
  );
  assert.equal(
    lines[2],
    '"BBBB3333","Actie","Onbeperkt","Alle groepslessen","2026-09-30T20:00:00.000Z"',
  );
});
