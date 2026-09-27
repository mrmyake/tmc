import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TRAINER_HOME,
  TRAINER_LANDING,
  safeNextPath,
} from "../../src/lib/auth/safe-next.ts";

// fix/trainer-pt-scope: PT-functies alleen voor PT-trainers en admin. De
// echte gate (requirePtTrainerOrAdmin) en de RPC-gate (tmc.is_pt_trainer_for)
// hebben een database nodig en worden gedekt door
// scripts/test-trainer-pt-scope.sql. Deze brontests bewijzen dat elk PT-pad
// in de app de nieuwe gate gebruikt en dat de niet-PT-paden de oude gate
// houden, zodat een nieuwe PT-action zonder PT-gate hier opvalt.

const PT_GATE = /requirePtTrainerOrAdmin\(/;
const OLD_GATE = /requireTrainerOrAdmin\(\)/;

// Server actions die PT of klanten raken: nieuwe gate, oude gate weg.
const PT_ACTION_FILES: Array<{ file: string; withTrainerId: string[] }> = [
  {
    file: "src/lib/admin/pt-booking-actions.ts",
    withTrainerId: ["requirePtTrainerOrAdmin(input.trainerId)"],
  },
  {
    file: "src/lib/admin/pt-intake-actions.ts",
    withTrainerId: ["requirePtTrainerOrAdmin(input.trainerId)"],
  },
  {
    file: "src/lib/admin/pt-busy-actions.ts",
    withTrainerId: ["requirePtTrainerOrAdmin(trainerId)"],
  },
  {
    file: "src/lib/trainer/pt-agenda-actions.ts",
    withTrainerId: [
      "requirePtTrainerOrAdmin(trainerId)",
      "requirePtTrainerOrAdmin(args.trainerId)",
    ],
  },
  { file: "src/lib/admin/pt-cancellation-actions.ts", withTrainerId: [] },
  { file: "src/lib/admin/pt-credit-summary.ts", withTrainerId: [] },
];

for (const { file, withTrainerId } of PT_ACTION_FILES) {
  test(`${file} gate't op requirePtTrainerOrAdmin en niet meer op requireTrainerOrAdmin`, () => {
    const src = readFileSync(file, "utf8");
    assert.match(src, PT_GATE, "geen requirePtTrainerOrAdmin-aanroep");
    assert.doesNotMatch(src, OLD_GATE, "roept nog requireTrainerOrAdmin() aan");
    assert.doesNotMatch(
      src,
      /from "@\/lib\/admin\/require-trainer-or-admin"/,
      "importeert nog de oude gate",
    );
    for (const call of withTrainerId) {
      assert.ok(src.includes(call), `mist ${call} (trainerId gaat mee naar de gate)`);
    }
  });
}

test("pt-agenda-actions: elke export gate't (aantal gates = aantal exports)", () => {
  const src = readFileSync("src/lib/trainer/pt-agenda-actions.ts", "utf8");
  const exports = src.match(/^export async function /gm) ?? [];
  const gates = src.match(/await requirePtTrainerOrAdmin\(/g) ?? [];
  assert.equal(gates.length, exports.length);
});

test("customer-actions: zoeken achter de PT-gate, aanmaken en e-mailcorrectie admin-only", () => {
  const src = readFileSync("src/lib/admin/customer-actions.ts", "utf8");
  const search = src.slice(src.indexOf("export async function searchCustomers"));
  assert.match(search.slice(0, 800), PT_GATE);
  const create = src.slice(
    src.indexOf("export async function findOrCreateCustomer"),
    src.indexOf("export async function searchCustomers"),
  );
  assert.match(create, /await requireAdmin\(\)/);
  assert.doesNotMatch(create, PT_GATE);
  const correct = src.slice(src.indexOf("export async function correctCustomerEmail"));
  assert.match(correct.slice(0, 600), /await requireAdmin\(\)/);
  assert.doesNotMatch(src, OLD_GATE);
});

test("requirePtTrainerOrAdmin: rolcheck, is_pt_available en eigen trainer_id", () => {
  const src = readFileSync("src/lib/admin/require-pt-trainer-or-admin.ts", "utf8");
  assert.match(src, /import "server-only"/);
  assert.match(src, /role !== "admin" && role !== "trainer"/);
  assert.match(src, /select\("id, is_pt_available"\)/);
  assert.match(src, /\.eq\("is_active", true\)/);
  assert.match(src, /!trainer \|\| !trainer\.is_pt_available/);
  assert.match(src, /trainerId && trainerId !== trainer\.id/);
  // De admin-tak komt voor de PT-check: admin mag alles, ook zonder eigen rij.
  assert.ok(src.indexOf('role === "admin"') < src.indexOf("!trainer.is_pt_available"));
});

// Niet-PT-stafwerk blijft op de oude gate.
for (const file of [
  "src/lib/check-in/core.ts",
  "src/lib/kiosk/gate.ts",
  "src/lib/room-control/actions.ts",
]) {
  test(`${file} blijft op requireTrainerOrAdmin (geen PT-gate)`, () => {
    const src = readFileSync(file, "utf8");
    assert.match(src, /requireTrainerOrAdmin/);
    assert.doesNotMatch(src, PT_GATE);
  });
}

// Schermen: agenda, boeken en klant sturen niet-PT-trainers naar de trainer-home.
for (const file of [
  "src/app/app/trainer/agenda/page.tsx",
  "src/app/app/trainer/boeken/page.tsx",
  "src/app/app/trainer/klant/[id]/page.tsx",
]) {
  test(`${file} stuurt een trainer zonder PT naar TRAINER_HOME`, () => {
    const src = readFileSync(file, "utf8");
    assert.match(src, /resolveTrainerScope\(/);
    assert.match(src, /if \(!scope\.isPtTrainer\) redirect\(TRAINER_HOME\)/);
    assert.match(src, /import \{ TRAINER_HOME \} from "@\/lib\/auth\/safe-next"/);
  });
}

test("boeken: een trainer krijgt alleen de eigen rij in de trainerlijst", () => {
  const src = readFileSync("src/app/app/trainer/boeken/page.tsx", "utf8");
  assert.match(src, /scope\.isAdmin\s*\?\s*trainerQuery\s*:\s*trainerQuery\.eq\("id", scope\.ownTrainerId/);
});

test("resolveTrainerScope levert isPtTrainer (admin, of eigen rij met is_pt_available)", () => {
  const src = readFileSync("src/lib/trainer/trainer-scope.ts", "utf8");
  assert.match(src, /isPtTrainer: boolean;/);
  assert.match(src, /isPtTrainer: isAdmin \|\| Boolean\(ownRow\?\.is_pt_available\)/);
  assert.match(src, /select\("id, display_name, slug, is_pt_available"\)/);
});

// Navigatie: Agenda en Boeken alleen bij PT, logo volgt dezelfde vlag.
test("TrainerNav filtert PT-items op ptTrainer en zet het logo op de juiste landing", () => {
  const src = readFileSync("src/components/nav/TrainerNav.tsx", "utf8");
  assert.match(src, /ptTrainer: boolean;/);
  assert.match(src, /ITEMS\.filter\(\(item\) =>\s*ptTrainer \? !item\.nonPtOnly : !item\.pt,?\s*\)/);
  assert.match(src, /const logoHref = ptTrainer \? TRAINER_LANDING : TRAINER_HOME/);
  assert.match(src, /href=\{logoHref\}/);
  // Precies de twee PT-items dragen pt: true.
  const ptItems = src.match(/pt: true,/g) ?? [];
  assert.equal(ptItems.length, 2);
  assert.match(src, /href: "\/app\/trainer\/boeken",\s*label: "Boeken",\s*icon: CalendarPlus,\s*pt: true/);
  assert.match(src, /href: TRAINER_LANDING,\s*label: "Agenda",\s*icon: Calendar,\s*pt: true/);
  assert.doesNotMatch(src, /ITEMS\.map\(/, "rendert nog de ongefilterde lijst");
});

test("layout en AppChrome geven ptTrainer door (admin altijd, trainer via is_pt_available)", () => {
  const layout = readFileSync("src/app/app/layout.tsx", "utf8");
  assert.match(layout, /let ptTrainer = role === "admin";/);
  assert.match(layout, /if \(role === "trainer"\)/);
  assert.match(layout, /ptTrainer = Boolean\(trainerRow\?\.is_pt_available\)/);
  assert.match(layout, /ptTrainer=\{ptTrainer\}/);
  const chrome = readFileSync("src/app/app/AppChrome.tsx", "utf8");
  assert.match(chrome, /<TrainerNav firstName=\{firstName\} role=\{role\} ptTrainer=\{ptTrainer\} \/>/);
});

// Landing.
test("safe-next: TRAINER_HOME en TRAINER_LANDING zijn interne paden, bare /app telt als geen next", () => {
  assert.equal(TRAINER_HOME, "/app/trainer");
  assert.equal(TRAINER_LANDING, "/app/trainer/agenda");
  assert.equal(safeNextPath(TRAINER_HOME), TRAINER_HOME);
  assert.equal(safeNextPath(TRAINER_LANDING), TRAINER_LANDING);
  assert.equal(safeNextPath("/app"), null);
  assert.equal(safeNextPath("//evil.example"), null);
});

test("resolveRoleLanding: trainer met PT naar de agenda, zonder PT naar de trainer-home", () => {
  const src = readFileSync("src/lib/auth/role-landing.ts", "utf8");
  const trainerBranch = src.slice(src.indexOf('if (role === "trainer")'));
  assert.match(trainerBranch, /select\("is_pt_available"\)/);
  assert.match(trainerBranch, /\.eq\("is_active", true\)/);
  assert.match(trainerBranch, /trainerRow\?\.is_pt_available \? TRAINER_LANDING : TRAINER_HOME/);
  // De admin-tak blijft: eigen rij naar de agenda, anders admin-cockpit.
  assert.match(src, /return trainerRow \? TRAINER_LANDING : ADMIN_LANDING/);
});

test("/app stuurt een trainer via resolveRoleLanding door, niet via een vaste constante", () => {
  const src = readFileSync("src/app/app/page.tsx", "utf8");
  assert.match(src, /redirect\(await resolveRoleLanding\(supabase, user\.id\)\)/);
  assert.doesNotMatch(src, /TRAINER_LANDING/);
});

// Migratie: geen PT-RPC op is_staff(), assertieblok aanwezig, is_staff blijft.
test("migratie 20260928110000: helper, gates en assertieblok", () => {
  const sql = readFileSync("supabase/migrations/20260928110000_trainer_pt_scope.sql", "utf8");
  assert.match(sql, /create or replace function tmc\.is_pt_trainer_for\(p_trainer_id uuid default null\)/);
  for (const fn of ["admin_book_pt_for_member", "admin_plan_pt_program", "get_pt_busy"]) {
    const body = sql.slice(sql.indexOf(`FUNCTION tmc.${fn}(`));
    assert.match(body.slice(0, 4000), /if not tmc\.is_pt_trainer_for\(p_trainer_id\) then/, fn);
  }
  for (const fn of ["create_pt_block", "delete_pt_block", "complete_pt_intake", "cancel_pt_intake", "mark_pt_attendance"]) {
    const body = sql.slice(sql.indexOf(`FUNCTION tmc.${fn}(`));
    assert.match(body.slice(0, 2500), /if not tmc\.is_pt_trainer_for\(\) then/, fn);
  }
  assert.match(sql, /v_is_pt_staff boolean := tmc\.is_pt_trainer_for\(\);/);
  // Geen enkele functiebody roept nog is_staff() aan: alleen commentaar en de asserties.
  const bodies = sql.split("$function$").filter((_, i) => i % 2 === 1);
  assert.ok(bodies.length >= 12, "verwacht minstens 12 functiebodies");
  for (const body of bodies) {
    assert.doesNotMatch(body, /is_staff\(\)/);
  }
  assert.match(sql, /create policy pcr_trainer_read on tmc\.pt_cancellation_requests/);
  assert.match(sql, /tmc\.is_pt_trainer_for\(\)\s*and pt_booking_id in/);
  // De policy-subquery mag geen kolom raken die authenticated niet mag lezen
  // (is_pt_available is sinds fix/trainer-rls-lockdown niet gegrant).
  const policy = sql.slice(sql.indexOf("create policy pcr_trainer_read"), sql.indexOf("-- 6. Asserties"));
  assert.doesNotMatch(policy, /is_pt_available/);
  assert.match(sql, /raise exception 'trainer_pt_scope: % roept nog tmc\.is_staff\(\) aan'/);
  assert.doesNotMatch(sql, /create or replace function tmc\.is_staff\(\)/);
  assert.doesNotMatch(sql, /revoke/i, "grants blijven ongewijzigd (keuze 6)");
  assert.doesNotMatch(sql, /—/, "geen em dashes");
});
