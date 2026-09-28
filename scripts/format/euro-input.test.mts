import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatEuroInput,
  parseEuroInput,
} from "../../src/lib/euro-input.ts";

// fix/euro-input-factuur: het bedragveld op de factuureditor parst en toont
// via deze twee pure functies. Alles is integer centen.

test("parseEuroInput: geldige invoer geeft centen", () => {
  const cases: [string, number][] = [
    ["90", 9000],
    ["90,5", 9050],
    ["90,50", 9050],
    ["90.50", 9050],
    ["90,", 9000],
    ["1.234,50", 123450],
    ["1,234.50", 123450],
    ["1.234", 123400],
    ["0,05", 5],
    ["0", 0],
    ["-12,50", -1250],
    ["-0", 0],
    [" 90,50 ", 9050],
    ["1 234,50", 123450],
    ["1.234.567,89", 123456789],
    ["1.234.567", 123456700],
    ["1,234,567", 123456700],
    ["1234567,5", 123456750],
  ];
  for (const [input, cents] of cases) {
    assert.equal(parseEuroInput(input), cents, `"${input}"`);
  }
});

test("parseEuroInput: ongeldige invoer geeft null, nooit een afronding", () => {
  const cases = [
    "90,505",
    "abc",
    "",
    "   ",
    "-",
    "--5",
    "5-",
    "9-0",
    ",50",
    "1,2,3",
    "1.2.3",
    "12.34.56",
    "1,234,50",
    "1,234.567",
    "90,50,10",
    "90.5.0",
    "€90",
    "90 euro",
    "1e3",
    "99999999999999999999",
  ];
  for (const input of cases) {
    assert.equal(parseEuroInput(input), null, `"${input}"`);
  }
});

test("formatEuroInput: centen naar Nederlandse invoertekst", () => {
  assert.equal(formatEuroInput(9050), "90,50");
  assert.equal(formatEuroInput(123450), "1.234,50");
  assert.equal(formatEuroInput(-1250), "-12,50");
  assert.equal(formatEuroInput(0), "0,00");
  assert.equal(formatEuroInput(5), "0,05");
  assert.equal(formatEuroInput(-5), "-0,05");
  assert.equal(formatEuroInput(100000000), "1.000.000,00");
  assert.equal(formatEuroInput(99900), "999,00");
});

test("formatEuroInput: geen safe integer geeft een lege tekst", () => {
  assert.equal(formatEuroInput(NaN), "");
  assert.equal(formatEuroInput(1.5), "");
  assert.equal(formatEuroInput(Infinity), "");
});

test("round-trip: parse(format(x)) is x", () => {
  const values = [
    0, 1, 5, 9, 10, 99, 100, 101, 999, 1000, 9050, 12345, 99999, 100000,
    123450, 999999, 1000000, 123456789, -1, -5, -99, -100, -1250, -123450,
    -123456789,
  ];
  for (const x of values) {
    assert.equal(parseEuroInput(formatEuroInput(x)), x, String(x));
  }
});
