/**
 * Bron-test (check-in PR 2): geen action in src/lib/check-in en src/lib/kiosk
 * gebruikt nog requireTrainerOrAdmin() waar de kiosk-gate hoort (alleen
 * gate.ts mag hem aanroepen, als eerste tak van requireKioskActor), en de
 * oude team-PIN komt nergens meer voor in src/.
 * Run: npm run test:kiosk
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

test("alleen src/lib/kiosk/gate.ts roept requireTrainerOrAdmin aan binnen check-in en kiosk", () => {
  const files = ["lib/check-in", "lib/kiosk", "app/kiosk", "app/checkin"]
    .flatMap((p) => walk(path.join(SRC, p)))
    .filter((f) => /\.(ts|tsx)$/.test(f));
  assert.ok(files.length >= 10, `te weinig bestanden: ${files.length}`);
  const offenders = files
    .filter((f) => !f.endsWith(path.join("lib", "kiosk", "gate.ts")))
    .filter((f) => stripComments(readFileSync(f, "utf8")).includes("requireTrainerOrAdmin"))
    .map((f) => path.relative(SRC, f));
  assert.deepEqual(offenders, []);
});

test("elke check-in- en kiosk-action gaat door requireKioskActor", () => {
  for (const rel of ["lib/check-in/actions.ts", "lib/check-in/admin-queries.ts"]) {
    const code = stripComments(readFileSync(path.join(SRC, rel), "utf8"));
    assert.ok(code.includes("requireKioskActor"), `${rel}: mist de kiosk-gate`);
  }
});

test("de gedeelde team-PIN en de IP-teller komen nergens meer voor in src/", () => {
  const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
  const offenders: string[] = [];
  for (const file of files) {
    const code = stripComments(readFileSync(file, "utf8"));
    for (const needle of [
      "admin_checkin_pin_hash",
      "verify_admin_checkin_pin",
      "set_admin_checkin_pin",
      "register_checkin_pin_attempt",
      "checkin_pin_attempts",
      "CHECKIN_PIN_LENGTH",
      "tmc_admin_unlock",
    ]) {
      if (code.includes(needle)) offenders.push(`${path.relative(SRC, file)}: ${needle}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("pagina's en layouts onder /kiosk renderen zonder te verlengen (extend: false)", () => {
  const files = walk(path.join(SRC, "app/kiosk")).filter((f) => /page\.tsx$|layout\.tsx$/.test(f));
  for (const file of files) {
    const code = stripComments(readFileSync(file, "utf8"));
    const calls = [...code.matchAll(/requireKioskActor\(([^)]*)\)/g)];
    for (const [, args] of calls) {
      assert.match(args, /extend:\s*false/, `${path.relative(SRC, file)}: requireKioskActor zonder extend: false`);
    }
  }
});
