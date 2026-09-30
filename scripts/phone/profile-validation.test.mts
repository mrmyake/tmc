/**
 * Foutmapping en veldvalidatie voor profielgegevens
 * (src/lib/profile-validation.ts).
 * Run: npm run test:phone
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GENERIC_SAVE_MESSAGE,
  PHONE_INVALID_MESSAGE,
  PHONE_TAKEN_MESSAGE,
  REQUIRED_MESSAGES,
  describeWriteError,
  mapProfileWriteError,
  validateProfileField,
} from "../../src/lib/profile-validation";

const UNIQUE = {
  code: "23505",
  message:
    'duplicate key value violates unique constraint "profiles_phone_unique"',
  details: "Key (phone)=(+31612345678) already exists.",
};
const CHECK_NEW = {
  code: "23514",
  message:
    'new row for relation "profiles" violates check constraint "profiles_phone_e164"',
  details: "Failing row contains (..., +31031612345678, ...).",
};
// Overgang: tot migratie 20261001100000 live is heet de constraint nog _nl.
const CHECK_OLD = {
  ...CHECK_NEW,
  message:
    'new row for relation "profiles" violates check constraint "profiles_phone_e164_nl"',
};

test("23505 profiles_phone_unique: veldgebonden telefoonmelding", () => {
  assert.deepEqual(mapProfileWriteError(UNIQUE), {
    error: PHONE_TAKEN_MESSAGE,
    field: "phone",
  });
});

test("23514 profiles_phone_e164 en de oude _nl-naam: veldgebonden telefoonmelding", () => {
  for (const e of [CHECK_NEW, CHECK_OLD]) {
    assert.deepEqual(mapProfileWriteError(e), {
      error: PHONE_INVALID_MESSAGE,
      field: "phone",
    });
  }
});

test("23502 not-null op first_name en last_name", () => {
  const mk = (col: string) => ({
    code: "23502",
    message: `null value in column "${col}" of relation "profiles" violates not-null constraint`,
  });
  assert.deepEqual(mapProfileWriteError(mk("first_name")), {
    error: REQUIRED_MESSAGES.first_name,
    field: "first_name",
  });
  assert.deepEqual(mapProfileWriteError(mk("last_name")), {
    error: REQUIRED_MESSAGES.last_name,
    field: "last_name",
  });
});

test("onbekende fouten geven de generieke melding zonder veld", () => {
  for (const e of [
    { code: "42501", message: "permission denied for table profiles" },
    { code: "23505", message: 'violates unique constraint "andere_unique"' },
    { code: "23514", message: 'violates check constraint "andere_check"' },
    { code: null, message: "TypeError: fetch failed" },
    {},
  ]) {
    assert.deepEqual(mapProfileWriteError(e), { error: GENERIC_SAVE_MESSAGE });
  }
});

test("describeWriteError geeft alleen code en constraint terug, geen PII", () => {
  const info = describeWriteError(UNIQUE);
  assert.deepEqual(info, {
    code: "23505",
    constraint: "profiles_phone_unique",
  });
  assert.equal(JSON.stringify(info).includes("+316"), false);
  assert.deepEqual(describeWriteError({ code: "42501", message: "denied" }), {
    code: "42501",
    constraint: null,
  });
});

test("gemapte meldingen bevatten geen telefoonnummer", () => {
  for (const e of [UNIQUE, CHECK_NEW, CHECK_OLD]) {
    assert.equal(/\+?\d{9,}/.test(mapProfileWriteError(e).error), false);
  }
});

test("validateProfileField: verplicht, leeg", () => {
  assert.equal(
    validateProfileField("first_name", "  ", { required: true }),
    REQUIRED_MESSAGES.first_name,
  );
  assert.equal(validateProfileField("phone", "", { required: false }), null);
});

test("validateProfileField: telefoon", () => {
  for (const good of [
    "06 12345678",
    "+31 (0)6 12345678",
    "0031612345678",
    "0201234567",
    "+44 7911 123456",
    "+49 151 23456789",
  ]) {
    assert.equal(validateProfileField("phone", good, { required: true }), null, good);
  }
  for (const bad of ["0031612345", "+44 7700 900123", "06123", "abc"]) {
    assert.equal(
      validateProfileField("phone", bad, { required: true }),
      PHONE_INVALID_MESSAGE,
    );
  }
});
