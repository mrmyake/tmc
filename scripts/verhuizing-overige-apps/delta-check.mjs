// Delta-check na de omschakeling: zijn er in het gedeelde project nog writes
// binnengekomen op de app-objecten sinds de baseline van copy-db.sh?
//   node delta-check.mjs <app>
// Vergelijkt out/<app>-baseline.json met een verse snapshot van de bron.
// Alleen SELECT's op het gedeelde project. Exit 1 als er verschillen zijn.
import fs from "node:fs";
import path from "node:path";
import { OUT_DIR, appConfig, endpoints, loadEnv } from "./lib/common.mjs";
import { snapshot } from "./snapshot.mjs";

const appName = process.argv[2];
if (!appName) { console.error("gebruik: node delta-check.mjs <app>"); process.exit(1); }
const app = appConfig(appName);
const baseFile = path.join(OUT_DIR, `${app.name}-baseline.json`);
if (!fs.existsSync(baseFile)) { console.error(`geen baseline: ${baseFile} (draai eerst copy-db.sh)`); process.exit(1); }
const base = JSON.parse(fs.readFileSync(baseFile, "utf8"));
const { src } = endpoints(app, loadEnv());
const now = await snapshot(app, src.dbUrl);

let diffs = 0;
console.log(`# Delta-check ${app.name} op het gedeelde project`);
console.log(`baseline ${base.takenAt}, nu ${now.takenAt}\n`);
console.log("| Tabel | rijen (baseline -> nu) | laatste tijdstempel (baseline -> nu) | ins/upd/del (baseline -> nu) |");
console.log("|---|---|---|---|");
for (const [t, b] of Object.entries(base.tables)) {
  const n = now.tables[t];
  const changed = b.rows !== n.rows || b.last !== n.last || b.ins !== n.ins || b.upd !== n.upd || b.del !== n.del;
  if (changed) diffs++;
  console.log(`| ${t}${changed ? " (GEWIJZIGD)" : ""} | ${b.rows} -> ${n.rows} | ${b.last ?? "-"} -> ${n.last ?? "-"} | ${b.ins}/${b.upd}/${b.del} -> ${n.ins}/${n.upd}/${n.del} |`);
}
console.log("\n| Bucket | objecten (baseline -> nu) | bytes (baseline -> nu) | laatste upload (baseline -> nu) |");
console.log("|---|---|---|---|");
for (const [b, s] of Object.entries(base.buckets)) {
  const n = now.buckets[b];
  const changed = s.objects !== n.objects || s.bytes !== n.bytes || s.last !== n.last;
  if (changed) diffs++;
  console.log(`| ${b}${changed ? " (GEWIJZIGD)" : ""} | ${s.objects} -> ${n.objects} | ${s.bytes} -> ${n.bytes} | ${s.last ?? "-"} -> ${n.last ?? "-"} |`);
}
console.log(diffs === 0 ? "\nResultaat: geen nieuwe writes sinds de baseline." : `\nResultaat: ${diffs} object(en) gewijzigd sinds de baseline. Her-sync nodig (copy-db.sh en copy-storage.mjs opnieuw, of gericht nasturen).`);
process.exit(diffs === 0 ? 0 : 1);
