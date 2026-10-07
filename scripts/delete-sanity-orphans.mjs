#!/usr/bin/env node
// Verwijdert weesdocumenten uit Sanity (project hn9lkvte, dataset production)
// waarvan het schematype niet meer bestaat.
//
//   node scripts/delete-sanity-orphans.mjs                      dry-run, alle types
//   node scripts/delete-sanity-orphans.mjs --types=crowdfundingTier,crowdfundingSettings
//   node scripts/delete-sanity-orphans.mjs --export=docs/archive/x.json   schrijft herstelpunt, wijzigt niets
//   node scripts/delete-sanity-orphans.mjs --types=... --execute          verwijdert echt
//
// Token: SANITY_TOKEN uit .env.local (via --env-file). Wordt nooit geprint.
// Standaard dry-run; zonder --execute gebeurt er geen write.
import { createClient } from "@sanity/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const DEFAULT_TYPES = ["crowdfundingTier", "crowdfundingSettings", "pricingTier"];

const arg = (name) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const execute = process.argv.includes("--execute");
const exportPath = arg("export");
const types = (arg("types") ?? DEFAULT_TYPES.join(",")).split(",").filter(Boolean);

const token = process.env.SANITY_TOKEN;
if (!token) {
  console.error("SANITY_TOKEN ontbreekt. Draai met: node --env-file=.env.local scripts/delete-sanity-orphans.mjs");
  process.exit(1);
}

const client = createClient({
  projectId: "hn9lkvte",
  dataset: "production",
  apiVersion: "2024-01-01",
  token,
  useCdn: false,
  perspective: "raw", // inclusief drafts.* en versions
});

const label = (d) => d.name ?? d.title ?? d.headline ?? d.tierId ?? "(geen naam)";

const docs = await client.fetch(
  `*[_type in $types] | order(_type asc, _id asc)`,
  { types }
);

if (exportPath) {
  mkdirSync(dirname(exportPath), { recursive: true });
  writeFileSync(exportPath, JSON.stringify(docs, null, 2) + "\n");
  console.log(`Export: ${docs.length} documenten naar ${exportPath}`);
  process.exit(0);
}

console.log(`${execute ? "EXECUTE" : "DRY-RUN"}: ${docs.length} documenten, types: ${types.join(", ")}`);
for (const type of types) {
  const ofType = docs.filter((d) => d._type === type);
  console.log(`\n${type} (${ofType.length})`);
  for (const d of ofType) {
    const draft = d._id.startsWith("drafts.") ? "  [draft]" : "";
    console.log(`  ${d._id}  ${d._type}  ${label(d)}${draft}`);
  }
}

// Referentiecheck: documenten buiten de verwijderlijst die ernaar verwijzen.
const ids = docs.map((d) => d._id);
const baseIds = [...new Set(ids.map((i) => i.replace(/^drafts\./, "")))];
const referrers = ids.length
  ? await client.fetch(
      `*[references($ids) && !(_id in $ids)]{_id, _type}`,
      { ids: [...ids, ...baseIds] }
    )
  : [];
console.log(`\nReferenties van andere documenten: ${referrers.length}`);
for (const r of referrers) console.log(`  ${r._id}  ${r._type}`);

if (!execute) {
  console.log("\nDry-run, niets verwijderd. Voeg --execute toe om te verwijderen.");
  process.exit(0);
}

if (referrers.length) {
  console.error("\nAfgebroken: er zijn referenties. Niets verwijderd.");
  process.exit(1);
}

const tx = docs.reduce((t, d) => t.delete(d._id), client.transaction());
const res = await tx.commit();
console.log(`\nVerwijderd: ${res.results?.length ?? docs.length} documenten in één transaction.`);
