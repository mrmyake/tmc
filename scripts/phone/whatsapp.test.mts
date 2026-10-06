/**
 * toWhatsAppHref (src/lib/admin/whatsapp.ts): wa.me-link op basis van
 * parsePhone (default NL), null bij alles wat geen geldig nummer is.
 * Run: npm run test:phone
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toWhatsAppHref } from "../../src/lib/admin/whatsapp";

const VALID: Array<[string, string]> = [
  ["06 12 34 56 78", "https://wa.me/31612345678"],
  ["0612345678", "https://wa.me/31612345678"],
  ["06-12345678", "https://wa.me/31612345678"],
  ["+31 6 12345678", "https://wa.me/31612345678"],
  ["+31 (0)6 12345678", "https://wa.me/31612345678"],
  ["0031 6 12345678", "https://wa.me/31612345678"],
  // Belgisch mobiel houdt de eigen landcode.
  ["+32 470 12 34 56", "https://wa.me/32470123456"],
  ["0032470123456", "https://wa.me/32470123456"],
  // Vaste NL-lijn: ook een geldig nummer, de link is dan niet per se
  // bruikbaar in WhatsApp, maar dat weet de parser niet.
  ["020 123 4567", "https://wa.me/31201234567"],
  ["+31 20 123 4567", "https://wa.me/31201234567"],
];

const INVALID: Array<[string, string | null | undefined]> = [
  ["lege string", ""],
  ["alleen spaties", "   "],
  ["null", null],
  ["undefined", undefined],
  ["onzin", "bel me maar"],
  ["te kort", "06 123"],
  ["te kort internationaal", "+31 6"],
  ["te lang", "06123456789012345"],
  ["met toevoeging", "0612345678 ext 12"],
  ["alleen landcode", "+31"],
];

for (const [input, expected] of VALID) {
  test(`toWhatsAppHref(${JSON.stringify(input)}) -> ${expected}`, () => {
    assert.equal(toWhatsAppHref(input), expected);
  });
}

for (const [label, input] of INVALID) {
  test(`toWhatsAppHref: ${label} -> null`, () => {
    assert.equal(toWhatsAppHref(input), null);
  });
}

test("toWhatsAppHref: nooit een plus in het pad", () => {
  for (const [input] of VALID) {
    const href = toWhatsAppHref(input);
    assert.ok(href && /^https:\/\/wa\.me\/[1-9][0-9]{7,14}$/.test(href), input);
  }
});
