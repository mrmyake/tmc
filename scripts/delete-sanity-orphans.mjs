#!/usr/bin/env node
// Verwijdert weesdocumenten uit Sanity (project hn9lkvte, dataset production)
// waarvan het schematype niet meer bestaat.
//
//   node scripts/delete-sanity-orphans.mjs                      dry-run, alle types
//   node scripts/delete-sanity-orphans.mjs --types=crowdfundingTier,crowdfundingSettings
//   node scripts/delete-sanity-orphans.mjs --types=faq,trainer --ids=faq-crowdfunding-1,...   selectie op _id
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
const selectedIds = (arg("ids") ?? "").split(",").filter(Boolean);

// Types die in gebruik blijven: nooit een hele type selecteren, alleen met
// een expliciete id-lijst (--ids=). Een draft (drafts.<id>) gaat altijd mee.
const LIVE_TYPES = new Set([
  "siteSettings", "siteImages", "openingHours", "trainer", "offering",
  "faq", "yogaStyle", "yogaTeacher",
]);
const liveWithoutIds = types.filter((t) => LIVE_TYPES.has(t) && selectedIds.length === 0);
if (liveWithoutIds.length) {
  console.error(`Weiger: ${liveWithoutIds.join(", ")} is een type dat blijft bestaan. Geef een expliciete lijst met --ids=.`);
  process.exit(1);
}

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

const label = (d) => d.name ?? d.question ?? d.title ?? d.headline ?? d.tierId ?? "(geen naam)";

const docs = selectedIds.length
  ? await client.fetch(
      `*[_type in $types && (_id in $ids || _id in $draftIds)] | order(_type asc, _id asc)`,
      { types, ids: selectedIds, draftIds: selectedIds.map((i) => `drafts.${i}`) }
    )
  : await client.fetch(`*[_type in $types] | order(_type asc, _id asc)`, { types });

if (selectedIds.length) {
  const found = new Set(docs.map((d) => d._id.replace(/^drafts\./, "")));
  const missing = selectedIds.filter((i) => !found.has(i));
  if (missing.length) {
    console.error(`Afgebroken: id's niet gevonden of van een ander type: ${missing.join(", ")}`);
    process.exit(1);
  }
}

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
console.log(`\nVerwijderd: ${res.results?.length ?? docs.length} documenten in één transaction. transactionId: ${res.transactionId}`);
