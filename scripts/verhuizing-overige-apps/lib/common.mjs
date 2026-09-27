// Gemeenschappelijke helpers voor de Node-scripts van de verhuizing.
// Credentials komen uit .env.local in de repo-root en worden nooit gelogd.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const SCRIPT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
export const OUT_DIR = path.join(SCRIPT_DIR, "out");
export const APPS = JSON.parse(fs.readFileSync(path.join(SCRIPT_DIR, "apps.json"), "utf8"));
export const SHARED_REF = APPS.shared.ref;

export function loadEnv() {
  const file = path.join(REPO_ROOT, ".env.local");
  if (!fs.existsSync(file)) throw new Error(`geen ${file}`);
  const env = {};
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    env[key] = val;
  }
  return env;
}

export function refFromDbUrl(u) {
  let m = u.match(/postgres\.([a-z]{20})[:@]/);
  if (m) return m[1];
  m = u.match(/db\.([a-z]{20})\.supabase\.co/);
  return m ? m[1] : "";
}

export function appConfig(name) {
  const a = APPS[name];
  if (!a || name === "shared") throw new Error(`onbekende app: ${name}`);
  return { name, ...a };
}

// Bron (gedeeld project, alleen lezen) en doel (nieuw project) uit de env.
export function endpoints(app, env) {
  const p = app.envPrefix;
  const src = { dbUrl: env.SHARED_DB_URL, restUrl: env.SHARED_SUPABASE_URL, key: env.SHARED_SERVICE_ROLE_KEY, ref: SHARED_REF };
  const dst = { dbUrl: env[`${p}_DB_URL`], restUrl: env[`${p}_SUPABASE_URL`], key: env[`${p}_SERVICE_ROLE_KEY`], ref: app.ref };
  for (const [k, v] of Object.entries({ SHARED_DB_URL: src.dbUrl, SHARED_SUPABASE_URL: src.restUrl, SHARED_SERVICE_ROLE_KEY: src.key,
    [`${p}_DB_URL`]: dst.dbUrl, [`${p}_SUPABASE_URL`]: dst.restUrl, [`${p}_SERVICE_ROLE_KEY`]: dst.key })) {
    if (!v) throw new Error(`${k} ontbreekt in .env.local`);
  }
  if (!src.dbUrl.includes(SHARED_REF) || !src.restUrl.includes(SHARED_REF)) throw new Error(`SHARED_* wijst niet naar ${SHARED_REF}`);
  return { src, dst };
}

// Guard: breekt af als het doel het gedeelde project is of niet exact de verwachte ref.
export async function guardTarget(dst, expectedRef) {
  if (dst.dbUrl.includes(SHARED_REF) || dst.restUrl.includes(SHARED_REF)) {
    throw new Error(`GUARD: doel bevat het gedeelde project ${SHARED_REF}. Stop.`);
  }
  const ref = refFromDbUrl(dst.dbUrl);
  if (ref !== expectedRef) throw new Error(`GUARD: doel-DB-ref '${ref}' is niet de verwachte ref '${expectedRef}'. Stop.`);
  if (dst.restUrl !== `https://${expectedRef}.supabase.co`) throw new Error(`GUARD: doel-REST-URL hoort https://${expectedRef}.supabase.co te zijn. Stop.`);
  const c = await connect(dst.dbUrl);
  try {
    const r = await c.query("select count(*)::int as n from pg_namespace where nspname = 'tmc'");
    if (r.rows[0].n !== 0) throw new Error("GUARD: doel-database bevat schema tmc; dit is niet het bedoelde nieuwe project. Stop.");
  } finally { await c.end(); }
  console.log(`guard ok: doel = ${expectedRef}`);
}

export async function connect(dbUrl, { readOnly = false } = {}) {
  const local = /@(127\.0\.0\.1|localhost)[:/]/.test(dbUrl);
  const c = new pg.Client({ connectionString: dbUrl, ssl: local ? false : { rejectUnauthorized: false }, statement_timeout: 120000 });
  await c.connect();
  if (readOnly) await c.query("set default_transaction_read_only = on");
  return c;
}

export function log(msg) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`); }
export function ensureOut() { fs.mkdirSync(OUT_DIR, { recursive: true }); }
