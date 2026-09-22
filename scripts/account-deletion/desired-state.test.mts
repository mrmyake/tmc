/**
 * Een verwijderverzoek waarvan de sluiting gestart of gedaan is sluit de
 * deur, ongeacht membership of rol; een verzoek dat op de einddatum wacht niet
 * (src/lib/access/desired-state.ts, PR 2 accountverwijdering).
 * Run: npm run test:account-deletion
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDesiredAccess } from "../../src/lib/access/desired-state";

const NOW = new Date("2026-09-21T10:00:00.000Z");
const active = {
  plan_type: "all_inclusive",
  status: "active",
  extended_access: false,
  cancellation_effective_date: null,
  pause_effective_date: null,
};

test("actieve membership geeft toegang, ook met een verzoek dat op de einddatum wacht; na de sluiting niet", () => {
  const open = resolveDesiredAccess({ role: "member", memberships: [active] }, NOW);
  assert.equal(open.enabled, true);
  const waiting = resolveDesiredAccess(
    { role: "member", memberships: [active], deletion_frozen: false },
    NOW,
  );
  assert.equal(waiting.enabled, true);
  const closed = resolveDesiredAccess(
    { role: "member", memberships: [active], deletion_frozen: true },
    NOW,
  );
  assert.equal(closed.enabled, false);
  assert.equal(closed.reason, "account_deletion");
});

test("ook staf gaat dicht na de sluiting", () => {
  const r = resolveDesiredAccess({ role: "admin", memberships: [], deletion_frozen: true }, NOW);
  assert.equal(r.enabled, false);
  assert.equal(r.reason, "account_deletion");
});
