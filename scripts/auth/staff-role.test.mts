import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isStaffRole } from "../../src/lib/auth/staff-role.ts";

// fix/profiles-self-update-lockdown, punt 6: trainers en admins krijgen nooit
// een health-intake-scherm of intake-drempel. De helper is de ene regel; de
// brontests hieronder bewijzen dat elk scherm met een intake-prompt hem
// gebruikt, zodat een nieuwe prompt zonder rolcheck hier opvalt.

test("isStaffRole: trainer en admin zijn staf, member en onbekend niet", () => {
  assert.equal(isStaffRole("trainer"), true);
  assert.equal(isStaffRole("admin"), true);
  assert.equal(isStaffRole("member"), false);
  assert.equal(isStaffRole(null), false);
  assert.equal(isStaffRole(undefined), false);
  assert.equal(isStaffRole(""), false);
});

const INTAKE_SURFACES = [
  "src/app/app/_lib/dashboard-data.ts",
  "src/app/app/rooster/page.tsx",
  "src/app/app/profiel/page.tsx",
  "src/app/app/profiel/intake/page.tsx",
];

for (const file of INTAKE_SURFACES) {
  test(`${file} slaat de intake over voor staf (gebruikt isStaffRole en leest role)`, () => {
    const src = readFileSync(file, "utf8");
    assert.match(src, /isStaffRole\(/, "geen isStaffRole-aanroep");
    assert.match(src, /select\([\s\S]*?role[\s\S]*?\)/, "leest profiles.role niet");
  });
}

test("intake-pagina stuurt staf terug naar het profiel", () => {
  const src = readFileSync("src/app/app/profiel/intake/page.tsx", "utf8");
  assert.match(src, /if \(isStaffRole\(profile\?\.role\)\) redirect\("\/app\/profiel"\)/);
});

test("submitHealthIntake schrijft via de RPC, niet rechtstreeks op profiles", () => {
  const src = readFileSync("src/lib/actions/profile.ts", "utf8");
  assert.match(src, /rpc\("submit_health_intake"/);
  assert.doesNotMatch(src, /health_intake_completed_at: new Date\(\)/);
});

test("recordAcquisitionOnLogin krijgt de service-role-client", () => {
  const src = readFileSync("src/lib/actions/auth.ts", "utf8");
  assert.match(src, /recordAcquisitionOnLogin\(\s*createAdminClient\(\)/);
});

test("joinWaitlist schrijft via de service-role-client", () => {
  const src = readFileSync("src/lib/member/booking-actions.ts", "utf8");
  const fn = src.slice(src.indexOf("async function joinWaitlist"), src.indexOf("export async function cancelBooking"));
  assert.match(fn, /createAdminClient\(\)/);
  assert.doesNotMatch(fn, /await createClient\(\)/);
});
