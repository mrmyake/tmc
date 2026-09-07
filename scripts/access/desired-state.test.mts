/**
 * Statusregels voor de gewenste deurtoegang. Run: npm run test:access
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amsterdamEndOfDay,
  amsterdamMidnight,
  resolveDesiredAccess,
  rollingWindowEnd,
  type AccessMembershipRow,
} from "../../src/lib/access/desired-state";

// Dinsdag 8 september 2026, 12:00 Amsterdam (CEST) = 10:00Z.
const NOW = new Date("2026-09-08T10:00:00.000Z");

function row(overrides: Partial<AccessMembershipRow>): AccessMembershipRow {
  return {
    status: "active",
    extended_access: false,
    cancellation_effective_date: null,
    pause_effective_date: null,
    ...overrides,
  };
}

test("active zonder pauze: toegang, standaard, rollend venster", () => {
  const d = resolveDesiredAccess({ role: "member", memberships: [row({})] }, NOW);
  assert.equal(d.enabled, true);
  assert.equal(d.group, "standard");
  assert.equal(d.endsAt, null, "null betekent rollend, nooit voor altijd");
});

test("extended_access true geeft de groep extended", () => {
  const d = resolveDesiredAccess(
    { role: "member", memberships: [row({ extended_access: true })] },
    NOW,
  );
  assert.equal(d.group, "extended");
});

test("payment_failed geeft bewust toegang (rollend venster)", () => {
  const d = resolveDesiredAccess(
    { role: "member", memberships: [row({ status: "payment_failed" })] },
    NOW,
  );
  assert.equal(d.enabled, true);
  assert.equal(d.endsAt, null);
});

test("pending, paused, cancelled en expired geven geen toegang", () => {
  for (const status of ["pending", "paused", "cancelled", "expired", "onbekend"]) {
    const d = resolveDesiredAccess({ role: "member", memberships: [row({ status })] }, NOW);
    assert.equal(d.enabled, false, status);
    assert.equal(d.group, null, status);
  }
});

test("geen membership: geen toegang", () => {
  const d = resolveDesiredAccess({ role: "member", memberships: [] }, NOW);
  assert.equal(d.enabled, false);
  assert.equal(d.reason, "no_covering_membership");
});

test("cancellation_requested: tot en met de effectieve datum (00:00 Amsterdam van de dag erna)", () => {
  const d = resolveDesiredAccess(
    {
      role: "member",
      memberships: [
        row({ status: "cancellation_requested", cancellation_effective_date: "2026-10-06" }),
      ],
    },
    NOW,
  );
  assert.equal(d.enabled, true);
  // 7 oktober 2026 00:00 CEST = 6 oktober 22:00Z.
  assert.equal(d.endsAt?.toISOString(), "2026-10-06T22:00:00.000Z");

  const past = resolveDesiredAccess(
    {
      role: "member",
      memberships: [
        row({ status: "cancellation_requested", cancellation_effective_date: "2026-09-07" }),
      ],
    },
    NOW,
  );
  assert.equal(past.enabled, false, "gisteren was de laatste dag");

  const today = resolveDesiredAccess(
    {
      role: "member",
      memberships: [
        row({ status: "cancellation_requested", cancellation_effective_date: "2026-09-08" }),
      ],
    },
    NOW,
  );
  assert.equal(today.enabled, true, "vandaag is de laatste dag, dus nog open");
});

test("cancellation_requested zonder datum: fail closed", () => {
  const d = resolveDesiredAccess(
    { role: "member", memberships: [row({ status: "cancellation_requested" })] },
    NOW,
  );
  assert.equal(d.enabled, false);
});

test("geplande pauze: pause_effective_date is de einddatum (00:00 Amsterdam)", () => {
  const d = resolveDesiredAccess(
    { role: "member", memberships: [row({ pause_effective_date: "2026-09-20" })] },
    NOW,
  );
  assert.equal(d.enabled, true);
  assert.equal(d.endsAt?.toISOString(), "2026-09-19T22:00:00.000Z");

  const started = resolveDesiredAccess(
    { role: "member", memberships: [row({ pause_effective_date: "2026-09-08" })] },
    NOW,
  );
  assert.equal(started.enabled, false, "eerste dag zonder dekking is aangebroken");
});

test("wintertijd: einddatum om 23:00Z", () => {
  assert.equal(amsterdamMidnight("2026-12-01").toISOString(), "2026-11-30T23:00:00.000Z");
  assert.equal(amsterdamEndOfDay("2026-12-31").toISOString(), "2026-12-31T23:00:00.000Z");
});

test("trainer en admin krijgen staf, ook zonder membership", () => {
  for (const role of ["trainer", "admin"]) {
    const d = resolveDesiredAccess({ role, memberships: [] }, NOW);
    assert.equal(d.enabled, true, role);
    assert.equal(d.group, "staff", role);
    assert.equal(d.endsAt, null, role);
  }
  const withCancelled = resolveDesiredAccess(
    { role: "admin", memberships: [row({ status: "cancelled" })] },
    NOW,
  );
  assert.equal(withCancelled.group, "staff");
});

test("meerdere rijen: een doorlopende rij houdt het rollende venster, anders de laatste harde datum", () => {
  const rolling = resolveDesiredAccess(
    {
      role: "member",
      memberships: [
        row({ status: "cancellation_requested", cancellation_effective_date: "2026-09-30" }),
        row({ status: "active" }),
      ],
    },
    NOW,
  );
  assert.equal(rolling.endsAt, null);

  const hard = resolveDesiredAccess(
    {
      role: "member",
      memberships: [
        row({ status: "cancellation_requested", cancellation_effective_date: "2026-09-30" }),
        row({ status: "active", pause_effective_date: "2026-09-15" }),
      ],
    },
    NOW,
  );
  assert.equal(hard.endsAt?.toISOString(), "2026-09-30T22:00:00.000Z");
});

test("rollend venster is nu plus zeven dagen", () => {
  assert.equal(rollingWindowEnd(NOW).toISOString(), "2026-09-15T10:00:00.000Z");
});
