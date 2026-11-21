import { test } from "node:test";
import assert from "node:assert/strict";
import { LEGACY_DOMAINS } from "./load.mts";

// finalTarget is een niet-actief veld (zie spec-legacy-domains.md): de
// eindbestemming zodra de lokale pagina's bestaan, volgens
// spec-locatiepaginas.md. De waarden staan hier letterlijk, zodat een wijziging
// (of een per ongeluk actief gemaakt veld) opvalt.
const EXPECTED: Record<string, { target: string; finalTarget: string; temporaryTarget: boolean }> = {
  "/personal-training-loosdrecht": { target: "/aanbod", finalTarget: "/personal-training", temporaryTarget: true },
  "/kettlebell-training": { target: "/aanbod", finalTarget: "/kettlebell-training", temporaryTarget: true },
  "/kettlebell-bootcamp": { target: "/aanbod", finalTarget: "/kettlebell-training", temporaryTarget: true },
  "/training-en-begeleiding": { target: "/aanbod", finalTarget: "/aanbod", temporaryTarget: false },
  "/training-en-begeleiding-old": { target: "/aanbod", finalTarget: "/aanbod", temporaryTarget: false },
  "/personal-hormonal-profiling": { target: "/over", finalTarget: "/personal-training", temporaryTarget: true },
  "/personal-trainer-hilversum": { target: "/aanbod", finalTarget: "/personal-trainer-hilversum", temporaryTarget: true },
  "/personal-trainer-bussum": { target: "/aanbod", finalTarget: "/personal-trainer-bussum", temporaryTarget: true },
  "/personal-trainer-laren": { target: "/aanbod", finalTarget: "/personal-trainer-laren", temporaryTarget: true },
  "/personal-trainer-gooi": { target: "/aanbod", finalTarget: "/personal-trainer-gooi", temporaryTarget: true },
  "/personal-trainer-wijdemeren": { target: "/aanbod", finalTarget: "/personal-training", temporaryTarget: true },
};

for (const [path, expected] of Object.entries(EXPECTED)) {
  test(`register ${path}: doel nu en finalTarget`, () => {
    const rule = LEGACY_DOMAINS["ptloosdrecht.nl"].rules.find((r) => r.kind === "exact" && r.path === path);
    assert.ok(rule, "regel ontbreekt");
    assert.equal(rule.target, expected.target);
    assert.equal(rule.finalTarget, expected.finalTarget);
    assert.equal(rule.temporaryTarget, expected.temporaryTarget);
  });
}
