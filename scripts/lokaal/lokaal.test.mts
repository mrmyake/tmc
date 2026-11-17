import { test } from "node:test";
import assert from "node:assert/strict";
import { bouwDagbalk } from "../../src/lib/lokaal/dagbalk.ts";
import { conceptRedirectHref, fallbackHref, resolveHref } from "../../src/lib/lokaal/links.ts";
import { lokaalMetadata } from "../../src/lib/lokaal/metadata.ts";
import { LOKALE_PAGINAS, LOKAAL_SLUGS } from "../../src/content/lokaal/index.ts";

// Lokale dienst- en locatiepagina's (spec-locatiepaginas.md): de dagbalk uit de
// bestaande tijdbronnen, de 307-terugval en de links naar concept-pagina's.

const WEEK = [
  ...["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag"].map((day) => ({
    day, open: "07:00", close: "22:00", closed: false,
  })),
  ...["Zaterdag", "Zondag"].map((day) => ({
    day, open: "08:00", close: "14:00", closed: false,
  })),
];

const PRESENCE = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, from: "07:00", to: "12:00" },
  { weekday, from: "17:00", to: "21:00" },
]);

test("dagbalk groepeert dagen met gelijke tijden en zet de Marlon-vensters op de as", () => {
  const d = bouwDagbalk(WEEK, PRESENCE);
  assert.deepEqual(d.rijen.map((r) => r.label), ["ma t/m vr", "za en zo"]);
  // As 07 tot 22 uur (900 min): 07:00 = 0%, 12:00 = 33,3%.
  const werkweek = d.rijen[0];
  assert.equal(Math.round(werkweek.open!.left), 0);
  assert.equal(Math.round(werkweek.open!.width), 100);
  assert.equal(werkweek.marlon.length, 2);
  assert.equal(Math.round(werkweek.marlon[0].width * 10) / 10, 33.3);
  // Weekend: geen vensters van Marlon.
  assert.equal(d.rijen[1].marlon.length, 0);
});

test("dagbalk is leeg zonder geopende dagen en toont zonder presence alleen openingstijden", () => {
  assert.deepEqual(bouwDagbalk([], PRESENCE), { rijen: [], ticks: [] });
  const zonder = bouwDagbalk(WEEK, []);
  assert.equal(zonder.rijen[0].marlon.length, 0);
  assert.ok(zonder.rijen[0].open);
});

const alsConcept = (slug: (typeof LOKAAL_SLUGS)[number]) =>
  ({ ...LOKALE_PAGINAS[slug], status: "concept" }) as never;

test("zeven pagina's staan op live, /mobility blijft concept", () => {
  assert.equal(LOKAAL_SLUGS.length, 8);
  for (const slug of LOKAAL_SLUGS) {
    const verwacht = slug === "mobility" ? "concept" : "live";
    assert.equal(LOKALE_PAGINAS[slug].status, verwacht, slug);
    assert.equal(LOKALE_PAGINAS[slug].bijgewerkt, "2026-11-17", slug);
  }
});

test("production: /mobility geeft een 307 naar /aanbod", () => {
  assert.equal(conceptRedirectHref(LOKALE_PAGINAS.mobility, "production"), "/aanbod");
});

test("geen mobility als groepsles op de zeven live pagina's", () => {
  for (const slug of LOKAAL_SLUGS) {
    if (slug === "mobility") continue;
    assert.ok(!/mobility/i.test(JSON.stringify(LOKALE_PAGINAS[slug])), slug);
  }
});

test("lege ptTijden rendert niets en de basisbewegingen zijn tekstkaarten", () => {
  const kb = LOKALE_PAGINAS["kettlebell-training"];
  assert.equal(kb.status, "live");
  if ("basis" in kb && kb.basis) {
    assert.equal(kb.basis.items.length, 3);
    for (const i of kb.basis.items) assert.ok(!i.beeld, i.titel);
  }
});

test("een conceptpagina valt terug op de juiste route", () => {
  const route = (slug: (typeof LOKAAL_SLUGS)[number]) => fallbackHref(alsConcept(slug));
  assert.equal(route("personal-trainer-hilversum"), "/personal-trainer-gooi");
  assert.equal(route("personal-trainer-bussum"), "/personal-trainer-gooi");
  assert.equal(route("personal-trainer-laren"), "/personal-trainer-gooi");
  assert.equal(route("personal-trainer-gooi"), "/aanbod");
  assert.equal(route("kettlebell-training"), "/aanbod");
});

