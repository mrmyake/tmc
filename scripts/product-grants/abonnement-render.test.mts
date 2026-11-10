import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// De componenten gebruiken JSX zonder React-import (Next); onder tsx is de
// klassieke transform actief en moet React globaal bestaan.
(globalThis as { React?: unknown }).React = React;
const { MembershipHeroCard } = await import(
  "../../src/app/app/abonnement/_components/MembershipHeroCard.tsx"
);
const { MembershipHistory } = await import(
  "../../src/app/app/abonnement/_components/MembershipHistory.tsx"
);

// /app/abonnement toont de nieuwste actieve rij, ook een rittenkaart of
// PT-pakket (cyclus 0). Daar viel de kaart op om (deling door 0 in
// computeNextInvoice); zie spec-facturatie.md 9.8.

const card = {
  planName: "10-rittenkaart",
  planVariant: "ten_ride_card",
  status: "active",
  pricePerCycleCents: 0,
  billingCycleWeeks: 0,
  startDate: "2026-11-01",
  commitEndDate: "2026-11-01",
  cancellationEffectiveDate: null,
};

test("kaart zonder cyclus rendert, zonder bedrag, commitment of incasso", () => {
  for (const price of [0, 15000]) {
    const html = renderToStaticMarkup(
      createElement(MembershipHeroCard, { ...card, pricePerCycleCents: price }),
    );
    assert.match(html, /10-rittenkaart/);
    assert.doesNotMatch(html, /weken|Commitment|Volgende incasso|€/);
  }
});

test("abonnement houdt bedrag, cyclus, commitment en volgende incasso", () => {
  const html = renderToStaticMarkup(
    createElement(MembershipHeroCard, {
      ...card,
      planName: "All Access Onbeperkt",
      planVariant: "all_inclusive_unl",
      pricePerCycleCents: 14900,
      billingCycleWeeks: 4,
      commitEndDate: "2027-11-01",
    }),
  );
  assert.match(html, /€149,-/);
  assert.match(html, /per <!-- -->4<!-- --> weken|per 4 weken/);
  assert.match(html, /Commitment tot/);
  assert.match(html, /Volgende incasso/);
});

test("historie: bedrag alleen bij een rij met cyclus", () => {
  const html = renderToStaticMarkup(
    createElement(MembershipHistory, {
      items: [
        { id: "1", planName: "All Access", status: "cancelled", startDate: "2026-01-01", endDate: "2026-06-01", pricePerCycleCents: 14900, billingCycleWeeks: 4 },
        { id: "2", planName: "10-rittenkaart", status: "cancelled", startDate: "2026-11-10", endDate: "2026-11-10", pricePerCycleCents: 0, billingCycleWeeks: 0 },
      ],
    }),
  );
  assert.equal((html.match(/€/g) ?? []).length, 1);
  assert.match(html, /€149,-/);
  assert.doesNotMatch(html, /0<!-- -->wk|0wk/);
});
