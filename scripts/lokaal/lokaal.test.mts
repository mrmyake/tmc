import { test } from "node:test";
import assert from "node:assert/strict";
import { bouwDagbalk } from "../../src/lib/lokaal/dagbalk.ts";
import { fallbackHref, resolveHref } from "../../src/lib/lokaal/links.ts";
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

test("alle acht pagina's staan op concept en vallen terug op de juiste route", () => {
  assert.equal(LOKAAL_SLUGS.length, 8);
  for (const slug of LOKAAL_SLUGS) {
    assert.equal(LOKALE_PAGINAS[slug].status, "concept", slug);
  }
  assert.equal(fallbackHref(LOKALE_PAGINAS["personal-trainer-hilversum"]), "/personal-trainer-gooi");
  assert.equal(fallbackHref(LOKALE_PAGINAS["personal-trainer-bussum"]), "/personal-trainer-gooi");
  assert.equal(fallbackHref(LOKALE_PAGINAS["personal-trainer-laren"]), "/personal-trainer-gooi");
  assert.equal(fallbackHref(LOKALE_PAGINAS["personal-trainer-gooi"]), "/aanbod");
  assert.equal(fallbackHref(LOKALE_PAGINAS["kettlebell-training"]), "/aanbod");
});

test("links naar concept-pagina's verdwijnen, andere interne links blijven", () => {
  assert.equal(resolveHref("/kettlebell-training"), null);
  assert.equal(resolveHref("/personal-trainer-hilversum"), null);
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
