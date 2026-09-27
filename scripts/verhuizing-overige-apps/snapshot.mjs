// Snapshot van de schrijfstand van de app-objecten: rijen, laatste tijdstempel en
// pg_stat-tellers per tabel, plus aantal en laatste upload per bucket.
//   node snapshot.mjs <app> <source|target> [outfile]
// Alleen SELECT's. Gebruikt door copy-db.sh (baseline) en delta-check.mjs.
import fs from "node:fs";
import { appConfig, connect, endpoints, loadEnv } from "./lib/common.mjs";

export async function snapshot(app, dbUrl) {
  const c = await connect(dbUrl, { readOnly: true });
  try {
    const out = { takenAt: new Date().toISOString(), tables: {}, buckets: {} };
    for (const t of app.deltaTables) {
      const [schema, name] = t.table.split(".");
      const cnt = await c.query(`select count(*)::int as n${t.ts ? `, max(${t.ts})::text as last` : ""} from ${t.table}`);
      const st = await c.query(
        "select n_tup_ins, n_tup_upd, n_tup_del from pg_stat_user_tables where schemaname = $1 and relname = $2", [schema, name]);
      out.tables[t.table] = { rows: cnt.rows[0].n, last: cnt.rows[0].last ?? null,
        ins: st.rows[0]?.n_tup_ins ?? null, upd: st.rows[0]?.n_tup_upd ?? null, del: st.rows[0]?.n_tup_del ?? null };
    }
    for (const b of app.buckets) {
      const r = await c.query(
        "select count(*)::int as n, coalesce(sum((metadata->>'size')::bigint),0)::text as bytes, max(created_at)::text as last from storage.objects where bucket_id = $1", [b]);
      out.buckets[b] = { objects: r.rows[0].n, bytes: r.rows[0].bytes, last: r.rows[0].last };
    }
    return out;
  } finally { await c.end(); }
}

if (process.argv[1] && process.argv[1].endsWith("snapshot.mjs")) {
  const [appName, side, outfile] = process.argv.slice(2);
  if (!appName || !["source", "target"].includes(side)) {
    console.error("gebruik: node snapshot.mjs <app> <source|target> [outfile]"); process.exit(1);
  }
  const app = appConfig(appName);
  const { src, dst } = endpoints(app, loadEnv());
  const snap = await snapshot(app, side === "source" ? src.dbUrl : dst.dbUrl);
  snap.side = side; snap.ref = side === "source" ? src.ref : dst.ref;
  const json = JSON.stringify(snap, null, 2);
  if (outfile) fs.writeFileSync(outfile, json + "\n");
  console.log(json);
}
