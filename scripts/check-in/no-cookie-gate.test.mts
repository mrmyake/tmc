/**
 * Bron-test bij fix/checkin-cookie-gate: het ongetekende cookie
 * tmc_admin_unlock mag nergens meer als autorisatie gelezen worden. Omdat
 * het leespad verwijderd is, is een runtime-test met een cookie op "1" niet
 * meer mogelijk; deze test houdt het zo door te falen zodra de check-in-code
 * of de /checkin-route weer next/headers-cookies, de oude helper of het
 * cookie zelf aanraakt. Daarnaast: de proxy-matcher dekt /checkin en /kiosk.
 * Run: npm run test:check-in
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "../../src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const SCOPES = ["lib/check-in", "app/checkin"].map((p) => path.join(SRC, p));
const FORBIDDEN = [
  '"tmc_admin_unlock"',
  "'tmc_admin_unlock'",
  "isAdminUnlocked",
  "unlockAdminMode",
  "lockAdminMode",
  "admin-lock",
  "next/headers",
  "cookies(",
];

test("check-in-code en /checkin lezen geen cookie en geen oude unlock-helper", () => {
  const files = SCOPES.flatMap((dir) => walk(dir)).filter((f) => /\.(ts|tsx)$/.test(f));
  assert.ok(files.length >= 5, `te weinig bestanden gevonden: ${files.length}`);
  const offenders: string[] = [];
  for (const file of files) {
    const code = stripComments(readFileSync(file, "utf8"));
    for (const needle of FORBIDDEN) {
      if (code.includes(needle)) offenders.push(`${path.relative(SRC, file)}: ${needle}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("de oude cookie-bestanden bestaan niet meer", () => {
  for (const rel of [
    "lib/check-in/admin-lock.ts",
    "app/checkin/_components/AdminLockScreen.tsx",
    "app/checkin/_components/CheckInTablet.tsx",
    // check-in PR 2: team-PIN en /checkin-layout weg
    "lib/admin/checkin-pin-actions.ts",
    "app/app/admin/instellingen/_components/CheckinPinForm.tsx",
    "app/checkin/layout.tsx",
  ]) {
    assert.equal(existsSync(path.join(SRC, rel)), false, `${rel} bestaat nog`);
  }
});

test("elke server action in actions.ts en admin-queries.ts begint met de kiosk-gate", () => {
  for (const rel of ["lib/check-in/actions.ts", "lib/check-in/admin-queries.ts"]) {
    const code = stripComments(readFileSync(path.join(SRC, rel), "utf8"));
    // Body begint bij de eerste "{" na de parameterlijst en het returntype;
    // inline object-types in de signature staan nooit alleen op een regel.
    const actions = [
      ...code.matchAll(/export async function (\w+)\([\s\S]*?\)(?::[^\n]*?)? \{\n([\s\S]*?)\n\}/g),
    ];
    assert.ok(actions.length > 0, `${rel}: geen actions gevonden`);
    for (const [, name, body] of actions) {
      const firstStatement = body.trim().split("\n")[0];
      // Sinds check-in PR 2 is dat kioskGate() (requireKioskActor via
      // asStaffGate); de oude requireTrainerOrAdmin() mag hier niet meer.
      assert.match(
        firstStatement,
        /const gate = await kioskGate\(\);/,
        `${rel}: ${name} begint niet met de kiosk-gate`,
      );
    }
  }
});

test("proxy-matcher dekt /checkin en /kiosk", () => {
  const code = stripComments(readFileSync(path.join(SRC, "proxy.ts"), "utf8"));
  for (const route of ['"/checkin"', '"/checkin/:path*"', '"/kiosk"', '"/kiosk/:path*"']) {
    assert.ok(code.includes(route), `matcher mist ${route}`);
  }
  assert.match(code, /PROTECTED_PREFIXES = \["\/app", "\/checkin", "\/kiosk"\]/);
});
