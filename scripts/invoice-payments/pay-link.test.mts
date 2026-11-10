import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveInvoicePayLink } from "../../src/lib/invoice-payments/pay-link.ts";

// Link, QR en knop alleen als de factuur online betaald kan worden EN online
// betalen in deze omgeving beschikbaar is; anders geen link en geen token.

const TOKEN = "3d817839-2d0f-4221-a5e9-3cc76ebe9f5d";
const payable = {
  status: "finalised",
  isCreditNote: false,
  totalGrossCents: 50459,
  paymentId: null as string | null,
};

function run(over: Partial<{
  invoice: typeof payable;
  creditedCents: number;
  available: boolean;
  token: string | null;
}> = {}) {
  let tokenCalls = 0;
  const p = resolveInvoicePayLink({
    invoice: over.invoice ?? payable,
    creditedCents: over.creditedCents ?? 0,
    available: over.available ?? true,
    ensureToken: async () => {
      tokenCalls++;
      return over.token === undefined ? TOKEN : over.token;
    },
    site: "https://www.themovementclub.nl/",
  });
  return { p, calls: () => tokenCalls };
}

test("beschikbaar en betaalbaar: stabiele URL, token aangemaakt", async () => {
  const { p, calls } = run();
  assert.equal(await p, `https://www.themovementclub.nl/factuur/betalen/${TOKEN}`);
  assert.equal(calls(), 1);
});

test("niet beschikbaar in deze omgeving (LIVE op preview): geen link en GEEN token", async () => {
  const { p, calls } = run({ available: false });
  assert.equal(await p, null);
  assert.equal(calls(), 0);
});

test("niet betaalbaar (creditnota, payment_id, nul, gecrediteerd): geen link, geen token", async () => {
  const cases = [
    { invoice: { ...payable, isCreditNote: true } },
    { invoice: { ...payable, paymentId: "p1" } },
    { invoice: { ...payable, totalGrossCents: 0 } },
    { creditedCents: 50459 },
  ];
  for (const c of cases) {
    const { p, calls } = run(c);
    assert.equal(await p, null);
    assert.equal(calls(), 0);
  }
});

test("token aanmaken mislukt: geen link (terugval op overmaken)", async () => {
  const { p } = run({ token: null });
  assert.equal(await p, null);
});
