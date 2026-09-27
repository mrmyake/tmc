// Verify met diff-rapport: vergelijkt de app-objecten in bron en doel.
//   node verify.mjs <app> [--schema-only] [--target-db-url <url>]
// Vergelijkt per schema: kolommen, rijen per tabel, sequences (definitie en waarde),
// md5 van pg_get_functiondef per functie, views, triggers, indexes, constraints,
// policies, RLS-vlaggen, grants (tabellen, sequences, schema), default privileges,
// enum-types, extensies; en per bucket instellingen, aantal objecten, totale
// grootte, md5 van de objectlijst en de storage-policies.
// --schema-only laat rijen, sequence-waarden en storage weg (voor de migratiecheck).
// --target-db-url vergelijkt met een andere database dan het doelproject (scratch).
// Beide kanten worden alleen gelezen. Exit 1 bij verschillen.
import fs from "node:fs";
import path from "node:path";
import { OUT_DIR, appConfig, connect, endpoints, ensureOut, loadEnv } from "./lib/common.mjs";

const args = process.argv.slice(2);
const appName = args.find((a) => !a.startsWith("--"));
const schemaOnly = args.includes("--schema-only");
const tIdx = args.indexOf("--target-db-url");
const targetOverride = tIdx >= 0 ? args[tIdx + 1] : null;
if (!appName) { console.error("gebruik: node verify.mjs <app> [--schema-only] [--target-db-url <url>]"); process.exit(1); }
const app = appConfig(appName);
const { src, dst } = endpoints(app, loadEnv());
const targetUrl = targetOverride ?? dst.dbUrl;
const targetLabel = targetOverride ? "scratch" : dst.ref;

const Q = {
  column: `select 'column' k, table_schema||'.'||table_name||'.'||column_name key,
      concat_ws(' ', data_type, udt_name, 'null='||is_nullable, 'default='||coalesce(column_default,'-'), 'pos='||ordinal_position) v
    from information_schema.columns where table_schema = any($1)`,
  relation: `select 'relation' k, n.nspname||'.'||c.relname key, c.relkind::text v
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname = any($1) and c.relkind in ('r','p','v','m','S')`,
  sequence_def: `select 'sequence_def' k, schemaname||'.'||sequencename key, concat_ws(' ', data_type, 'start='||start_value, 'inc='||increment_by, 'cycle='||cycle) v
    from pg_sequences where schemaname = any($1)`,
  sequence_val: `select 'sequence_val' k, schemaname||'.'||sequencename key, coalesce(last_value::text,'not-called') v from pg_sequences where schemaname = any($1)`,
  function: `select 'function' k, n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' key, md5(pg_get_functiondef(p.oid)) v
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname = any($1)`,
  view: `select 'view' k, schemaname||'.'||viewname key, md5(definition) v from pg_views where schemaname = any($1)`,
  trigger: `select 'trigger' k, n.nspname||'.'||c.relname||'.'||t.tgname key, pg_get_triggerdef(t.oid)||' enabled='||t.tgenabled::text v
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname = any($1) and not t.tgisinternal`,
  index: `select 'index' k, schemaname||'.'||indexname key, indexdef v from pg_indexes where schemaname = any($1)`,
  constraint: `select 'constraint' k, n.nspname||'.'||c.relname||'.'||con.conname key, con.contype::text||' '||pg_get_constraintdef(con.oid)||' validated='||con.convalidated v
    from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname = any($1)`,
  policy: `select 'policy' k, schemaname||'.'||tablename||'.'||policyname key,
      concat_ws(' | ', permissive, cmd, array_to_string(roles,','), coalesce(qual,'-'), coalesce(with_check,'-')) v
    from pg_policies where schemaname = any($1)`,
  rls: `select 'rls' k, n.nspname||'.'||c.relname key, 'enabled='||c.relrowsecurity||' forced='||c.relforcerowsecurity v
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname = any($1) and c.relkind in ('r','p')`,
  grant_table: `select 'grant_table' k, table_schema||'.'||table_name||' -> '||grantee key, string_agg(privilege_type||case when is_grantable='YES' then '*' else '' end, ',' order by privilege_type) v
    from information_schema.role_table_grants where table_schema = any($1) group by 1,2`,
  grant_sequence: `select 'grant_sequence' k, object_schema||'.'||object_name||' -> '||grantee key, string_agg(privilege_type, ',' order by privilege_type) v
    from information_schema.role_usage_grants where object_schema = any($1) and object_type='SEQUENCE' group by 1,2`,
  grant_schema: `select 'grant_schema' k, nspname key, coalesce((select string_agg(a::text, ';' order by a::text) from unnest(nspacl) a), '-') v from pg_namespace where nspname = any($1)`,
  default_privs: `select 'default_privs' k, n.nspname||' '||defaclrole::regrole::text||' '||defaclobjtype::text key, (select string_agg(a::text, ';' order by a::text) from unnest(defaclacl) a) v
    from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace where n.nspname = any($1)`,
  type: `select 'type' k, n.nspname||'.'||t.typname key, t.typtype::text||' '||coalesce((select string_agg(enumlabel, ',' order by enumsortorder) from pg_enum e where e.enumtypid=t.oid),'') v
    from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname = any($1) and t.typtype in ('e','d','c','r')
      and not exists (select 1 from pg_class c where c.reltype=t.oid)`,
  extension: `select 'extension' k, extname key, extnamespace::regnamespace::text||' v'||extversion v from pg_extension`,
};
const STORAGE = {
  bucket: `select 'bucket' k, id key, concat_ws(' ', 'public='||public, 'limit='||coalesce(file_size_limit::text,'-'), 'mime='||coalesce(array_to_string(allowed_mime_types,','),'-')) v
    from storage.buckets where id = any($1)`,
  objects: `select 'objects' k, b key, (select concat_ws(' ', 'n='||count(*), 'bytes='||coalesce(sum((metadata->>'size')::bigint),0),
      'md5='||md5(coalesce(string_agg(name||':'||(metadata->>'size'), '\n' order by name),''))) from storage.objects where bucket_id=b) v
    from unnest($1::text[]) b`,
  storage_policy: `select 'storage_policy' k, tablename||'.'||policyname key, concat_ws(' | ', permissive, cmd, array_to_string(roles,','), coalesce(qual,'-'), coalesce(with_check,'-')) v
    from pg_policies where schemaname='storage' and exists (select 1 from unnest($1::text[]) b where coalesce(qual,'') like '%'''||b||'''%' or coalesce(with_check,'') like '%'''||b||'''%')`,
};

