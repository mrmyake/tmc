// Kopieert de buckets van een app (instellingen, objecten met ongewijzigde paden,
// en de storage-policies die op die buckets slaan) van het gedeelde project naar
// het nieuwe project. Idempotent: bestaande doelobjecten met gelijke grootte
// worden overgeslagen, afwijkende overschreven.
//   node copy-storage.mjs <app>
// Bron: alleen lezen (SELECT op storage.buckets/objects/pg_policies + downloads).
import { createClient } from "@supabase/supabase-js";
import { appConfig, connect, endpoints, guardTarget, loadEnv, log } from "./lib/common.mjs";

const appName = process.argv[2];
if (!appName) { console.error("gebruik: node copy-storage.mjs <app>"); process.exit(1); }
const app = appConfig(appName);
const { src, dst } = endpoints(app, loadEnv());
await guardTarget(dst, app.ref);

const srcApi = createClient(src.restUrl, src.key, { auth: { persistSession: false } });
const dstApi = createClient(dst.restUrl, dst.key, { auth: { persistSession: false } });
const srcDb = await connect(src.dbUrl, { readOnly: true });
const dstDb = await connect(dst.dbUrl);

const CONCURRENCY = 4;
let copied = 0, skipped = 0, failed = 0;

try {
  for (const bucket of app.buckets) {
    const { rows: [b] } = await srcDb.query(
      "select id, name, public, file_size_limit, allowed_mime_types from storage.buckets where id = $1", [bucket]);
    if (!b) throw new Error(`bron heeft geen bucket ${bucket}`);
    const opts = { public: b.public, fileSizeLimit: b.file_size_limit ?? undefined, allowedMimeTypes: b.allowed_mime_types ?? undefined };
    const { data: existing } = await dstApi.storage.getBucket(bucket);
    if (existing) {
      const { error } = await dstApi.storage.updateBucket(bucket, opts);
      if (error) throw new Error(`updateBucket ${bucket}: ${error.message}`);
      log(`bucket ${bucket}: bestaat, instellingen bijgewerkt (public=${b.public})`);
    } else {
      const { error } = await dstApi.storage.createBucket(bucket, opts);
      if (error) throw new Error(`createBucket ${bucket}: ${error.message}`);
      log(`bucket ${bucket}: aangemaakt (public=${b.public}, limit=${b.file_size_limit ?? "-"}, mime=${(b.allowed_mime_types ?? []).join(",") || "-"})`);
    }

    const { rows: objects } = await srcDb.query(
      "select name, (metadata->>'size')::bigint as size, metadata->>'mimetype' as mimetype, metadata->>'cacheControl' as cache from storage.objects where bucket_id = $1 order by name", [bucket]);
    const { rows: present } = await dstDb.query(
      "select name, (metadata->>'size')::bigint as size from storage.objects where bucket_id = $1", [bucket]);
    const presentMap = new Map(present.map((o) => [o.name, Number(o.size)]));
    log(`bucket ${bucket}: ${objects.length} objecten in bron, ${present.length} al in doel`);

    let idx = 0;
    const worker = async () => {
      while (idx < objects.length) {
        const o = objects[idx++];
        if (presentMap.get(o.name) === Number(o.size)) { skipped++; continue; }
        try {
          const { data: blob, error: dErr } = await srcApi.storage.from(bucket).download(o.name);
          if (dErr) throw new Error(`download: ${dErr.message}`);
          const buf = Buffer.from(await blob.arrayBuffer());
          if (buf.length !== Number(o.size)) throw new Error(`grootte ${buf.length} wijkt af van bron ${o.size}`);
          const cacheControl = o.cache ? (o.cache.match(/max-age=(\d+)/)?.[1] ?? undefined) : undefined;
          const { error: uErr } = await dstApi.storage.from(bucket).upload(o.name, buf, {
            contentType: o.mimetype ?? undefined, cacheControl, upsert: true });
          if (uErr) throw new Error(`upload: ${uErr.message}`);
          copied++;
        } catch (e) {
          failed++;
          log(`  FOUT ${bucket}/${o.name}: ${e.message}`);
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    log(`bucket ${bucket}: klaar (totaal tot nu: ${copied} gekopieerd, ${skipped} overgeslagen, ${failed} mislukt)`);
  }

  // Storage-policies die op deze buckets slaan, opnieuw aanmaken via SQL.
  const { rows: policies } = await srcDb.query(
    `select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
     from pg_policies where schemaname = 'storage'`);
  const relevant = policies.filter((p) => app.buckets.some((b) => (p.qual ?? "").includes(`'${b}'`) || (p.with_check ?? "").includes(`'${b}'`)));
  for (const p of relevant) {
    const roles = p.roles.map((r) => (r === "public" ? "public" : `"${r}"`)).join(", ");
    const sql = `create policy "${p.policyname}" on storage.${p.tablename} as ${p.permissive.toLowerCase()} for ${p.cmd.toLowerCase()} to ${roles}` +
      (p.qual ? ` using (${p.qual})` : "") + (p.with_check ? ` with check (${p.with_check})` : "");
    await dstDb.query(`drop policy if exists "${p.policyname}" on storage.${p.tablename}`);
    await dstDb.query(sql);
    log(`policy "${p.policyname}" op storage.${p.tablename} aangemaakt`);
  }
  if (relevant.length === 0) log("geen storage-policies voor deze buckets in de bron");
} finally {
  await srcDb.end(); await dstDb.end();
}
log(`klaar: ${copied} gekopieerd, ${skipped} overgeslagen, ${failed} mislukt`);
process.exit(failed === 0 ? 0 : 1);
