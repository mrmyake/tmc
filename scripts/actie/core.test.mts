// Actiepagina's (spec-proefles-funnel.md): het ondertekende slug-cookie, het
// pijlerfilter en de roosterpreview. Pure logica, zonder Next.js of database.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIE_TTL_SECONDS,
  buildActieCookieValue,
  displayScopeFor,
  isActieSlug,
  parseActieCookieValue,
} from "../../src/lib/actie/core.ts";
import {
  mergePreviewItems,
  previewStatus,
  vrijTrainenPreviewItems,
  type PreviewItem,
} from "../../src/lib/actie/rooster-core.ts";
import { pillarsForScope } from "../../src/lib/trial-codes/scope.ts";

const SECRET = "test-secret";
const NOW = 1_800_000_000;

test("slug: alleen kleine letters, cijfers en streepjes, hoogstens 64 tekens", () => {
  for (const ok of ["meta-ig", "google-kettlebell", "a", "x".repeat(64)]) {
    assert.equal(isActieSlug(ok), true, ok);
  }
  for (const bad of ["", "Meta-IG", "meta_ig", "meta ig", "a/b", "a.b", "x".repeat(65), null, 5]) {
    assert.equal(isActieSlug(bad), false, String(bad));
  }
});

test("cookie: rondgang, en de waarde bevat alleen slug, verlooptijd en handtekening", () => {
  const built = buildActieCookieValue("meta-ig", SECRET, NOW);
  assert.ok(built);
  assert.equal(built.expiresAt, NOW + ACTIE_TTL_SECONDS);
  const parts = built.value.split(".");
  assert.equal(parts.length, 3);
  assert.equal(parts[0], "meta-ig");
  assert.equal(parseActieCookieValue(built.value, SECRET, NOW + 10), "meta-ig");
});

test("cookie: verlopen, gemanipuleerd, andere sleutel of rommel geeft null", () => {
  const built = buildActieCookieValue("meta-ig", SECRET, NOW)!;
  const [slug, exp, sig] = built.value.split(".");
  assert.equal(parseActieCookieValue(built.value, SECRET, NOW + ACTIE_TTL_SECONDS), null);
  assert.equal(parseActieCookieValue(`google-yoga.${exp}.${sig}`, SECRET, NOW), null);
  assert.equal(parseActieCookieValue(`${slug}.${Number(exp) + 999}.${sig}`, SECRET, NOW), null);
  assert.equal(parseActieCookieValue(built.value, "andere-sleutel", NOW), null);
  assert.equal(parseActieCookieValue(built.value, "", NOW), null);
  for (const junk of ["", null, undefined, "a.b", "a.b.c.d", "meta-ig.abc.def", "META.1.x"]) {
    assert.equal(parseActieCookieValue(junk, SECRET, NOW), null, String(junk));
  }
});

test("cookie: zonder sleutel of met een ongeldige slug wordt er niets gebouwd", () => {
  assert.equal(buildActieCookieValue("meta-ig", "", NOW), null);
  assert.equal(buildActieCookieValue("Meta IG", SECRET, NOW), null);
});

test("cookie: een handtekening van het proefcode-cookie is hier niet geldig", async () => {
  // Het proefcode-cookie tekent `${code}.${exp}` met dezelfde sleutel; het
  // actie-cookie tekent `actie.${slug}.${exp}`. Een code-cookie met een
  // slugvormige waarde mag dus nooit als actie-cookie doorgaan.
  const { createHmac } = await import("node:crypto");
  const exp = NOW + 100;
  const sig = createHmac("sha256", SECRET).update(`meta-ig.${exp}`).digest("base64url");
  assert.equal(parseActieCookieValue(`meta-ig.${exp}.${sig}`, SECRET, NOW), null);
});

test("pijlerfilter: versmalt alleen binnen de scope van de code", () => {
  assert.equal(displayScopeFor("all", null), "all");
  assert.equal(displayScopeFor("all", "kettlebell"), "kettlebell");
  assert.equal(displayScopeFor("all", "yoga_mobility"), "yoga_mobility");
  assert.equal(displayScopeFor("all", "vrij_trainen"), "vrij_trainen");
  assert.equal(displayScopeFor("group", "kettlebell"), "kettlebell");
  // Buiten de scope: het filter vervalt, de scope van de code geldt.
  assert.equal(displayScopeFor("group", "vrij_trainen"), "group");
  assert.equal(displayScopeFor("kettlebell", "yoga_mobility"), "kettlebell");
  assert.equal(displayScopeFor("vrij_trainen", "kettlebell"), "vrij_trainen");
  assert.equal(displayScopeFor("kettlebell", "kettlebell"), "kettlebell");
});