async function fingerprint(dbUrl) {
  const c = await connect(dbUrl, { readOnly: true });
  const map = new Map();
  try {
    for (const [name, sql] of Object.entries(Q)) {
      if (schemaOnly && name === "sequence_val") continue;
      const r = await c.query(sql, name === "extension" ? [] : [app.schemas]);
      for (const row of r.rows) map.set(`${row.k} ${row.key}`, row.v);
    }
    if (!schemaOnly) {
      const rels = await c.query("select n.nspname s, c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname = any($1) and c.relkind in ('r','p') order by 1,2", [app.schemas]);
      for (const { s, t } of rels.rows) {
        const r = await c.query(`select count(*)::text n from "${s}"."${t}"`);
        map.set(`rows ${s}.${t}`, r.rows[0].n);
      }
      for (const [name, sql] of Object.entries(STORAGE)) {
        const r = await c.query(sql, [app.buckets]);
        for (const row of r.rows) map.set(`${row.k} ${row.key}`, row.v);
      }
    }
  } finally { await c.end(); }
  return map;
}

const a = await fingerprint(src.dbUrl);
const b = await fingerprint(targetUrl);
const keys = [...new Set([...a.keys(), ...b.keys()])].sort();
const lines = [];
let diffs = 0;
const counts = {};
for (const k of keys) {
  const kind = k.split(" ")[0];
  counts[kind] = (counts[kind] ?? 0) + 1;
  const va = a.get(k), vb = b.get(k);
  if (va === vb) continue;
  diffs++;
  if (va === undefined) lines.push(`- EXTRA IN DOEL: ${k} = ${vb}`);
  else if (vb === undefined) lines.push(`- ONTBREEKT IN DOEL: ${k} (bron: ${va})`);
  else lines.push(`- VERSCHIL: ${k}\n    bron: ${va}\n    doel: ${vb}`);
}
const report = [
  `# Verify ${app.name}: ${src.ref} (bron) versus ${targetLabel} (doel)${schemaOnly ? " [schema-only]" : ""}`,
  `Datum: ${new Date().toISOString()}. Scope: schema's ${app.schemas.join(", ")}${schemaOnly ? "" : `, buckets ${app.buckets.join(", ")}`}.`,
  "",
  "| Soort | vergeleken |", "|---|---|",
  ...Object.entries(counts).sort().map(([k, n]) => `| ${k} | ${n} |`),
  "",
  diffs === 0 ? `Resultaat: ${keys.length} kenmerken vergeleken, 0 verschillen.` : `Resultaat: ${keys.length} kenmerken vergeleken, ${diffs} verschil(len):`,
  ...lines, "",
].join("\n");
console.log(report);
ensureOut();
fs.writeFileSync(path.join(OUT_DIR, `${app.name}-verify${schemaOnly ? "-schema" : ""}${targetOverride ? "-scratch" : ""}.md`), report);
process.exit(diffs === 0 ? 0 : 1);
