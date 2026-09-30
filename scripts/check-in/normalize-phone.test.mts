/**
 * normalizePhone (kiosk) delegeert naar parsePhone (src/lib/phone-parse.ts).
 * Run: npm run test:check-in
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InvalidPhoneError,
  classifyIdentifier,
  normalizePhone,
} from "../../src/lib/check-in/normalize-phone";

test("geldige varianten, inclusief +31 (0)6 en 0031", () => {
  for (const input of [
    "0612345678",
    "06 12345678",
    "06-12345678",
    "+31612345678",
    "+31 6 12345678",
    "+31 (0)6 12345678",
    "0031612345678",
  ]) {
    assert.equal(normalizePhone(input), "+31612345678", input);
  }
});

test("buitenlandse nummers, ook met 00 of spaties", () => {
  assert.equal(normalizePhone("+44 7911 123456"), "+447911123456");
  assert.equal(normalizePhone("0044 7911 123456"), "+447911123456");
  assert.equal(normalizePhone("+49 151 23456789"), "+4915123456789");
});

test("ongeldig, kort, lang en leeg gooien InvalidPhoneError", () => {
  for (const input of [
    "+44 7700 900123",
    "06123456",
    "061234567890",
    "abc",
    "",
  ]) {
    assert.throws(() => normalizePhone(input), InvalidPhoneError, input);
  }
});

test("classifyIdentifier: 6 cijfers is lidcode, mobiel is phone", () => {
  assert.deepEqual(classifyIdentifier("123456"), {
    kind: "member_code",
    value: "123456",
  });
  assert.deepEqual(classifyIdentifier("+31 (0)6 12345678"), {
    kind: "phone",
    value: "+31612345678",
  });
  assert.deepEqual(classifyIdentifier("+44 7911 123456"), {
    kind: "phone",
    value: "+447911123456",
  });
  assert.equal(classifyIdentifier("abc"), null);
});
