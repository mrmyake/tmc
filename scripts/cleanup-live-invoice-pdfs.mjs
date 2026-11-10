#!/usr/bin/env node
// Eenmalig: verwijdert de vijf PDF's van de verwijderde LIVE-testfacturen
// 2026.001 tot en met 2026.005 uit de bucket tmc-invoices (spec-facturatie.md
// besluit 45, migratie 20261113090000_cleanup_live_test_invoices_2026.sql).
//
// Via de storage API met de service-role client, niet via SQL op
// storage.objects. Standaard toont het script alleen wat het zou doen; met
// --apply voert het uit.
//
//   node scripts/cleanup-live-invoice-pdfs.mjs           (alleen tonen)
//   node scripts/cleanup-live-invoice-pdfs.mjs --apply   (verwijderen)
//
// De service-role sleutel wordt in dit proces opgehaald via de Supabase CLI
// (`supabase projects api-keys`) en blijft in het geheugen: hij wordt nooit
// geprint, niet naar schijf geschreven en staat niet in de shell-historie.
// Wie hem liever zelf aanlevert zet SUPABASE_SERVICE_ROLE_KEY in de omgeving.
//
// Vangrails: de paden staan letterlijk hieronder (geen patroon), elk pad moet
// een LIVE-nummer zijn (geen TEST-prefix), en --apply weigert zolang er nog
// een factuurrij naar een van de paden verwijst: het script kan dus niet voor
// de migratie draaien.

import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = "xoivleieyfcxcfawgveh";
const BUCKET = "tmc-invoices";
const PATHS = [
  "2a694f06-43a0-41d5-8500-994304ec8ef8/2026.001.pdf",
  "bc793a70-3b0a-417a-b4e9-f675e72d4950/2026.002.pdf",
  "bc793a70-3b0a-417a-b4e9-f675e72d4950/2026.003.pdf",
  "bc793a70-3b0a-417a-b4e9-f675e72d4950/2026.004.pdf",
  "bc793a70-3b0a-417a-b4e9-f675e72d4950/2026.005.pdf",
];

const apply = process.argv.includes("--apply");

function fail(message) {
  console.error(`FOUT: ${message}`);
  process.exit(1);
}

for (const p of PATHS) {
  if (!/^[0-9a-f-]{36}\/2026\.00[1-5]\.pdf$/.test(p)) fail(`onverwacht pad in de lijst: ${p}`);
}

function serviceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  for (const extra of [[], ["--reveal"]]) {
    let raw;
    try {
      raw = execFileSync(
        "supabase",
        ["projects", "api-keys", "--project-ref", PROJECT_REF, "-o", "json", ...extra],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
    } catch {
      continue;
    }
    let keys;
    try {
      const parsed = JSON.parse(raw);
      keys = Array.isArray(parsed) ? parsed : (parsed.keys ?? parsed.api_keys ?? []);
    } catch {
      continue;
    }
    const usable = (k) => typeof k?.api_key === "string" && k.api_key.length > 40 && !k.api_key.includes("·") && !k.api_key.includes("*");
    const legacy = keys.find((k) => k.name === "service_role" && usable(k));
    if (legacy) return legacy.api_key;
    const secret = keys.find((k) => k.type === "secret" && usable(k));
    if (secret) return secret.api_key;
  }
  return null;
}

const key = serviceRoleKey();
if (!key) fail("geen service-role sleutel gevonden (supabase projects api-keys of SUPABASE_SERVICE_ROLE_KEY).");

const supabase = createClient(`https://${PROJECT_REF}.supabase.co`, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "tmc" },
});

/** Alle objecten in de bucket, per profielmap. */
async function listAll() {
  const { data: folders, error } = await supabase.storage.from(BUCKET).list("", { limit: 1000 });
  if (error) fail(`bucket lezen mislukte: ${error.message}`);
  const out = [];
  for (const f of folders ?? []) {
    const { data: files, error: e2 } = await supabase.storage.from(BUCKET).list(f.name, { limit: 1000 });
    if (e2) fail(`map ${f.name} lezen mislukte: ${e2.message}`);
    if (!files || files.length === 0) {
      // Een object in de root van de bucket (geen map).
      if (f.id) out.push(f.name);
      continue;
    }
    for (const file of files) out.push(`${f.name}/${file.name}`);
  }
  return out.sort();
}

const isLive = (path) => !path.split("/").pop().startsWith("TEST-");

const before = await listAll();
const present = PATHS.filter((p) => before.includes(p));
const missing = PATHS.filter((p) => !before.includes(p));
const otherLive = before.filter((p) => isLive(p) && !PATHS.includes(p));

console.log(`Bucket ${BUCKET}: ${before.length} objecten, waarvan ${before.filter(isLive).length} LIVE en ${before.filter((p) => !isLive(p)).length} TEST.`);
console.log(`\nTe verwijderen (${present.length} van ${PATHS.length} aanwezig):`);
for (const p of PATHS) console.log(`  ${before.includes(p) ? "aanwezig " : "ontbreekt"}  ${p}`);
if (otherLive.length > 0) {
  console.log("\nAndere LIVE-objecten, staan NIET in de lijst en blijven staan:");
  for (const p of otherLive) console.log(`  ${p}`);
}

// Verwijst er nog een factuurrij naar een van de paden? Dan is de migratie
// nog niet toegepast.
const { data: rows, error: rowsErr } = await supabase
  .from("invoices")
  .select("invoice_number, pdf_path")
  .in("pdf_path", PATHS);
if (rowsErr) fail(`tmc.invoices lezen mislukte: ${rowsErr.message}`);
const stillReferenced = rows ?? [];
if (stillReferenced.length > 0) {
  console.log(`\nNog ${stillReferenced.length} factuurrij(en) verwijzen naar deze paden: ${stillReferenced.map((r) => r.invoice_number).join(", ")}.`);
}

if (!apply) {
  console.log("\nAlleen getoond, er is niets verwijderd. Draai met --apply om te verwijderen.");
  process.exit(0);
}

if (stillReferenced.length > 0) {
  fail("de migratie 20261113090000 is nog niet toegepast; er wordt niets verwijderd.");
}
if (present.length === 0) {
  console.log("\nNiets te verwijderen.");
  process.exit(0);
}

const { data: removed, error: rmErr } = await supabase.storage.from(BUCKET).remove(present);
if (rmErr) fail(`verwijderen mislukte: ${rmErr.message}`);
console.log(`\nVerwijderd: ${(removed ?? []).length} objecten.`);
for (const r of removed ?? []) console.log(`  ${r.name}`);

const after = await listAll();
const leftLive = after.filter(isLive);
console.log(`\nNa afloop: ${after.length} objecten, waarvan ${leftLive.length} LIVE en ${after.length - leftLive.length} TEST.`);
for (const p of after) console.log(`  ${p}`);
if (missing.length > 0) console.log(`\nStond er al niet: ${missing.join(", ")}`);
if (after.some((p) => PATHS.includes(p))) fail("een van de paden staat er nog.");
if (after.length - leftLive.length !== before.filter((p) => !isLive(p)).length) {
  fail("het aantal TEST-objecten is veranderd.");
}