test("links naar live pagina's blijven, andere interne links ook", () => {
  assert.equal(resolveHref("/kettlebell-training"), "/kettlebell-training");
  assert.equal(resolveHref("/personal-trainer-hilversum"), "/personal-trainer-hilversum");
  assert.equal(resolveHref("/proefles?kaart=bellen"), "/proefles?kaart=bellen");
  assert.equal(resolveHref("/aanbod#vrij-trainen"), "/aanbod#vrij-trainen");
});

test("CTA's dragen geen UTM-parameters", () => {
  const json = JSON.stringify(LOKALE_PAGINAS);
  assert.ok(!json.includes("utm_"));
});

test("geen em dashes in de content", () => {
  const json = JSON.stringify(LOKALE_PAGINAS);
  assert.ok(!json.includes("—") && !json.includes("–"));
});

test("production: een conceptpagina geeft een 307-route, nooit null", () => {
  for (const slug of LOKAAL_SLUGS) {
    const href = conceptRedirectHref(alsConcept(slug), "production");
    assert.equal(href, fallbackHref(alsConcept(slug)), slug);
    assert.ok(href && href.startsWith("/"), slug);
  }
});

test("preview en lokaal: een conceptpagina rendert (geen redirect)", () => {
  for (const slug of LOKAAL_SLUGS) {
    assert.equal(conceptRedirectHref(alsConcept(slug), "preview"), null, slug);
    assert.equal(conceptRedirectHref(alsConcept(slug), "development"), null, slug);
    assert.equal(conceptRedirectHref(alsConcept(slug), undefined), null, slug);
  }
});

test("een live pagina redirect nooit, ook niet in production", () => {
  for (const slug of LOKAAL_SLUGS) {
    if (slug === "mobility") continue;
    assert.equal(conceptRedirectHref(LOKALE_PAGINAS[slug], "production"), null, slug);
  }
});

test("conceptpagina krijgt robots noindex en nofollow, een live pagina niet", () => {
  for (const slug of LOKAAL_SLUGS) {
    const m = lokaalMetadata(alsConcept(slug));
    assert.deepEqual(m.robots, { index: false, follow: false }, slug);
    if (slug !== "mobility") {
      assert.equal(lokaalMetadata(LOKALE_PAGINAS[slug]).robots, undefined, slug);
    }
    assert.equal(m.alternates?.canonical, `/${slug}`);
  }
});

test("inhoudsregels: geen verboden claims in de content", () => {
  const json = JSON.stringify(LOKALE_PAGINAS);
  assert.ok(!json.includes("±"), "geen ± bij reistijden");
  assert.ok(!/25\+/.test(json), "geen 25+ reviews");
  assert.ok(!/gratis parkeren|parkeren gratis/i.test(json), "parkeren is nooit gratis");
  assert.ok(!/bootcamp/i.test(json), "geen kettlebell bootcamp");
  assert.ok(!/\b10 minuten\b/.test(json), "Hilversum is 12 minuten");
  assert.ok(!/Kettlebell Master/.test(json), "het is Master Kettlebell");
  assert.ok(!/schema in de app|met schema/i.test(json), "geen schema-claim bij vrij trainen");
});

test("quotes hebben woonplaats, bron en toestemmingsdatum; reistijden kloppen met de meting", () => {
  const h = LOKALE_PAGINAS["personal-trainer-hilversum"];
  const b = LOKALE_PAGINAS["personal-trainer-bussum"];
  const l = LOKALE_PAGINAS["personal-trainer-laren"];
  for (const p of [h, b, l]) {
    assert.equal(p.status, "live");
    if (p.status !== "live" || !("quote" in p)) continue;
    assert.ok(p.quote.woonplaats && p.quote.bron && p.quote.toestemmingsdatum);
    assert.ok(!("wijk" in p.quote));
  }
  const hub = LOKALE_PAGINAS["personal-trainer-gooi"];
  assert.equal(hub.status, "live");
  if (hub.status === "live" && "plaatsen" in hub) {
    const t = Object.fromEntries(hub.plaatsen.map((x) => [x.naam, [x.reistijdAutoMin, x.reistijdFietsMin]]));
    assert.deepEqual(t, {
      Hilversum: [12, 19], Bussum: [20, 34], Laren: [18, 36], Blaricum: [21, 47],
      Huizen: [23, 53], Naarden: [25, 43], Eemnes: [20, 45],
    });
  }
});
