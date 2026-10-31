/**
 * Weergavekeuze van /app/rooster (spec-rooster-vrij-trainen.md, besluiten
 * 2026-10-31): standaardtab, rittenkaarttegoed en het scherm per tab.
 * Run: npm run test:rooster-weergave
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { todayIsoAmsterdam } from "../../src/lib/format-date";
import {
  bepaalRoosterWeergave,
  type RoosterMembership,
} from "../../src/lib/member/rooster-weergave";

const TODAY = "2026-10-31";
const PRICE = 1500;

function sub(plan_type: string, covered: string[], cap: number | null, status = "active"): RoosterMembership {
  return {
    plan_type,
    status,
    covered_pillars: covered,
    frequency_cap: cap,
    credits_remaining: null,
    credits_expires_at: null,
    cancellation_effective_date: null,
  };
}
const vrij2x = (status = "active") => sub("vrij_trainen", ["vrij_trainen"], 2, status);
const groep2x = (status = "active") => sub("groepslessen", ["yoga_mobility", "kettlebell"], 2, status);
const allInclusive = () => sub("all_inclusive", ["vrij_trainen", "yoga_mobility", "kettlebell"], 2);
function ride(credits: number | null, expires: string | null, status = "active"): RoosterMembership {
  return {
    plan_type: "ten_ride_card",
    status,
    covered_pillars: [],
    frequency_cap: null,
    credits_remaining: credits,
    credits_expires_at: expires,
    cancellation_effective_date: null,
  };
}
const pt = (): RoosterMembership => ({ ...ride(5, null), plan_type: "pt_package" });

function run(memberships: RoosterMembership[], opts: { slot?: boolean; today?: string; price?: number | null } = {}) {
  return bepaalRoosterWeergave({
    memberships,
    vrijBookingEnabled: opts.slot ?? true,
    todayIso: opts.today ?? TODAY,
    extraClassPriceCents: opts.price === undefined ? PRICE : opts.price,
  });
}

test("vrij_trainen_2x + bruikbare rittenkaart: standaard Groepslessen, tegoed, vrij-tab normaal", () => {
  const w = run([vrij2x(), ride(8, "2027-04-30")]);
  assert.equal(w.defaultTab, "lessen");
  assert.deepEqual(w.ride, { rides: 8, expiresAt: "2027-04-30" });
  assert.deepEqual(w.lessen, { kind: "normaal", ride: { rides: 8, expiresAt: "2027-04-30" } });
  assert.deepEqual(w.vrij, { kind: "gedekt", cap: 2 });
});

test("vrij_trainen_2x zonder rittenkaart: standaard Vrij trainen, groepslessen-tab scherm B", () => {
  const w = run([vrij2x()]);
  assert.equal(w.defaultTab, "vrij");
  assert.deepEqual(w.lessen, { kind: "niet-in-abonnement", priceCents: PRICE });
  assert.deepEqual(w.vrij, { kind: "gedekt", cap: 2 });
});

test("groepslessen_2x: standaard Groepslessen, vrij-tab scherm C met upfrontExtraOffer in slotmodus", () => {
  const w = run([groep2x()]);
  assert.equal(w.defaultTab, "lessen");
  assert.deepEqual(w.lessen, { kind: "normaal", ride: null });
  assert.deepEqual(w.vrij, { kind: "extra", upfrontExtraOffer: { priceCents: PRICE } });
});

test("groepslessen_2x met check-in-modus: kaart zonder aanbod", () => {
  const w = run([groep2x()], { slot: false });
  assert.deepEqual(w.vrij, { kind: "niet-in-abonnement" });
});

test("geen extra-lesprijs: geen aanbod op B en C", () => {
  assert.deepEqual(run([vrij2x()], { price: null }).lessen, { kind: "normaal", ride: null });
  assert.deepEqual(run([groep2x()], { price: null }).vrij, { kind: "niet-in-abonnement" });
});

test("alleen rittenkaart: standaard Groepslessen met tegoed, vrij-tab scherm D zonder aanbod", () => {
  const w = run([ride(3, "2027-01-15")]);
  assert.equal(w.defaultTab, "lessen");
  assert.deepEqual(w.lessen, { kind: "normaal", ride: { rides: 3, expiresAt: "2027-01-15" } });
  assert.deepEqual(w.vrij, {
    kind: "open-studio",
    ride: { rides: 3, expiresAt: "2027-01-15" },
    hasRideCard: true,
  });
});

test("alleen PT of niets: scherm D zonder rittenkaartregel", () => {
  const w = run([pt()]);
  assert.equal(w.defaultTab, "lessen");
  assert.deepEqual(w.vrij, { kind: "open-studio", ride: null, hasRideCard: false });
  assert.deepEqual(run([]).vrij, { kind: "open-studio", ride: null, hasRideCard: false });
});

test("lege rittenkaart telt niet mee", () => {
  const w = run([vrij2x(), ride(0, "2027-04-30")]);
  assert.equal(w.ride, null);
  assert.equal(w.defaultTab, "vrij");
  assert.equal(w.lessen.kind, "niet-in-abonnement");
  assert.deepEqual(run([ride(0, null)]).vrij, { kind: "open-studio", ride: null, hasRideCard: true });
});

test("verlopen rittenkaart telt niet mee, vervaldatum vandaag nog wel", () => {
  assert.equal(run([vrij2x(), ride(4, "2026-10-30")]).ride, null);
  assert.deepEqual(run([vrij2x(), ride(4, "2026-10-31")]).ride, { rides: 4, expiresAt: "2026-10-31" });
});

test("rittenkaart die op de Amsterdam-middernachtgrens verloopt", () => {
  const card = ride(4, "2026-10-31");
  // 31 oktober 22:30 UTC is na het eind van de zomertijd nog 31 oktober 23:30 in Amsterdam.
  const before = todayIsoAmsterdam(new Date("2026-10-31T22:30:00Z"));
  assert.equal(before, "2026-10-31");
  assert.notEqual(run([card], { today: before }).ride, null);
  // 23:30 UTC is 00:30 op 1 november in Amsterdam (CET): de kaart is verlopen.
  const after = todayIsoAmsterdam(new Date("2026-10-31T23:30:00Z"));
  assert.equal(after, "2026-11-01");
  assert.equal(run([card], { today: after }).ride, null);
});

test("meerdere bruikbare rittenkaarten: som en vroegste vervaldatum", () => {
  const w = run([ride(3, "2027-05-01"), ride(5, "2027-03-01"), ride(2, null)]);
  assert.deepEqual(w.ride, { rides: 10, expiresAt: "2027-03-01" });
});

test("rittenkaart zonder vervaldatum: expiresAt null", () => {
  assert.deepEqual(run([ride(2, null)]).ride, { rides: 2, expiresAt: null });
});

test("pt_package telt niet mee voor dekking of tegoed", () => {
  const w = run([vrij2x(), pt()]);
  assert.equal(w.ride, null);
  assert.equal(w.defaultTab, "vrij");
});

test("gepauzeerd abonnement: pauzekaart op beide tabs, vrij-only opent op Vrij trainen", () => {
  const w = run([vrij2x("paused")]);
  assert.equal(w.defaultTab, "vrij");
  assert.deepEqual(w.lessen, { kind: "gepauzeerd" });
  assert.deepEqual(w.vrij, { kind: "gepauzeerd" });
  const g = run([groep2x("paused")]);
  assert.equal(g.defaultTab, "lessen");
  assert.deepEqual(g.lessen, { kind: "gepauzeerd" });
  assert.deepEqual(g.vrij, { kind: "gepauzeerd" });
});

test("gepauzeerd abonnement met bruikbare rittenkaart: groepslessen normaal met tegoed", () => {
  const w = run([vrij2x("paused"), ride(5, "2027-04-30")]);
  assert.equal(w.lessen.kind, "normaal");
  assert.equal(w.vrij.kind, "gepauzeerd");
});

test("All Access: beide tabs gedekt, geen cap op vrij trainen", () => {
  const w = run([allInclusive()]);
  assert.equal(w.defaultTab, "lessen");
  assert.deepEqual(w.lessen, { kind: "normaal", ride: null });
  assert.deepEqual(w.vrij, { kind: "gedekt", cap: null });
});

test("opgezegd abonnement telt mee tot de effectieve datum", () => {
  const m = { ...vrij2x("cancellation_requested"), cancellation_effective_date: "2026-11-15" };
  assert.equal(run([m]).vrij.kind, "gedekt");
  const expired = { ...m, cancellation_effective_date: "2026-10-30" };
  assert.equal(run([expired]).vrij.kind, "open-studio");
});
