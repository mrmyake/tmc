import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeBillTo,
  missingBillToFields,
  missingBillToMessage,
  normaliseBillTo,
  type BillToDraftRow,
  type BillToProfile,
} from "../../src/lib/admin/invoice-bill-to.ts";
import {
  formatEuroCents,
  formatEuroCentsSigned,
} from "../../src/lib/format.ts";

// fix/facturen-portaal-afnemer: afnemer samenvoegen (concept wint, profiel
// vult gaten), verplichte velden voor finaliseren, server-side normalisatie.

const emptyDraft: BillToDraftRow = {
  bill_to_name: null,
  bill_to_company: null,
  bill_to_vat_number: null,
  bill_to_street: null,
  bill_to_postal_code: null,
  bill_to_city: null,
  bill_to_country: null,
  bill_to_email: null,
};
const profile: BillToProfile = {
  first_name: "Anna",
  last_name: "de Vries",
  email: "anna@example.nl",
  company_name: null,
  vat_number: null,
  street_address: "Dorpsstraat 1",
  postal_code: "1231 AB",
  city: "Loosdrecht",
  country: "NL",
};

test("mergeBillTo: profiel vult de gaten", () => {
  const m = mergeBillTo(emptyDraft, profile);
  assert.equal(m.name, "Anna de Vries");
  assert.equal(m.street, "Dorpsstraat 1");
  assert.equal(m.company, null);
});

test("mergeBillTo: concept wint van het profiel", () => {
  const m = mergeBillTo(
    { ...emptyDraft, bill_to_street: "Industrieweg 14P", bill_to_company: "Acme BV" },
    profile,
  );
  assert.equal(m.street, "Industrieweg 14P");
  assert.equal(m.company, "Acme BV");
  assert.equal(m.city, "Loosdrecht");
});

test("mergeBillTo: lege string in het concept telt als niet ingevuld", () => {
  const m = mergeBillTo({ ...emptyDraft, bill_to_street: "   " }, profile);
  assert.equal(m.street, "Dorpsstraat 1");
});

test("missingBillToFields: noemt de ontbrekende verplichte velden", () => {
  const m = mergeBillTo(emptyDraft, { ...profile, street_address: null, postal_code: null });
  assert.deepEqual(missingBillToFields(m), ["straat en huisnummer", "postcode"]);
});

test("missingBillToFields: land, bedrijf en BTW zijn niet verplicht", () => {
  const m = mergeBillTo(emptyDraft, { ...profile, country: null });
  assert.deepEqual(missingBillToFields(m), []);
});

test("missingBillToFields: zonder profiel ontbreekt alles", () => {
  assert.equal(missingBillToFields(mergeBillTo(emptyDraft, null)).length, 5);
});

const input = {
  name: "  Anna de Vries ",
  company: "",
  vatNumber: " ",
  street: "Dorpsstraat 1",
  postalCode: "1231 AB",
  city: "Loosdrecht",
  country: "",
  email: " anna@example.nl ",
};

test("normaliseBillTo: trimt en maakt lege waarden null", () => {
  const r = normaliseBillTo(input);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.name, "Anna de Vries");
    assert.equal(r.value.company, null);
    assert.equal(r.value.vatNumber, null);
    assert.equal(r.value.country, null);
    assert.equal(r.value.email, "anna@example.nl");
  }
});

test("normaliseBillTo: ongeldig e-mailadres wordt geweigerd", () => {
  assert.equal(normaliseBillTo({ ...input, email: "geen-mail" }).ok, false);
  assert.equal(normaliseBillTo({ ...input, email: "a@b" }).ok, false);
});

test("normaliseBillTo: leeg e-mailadres mag (profiel vult aan)", () => {
  const r = normaliseBillTo({ ...input, email: "" });
  assert.ok(r.ok);
});

test("formatEuroCentsSigned: centen exact, minteken voorop", () => {
  assert.equal(formatEuroCentsSigned(50459), formatEuroCents(50459));
  assert.match(formatEuroCentsSigned(50459), /^€504,59$/);
  assert.match(formatEuroCentsSigned(-50459), /^-€504,59$/);
  assert.match(formatEuroCentsSigned(0), /^€0,00$/);
});

test("missingBillToMessage: ontbreekt bij een veld, ontbreken bij meer", () => {
  assert.equal(
    missingBillToMessage(["postcode"]),
    "Vul eerst de afnemer aan: postcode ontbreekt.",
  );
  assert.equal(
    missingBillToMessage(["straat en huisnummer", "postcode", "plaats"]),
    "Vul eerst de afnemer aan: straat en huisnummer, postcode, plaats ontbreken.",
  );
});
