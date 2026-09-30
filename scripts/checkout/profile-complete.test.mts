/**
 * profileCompleteForCheckout(): de pure kern (src/lib/checkout/
 * profile-complete-core.ts) die /abonnement, /kopen en
 * createOrderAndCheckout delen. Drie gevallen: niet ingelogd, ingelogd
 * compleet, ingelogd onvolledig.
 * Run: npm run test:checkout
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHECKOUT_PROFILE_FIELDS,
  isProfileCompleteForCheckout,
  missingCheckoutFields,
  resolveCheckoutIdentity,
} from "../../src/lib/checkout/profile-complete-core";

const USER = { id: "00000000-0000-0000-0000-000000000001", email: "lid@voorbeeld.nl" };

const COMPLETE = {
  first_name: "Test",
  last_name: "Lid",
  phone: "+31612345678",
  street_address: "Industrieweg 14P",
  postal_code: "1231 MX",
  city: "Loosdrecht",
};

test("niet ingelogd: anonymous, ongeacht wat er aan profiel meekomt", () => {
  assert.deepEqual(resolveCheckoutIdentity(null, COMPLETE), { status: "anonymous" });
  assert.deepEqual(resolveCheckoutIdentity(undefined, null), { status: "anonymous" });
});

test("ingelogd compleet: complete, met e-mail en voorvulling", () => {
  const identity = resolveCheckoutIdentity(USER, COMPLETE);
  assert.equal(identity.status, "complete");
  if (identity.status !== "complete") return;
  assert.equal(identity.email, USER.email);
  assert.deepEqual(identity.prefill, COMPLETE);
  assert.equal(isProfileCompleteForCheckout(COMPLETE), true);
});

test("ingelogd onvolledig: het productie-geval (trigger zet naam op lege string)", () => {
  // Zo ziet het profiel eruit dat de aanleiding was: auth-user bestaat,
  // handle_new_auth_user schreef '' voor de namen, de rest is null.
  const identity = resolveCheckoutIdentity(USER, {
    first_name: "",
    last_name: "",
    phone: null,
    street_address: null,
    postal_code: null,
    city: null,
  });
  assert.equal(identity.status, "incomplete");
  if (identity.status !== "incomplete") return;
  assert.deepEqual(identity.missing, [...CHECKOUT_PROFILE_FIELDS]);
  assert.deepEqual(identity.prefill, {
    first_name: "",
    last_name: "",
    phone: "",
    street_address: "",
    postal_code: "",
    city: "",
  });
});

test("ingelogd onvolledig: een enkel ontbrekend veld volstaat, voorvulling behoudt de rest", () => {
  const identity = resolveCheckoutIdentity(USER, { ...COMPLETE, phone: "  " });
  assert.equal(identity.status, "incomplete");
  if (identity.status !== "incomplete") return;
  assert.deepEqual(identity.missing, ["phone"]);
  assert.deepEqual(identity.prefill, { ...COMPLETE, phone: "" });
});

test("ingelogd zonder profielrij: onvolledig met alles leeg", () => {
  const identity = resolveCheckoutIdentity(USER, null);
  assert.equal(identity.status, "incomplete");
  assert.deepEqual(missingCheckoutFields(null), [...CHECKOUT_PROFILE_FIELDS]);
});

test("ingelogd zonder e-mail op de sessie: e-mail is lege string, status ongewijzigd", () => {
  const identity = resolveCheckoutIdentity({ id: USER.id, email: null }, COMPLETE);
  assert.equal(identity.status, "complete");
  if (identity.status !== "complete") return;
  assert.equal(identity.email, "");
});

test("veldenlijst is exact de set van saveIdentityDetails, in formuliervolgorde", () => {
  assert.deepEqual(
    [...CHECKOUT_PROFILE_FIELDS],
    ["first_name", "last_name", "phone", "street_address", "postal_code", "city"],
  );
});