test("pijler-whitelist: pillarsForScope is gelijk aan de lijst in tmc.redeem_trial_code", () => {
  // Spiegel van v_allowed in migratie 20261117090000_campaign_landings.sql.
  // Wijzigt een van beide, dan moet de ander mee (B9).
  const SQL_ALLOWED: Record<string, string[]> = {
    yoga_mobility: ["yoga_mobility"],
    kettlebell: ["kettlebell"],
    group: ["yoga_mobility", "kettlebell", "kids", "senior"],
    all: ["yoga_mobility", "kettlebell", "kids", "senior"],
    vrij_trainen: [],
  };
  for (const [scope, pillars] of Object.entries(SQL_ALLOWED)) {
    assert.deepEqual(pillarsForScope(scope as Parameters<typeof pillarsForScope>[0]), pillars);
  }
});

test("status: bijna vol bij 2 of minder vrije plekken, onbeperkt is vrij", () => {
  assert.equal(previewStatus(null), "free");
  assert.equal(previewStatus(8), "free");
  assert.equal(previewStatus(3), "free");
  assert.equal(previewStatus(2), "few");
  assert.equal(previewStatus(1), "few");
});

const T0 = Date.parse("2026-11-17T06:00:00Z"); // 07:00 Amsterdam
const q = (offsetMin: number, available = 5, blocked = false) => ({
  quarterStart: new Date(T0 + offsetMin * 60_000).toISOString(),
  booked: 5 - available,
  available,
  blocked,
});
const range = (fromMin: number, toMin: number, available = 5) =>
  Array.from({ length: (toMin - fromMin) / 15 }, (_, i) => q(fromMin + i * 15, available));

test("vrij trainen: een rij per aanwezigheidsblok, de eerste start waar een uur past", () => {
  // Ochtend 07:00 tot 12:00 en avond 17:00 tot 21:00.
  const quarters = [...range(0, 300), ...range(600, 840)];
  const items = vrijTrainenPreviewItems("s1", quarters, T0 - 60_000);
  assert.equal(items.length, 2);
  assert.equal(items[0].startAt, new Date(T0).toISOString());
  assert.equal(items[0].endAt, new Date(T0 + 60 * 60_000).toISOString());
  assert.equal(items[1].startAt, new Date(T0 + 600 * 60_000).toISOString());
  assert.equal(items[0].kind, "vrij");
  assert.equal(items[0].status, "free");
});

test("vrij trainen: verleden, blokkade en vol schuiven de start op; krapste kwartier bepaalt de status", () => {
  // Nu is 07:20: 07:00 en 07:15 zijn voorbij, dus de eerste start is 07:30.
  const items = vrijTrainenPreviewItems("s1", range(0, 300), T0 + 20 * 60_000);
  assert.equal(items[0].startAt, new Date(T0 + 30 * 60_000).toISOString());

  // Les van 07:00 tot 08:00 blokkeert; de eerste start is 08:00.
  const blocked = [q(0, 5, true), q(15, 5, true), q(30, 5, true), q(45, 5, true), ...range(60, 300)];
  assert.equal(
    vrijTrainenPreviewItems("s1", blocked, T0 - 1)[0].startAt,
    new Date(T0 + 60 * 60_000).toISOString(),
  );

  // Derde kwartier van het uur heeft nog 2 plekken: bijna vol.
  const tight = [q(0), q(15), q(30, 2), q(45), ...range(60, 120)];
  assert.equal(vrijTrainenPreviewItems("s1", tight, T0 - 1)[0].status, "few");

  // Een blok waar geen heel uur in past levert niets op.
  assert.deepEqual(vrijTrainenPreviewItems("s1", range(0, 45), T0 - 1), []);
  // Alles vol: niets.
  assert.deepEqual(vrijTrainenPreviewItems("s1", range(0, 300, 0), T0 - 1), []);
});

const item = (key: string, kind: "class" | "vrij", hour: number): PreviewItem => ({
  key,
  kind,
  startAt: new Date(T0 + hour * 3_600_000).toISOString(),
  endAt: new Date(T0 + (hour + 1) * 3_600_000).toISOString(),
  title: key,
  status: "free",
});

test("samenvoegen: op starttijd, hoogstens limit rijen, en bij alles een vrij-trainen-rij", () => {
  const classes = [item("c1", "class", 2), item("c2", "class", 12), item("c3", "class", 26), item("c4", "class", 30)];
  const vrij = [item("v1", "vrij", 0), item("v2", "vrij", 10), item("v3", "vrij", 24)];
  assert.deepEqual(
    mergePreviewItems(classes, vrij, 4, 1).map((i) => i.key),
    ["v1", "c1", "c2", "c3"],
  );
  assert.deepEqual(
    mergePreviewItems([], vrij, 4, null).map((i) => i.key),
    ["v1", "v2", "v3"],
  );
  assert.deepEqual(
    mergePreviewItems(classes, [], 2, null).map((i) => i.key),
    ["c1", "c2"],
  );
});
