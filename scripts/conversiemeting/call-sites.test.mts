import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Brontests voor de call-sites (spec-conversiemeting.md). Ze lezen de
// broncode, omdat de regels gaan over de PLEK van een aanroep:
// - generate_lead en newsletter_signup vuren pas na een 2xx van hun API;
// - er is geen client-side lead-event meer voor een proefboeking;
// - contact_click heeft precies een call-site;
// - client-events dragen geen bedrag;
// - de server-events worden ge-awaited binnen after().
// Een nieuwe call-site die hier niet in de lijst staat laat de test falen,
// zodat hij bewust wordt beoordeeld.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path.relative(ROOT, full));
  }
  return out;
}
const SRC_FILES = walk(path.join(ROOT, "src"));

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

interface AfterOkSite {
  file: string;
  /** De fetch waar het event bij hoort. */
  fetch: string;
  /** De aanroep die pas na een 2xx mag vuren. */
  call: string;
}

const AFTER_OK_SITES: AfterOkSite[] = [
  { file: "src/app/proefles/ProeflesContent.tsx", fetch: 'fetch("/api/proefles"', call: 'trackLead("terugbelverzoek")' },
  { file: "src/components/blocks/ContactForm.tsx", fetch: 'fetch("/api/contact"', call: 'trackLead("contact_form")' },
  { file: "src/app/prijzen/OverstapLeadForm.tsx", fetch: 'fetch("/api/leads/overstap"', call: 'trackLead("overstap")' },
  { file: "src/app/welke-yoga-past-bij-jou/YogaTest.tsx", fetch: 'fetch("/api/yoga-test"', call: 'trackLead("yoga_quiz")' },
  { file: "src/app/welke-yoga-past-bij-jou/YogaTest.tsx", fetch: 'fetch("/api/yoga-test"', call: 'trackNewsletterSignup("yoga_quiz")' },
  { file: "src/components/blocks/InfoOptInBanner.tsx", fetch: 'fetch("/api/leads/info"', call: 'trackNewsletterSignup("banner")' },
];

/** YogaWaitlistForm is nergens gemount (dode code, "Bewust niet" in de spec). */
const DEAD_CODE = ["src/components/blocks/yoga/YogaWaitlistForm.tsx"];

for (const site of AFTER_OK_SITES) {
  test(`${site.call} in ${path.basename(site.file)} vuurt pas na een 2xx`, () => {
    const source = read(site.file);
    assert.equal(count(source, site.call), 1, "precies een aanroep");
    assert.equal(count(source, site.fetch), 1, "precies een fetch");
    const fetchAt = source.indexOf(site.fetch);
    const callAt = source.indexOf(site.call);
    assert.ok(callAt > fetchAt, "de aanroep staat na de fetch, niet ervoor");

    const between = source.slice(fetchAt, callAt);
    // Het antwoord moet zijn opgevangen en op res.ok gecontroleerd.
    assert.match(source.slice(Math.max(0, fetchAt - 40), fetchAt), /const res = await $/);
    const guardedInline = /if \(res\.ok\) $/.test(between);
    const guardedByEarlyExit =
      /if \(!res\.ok\) (throw new Error\([^)]*\);|\{[\s\S]*?return;\s*\})/.test(between);
    assert.ok(
      guardedInline || guardedByEarlyExit,
      "tussen de fetch en de aanroep staat een res.ok-controle",
    );
  });
}

test("de yoga-nieuwsbrief vuurt alleen met de tips-opt-in aangevinkt", () => {
  const source = read("src/app/welke-yoga-past-bij-jou/YogaTest.tsx");
  assert.match(source, /if \(optIn\) trackNewsletterSignup\("yoga_quiz"\);/);
});

test("elke generate_lead- en newsletter_signup-call-site staat in de gecontroleerde lijst", () => {
  const audited = new Map<string, number>();
  for (const site of AFTER_OK_SITES) audited.set(site.file, (audited.get(site.file) ?? 0) + 1);

  for (const file of SRC_FILES) {
    if (file === "src/lib/analytics.ts" || DEAD_CODE.includes(file)) continue;
    const source = read(file);
    const calls = count(source, "trackLead(") + count(source, "trackNewsletterSignup(");
    assert.equal(
      calls,
      audited.get(file) ?? 0,
      `${file}: ${calls} lead- of nieuwsbrief-aanroepen, verwacht ${audited.get(file) ?? 0}`,
    );
  }
});

test("geen client-side lead-event meer voor een proefboeking", () => {
  for (const file of [
    "src/app/proefles/boeken/TrialBookingList.tsx",
    "src/app/proefles/code/VisitorSlotPicker.tsx",
  ]) {
    const source = read(file);
    assert.equal(count(source, "trackLead"), 0, file);
    // De GA4-id's en de advertentiekeuze gaan wel mee naar de server action.
    assert.equal(count(source, "ga: gaMeta"), 2, file);
    assert.equal(count(source, "await readGaSubmitMeta()"), 1, file);
  }
  for (const file of SRC_FILES) {
    assert.equal(read(file).includes('"trial_booking", '), false, file);
  }
});

test("contact_click heeft precies een call-site: TrackedContactLink", () => {
  const callers = SRC_FILES.filter(
    (file) => file !== "src/lib/analytics.ts" && read(file).includes("trackContactClick("),
  );
  assert.deepEqual(callers, ["src/components/ui/TrackedLink.tsx"]);
  for (const file of SRC_FILES) {
    const source = read(file);
    assert.equal(/trackContact\(/.test(source), false, `${file}: oude trackContact`);
    assert.equal(/click_(phone|whatsapp|email)/.test(source), false, `${file}: oude click_*-events`);
  }
});

test("publieke contactlinks lopen via TrackedContactLink", () => {
  const publicFiles = [
    "src/components/layout/Footer.tsx",
    "src/components/blocks/ContactSection.tsx",
    "src/app/contact/ContactContent.tsx",
    "src/app/privacybeleid/PrivacybeleidContent.tsx",
  ];
  for (const file of publicFiles) {
    const source = read(file);
    assert.ok(source.includes("TrackedContactLink"), file);
    // Geen kale QuietLink of Button meer op een tel:-, mailto:- of wa.me-doel.
    assert.equal(
      /<(QuietLink|Button)\s[^>]*href=\{?[`"']?(mailto:|tel:|https:\/\/wa\.me)/.test(source),
      false,
      file,
    );
    assert.equal(
      /<(QuietLink|Button)\s[^>]*href=\{(toTelHref\(|whatsappUrl|SITE\.whatsapp)/.test(source),
      false,
      file,
    );
  }
  // De vier Portable Text-renderers gebruiken de gedeelde link-mark.
  for (const file of [
    "src/app/aanbod/AanbodContent.tsx",
    "src/app/yoga/[style]/page.tsx",
    "src/app/yoga/docenten/[slug]/page.tsx",
    "src/components/blocks/TrainerSpotlight.tsx",
  ]) {
    assert.ok(read(file).includes("components={portableTextComponents}"), file);
  }
  const renderers = SRC_FILES.filter((file) => read(file).includes("<PortableText"));
  for (const file of renderers) {
    assert.ok(read(file).includes("portableTextComponents"), `${file}: renderer zonder link-mark`);
  }
});

test("client-events dragen geen bedrag (programma_intake is de enige vaste leadwaarde)", () => {
  const source = read("src/lib/analytics.ts");
  const withoutIntake = source.replace(
    /export const trackProgrammaIntake[\s\S]*?\n};\n/,
    "",
  );
  assert.equal(/\bcurrency:/.test(withoutIntake), false, "currency in een client-event");
  // "value?: number" in het EventParams-type mag; een verzonden value niet.
  assert.equal(/^\s+value[,:]/m.test(withoutIntake.replace(/value\?: number;/, "")), false, "value in een client-event");
  const payStage = read("src/components/checkout/PayStage.tsx");
  assert.equal(payStage.includes("amount:"), false, "payment_start stuurt nog een bedrag");
  assert.equal(count(payStage, "trackPaymentStart({"), 2);
});

test("contactMethodFromHref herkent tel, mailto en WhatsApp", async () => {
  const { contactMethodFromHref } = await import("../../src/lib/contact-links.ts");
  assert.equal(contactMethodFromHref("tel:+31625130584"), "phone");
  assert.equal(contactMethodFromHref("mailto:info@themovementclub.nl"), "email");
  assert.equal(contactMethodFromHref("MAILTO:info@themovementclub.nl"), "email");
  assert.equal(contactMethodFromHref("https://wa.me/31625130584"), "whatsapp");
  assert.equal(contactMethodFromHref("https://api.whatsapp.com/send?phone=31625130584"), "whatsapp");
  assert.equal(contactMethodFromHref("whatsapp://send?phone=31625130584"), "whatsapp");
  assert.equal(contactMethodFromHref("https://www.themovementclub.nl/contact"), null);
  assert.equal(contactMethodFromHref("https://example.com/wa.me/123"), null);
  assert.equal(contactMethodFromHref("/proefles"), null);
  assert.equal(contactMethodFromHref(undefined), null);
});

test("server-events: ge-awaited binnen after(), op alle vier de plekken", () => {
  const awaitedInAfter = /after\(async \(\) => \{\s*await sendTrialBookedToGa4\(/;
  for (const file of [
    "src/app/api/trial-bookings/webhook/route.ts",
    "src/app/api/cron/expire-trial-bookings/route.ts",
    "src/lib/actions/trial-booking.ts",
    "src/lib/actions/opening-trial.ts",
  ]) {
    const source = read(file);
    assert.match(source, awaitedInAfter, file);
    assert.equal(count(source, "sendTrialBookedToGa4("), 1, `${file}: precies een aanroep`);
    assert.equal(/void sendTrialBookedToGa4/.test(source), false, file);
  }
});

test("trial_booked vuurt in webhook en cron pas na de controle op een geannuleerde sessie", () => {
  for (const file of [
    "src/app/api/trial-bookings/webhook/route.ts",
    "src/app/api/cron/expire-trial-bookings/route.ts",
  ]) {
    const source = read(file);
    const paidAt = source.indexOf('.update({ status: "paid" })');
    const cancelCheckAt = source.indexOf("await cancelIfSessionCancelled(trial)");
    const eventAt = source.indexOf("sendTrialBookedToGa4(");
    assert.ok(paidAt > 0 && cancelCheckAt > paidAt, `${file}: controle na de overgang naar paid`);
    assert.ok(eventAt > cancelCheckAt, `${file}: event na de controle`);
  }
});

test("purchase wordt ge-awaited in de naloop, niet als losse void", () => {
  const source = read("src/lib/orders/activation-chain.ts");
  assert.match(source, /await sendPurchaseToGa4\(\{ orderId, amountCents \}\);/);
  assert.equal(/void sendPurchaseToGa4/.test(source), false);
});

test("ad_consent staat nooit in dezelfde update of select als de bestaande kolommen", () => {
  const createOrder = read("src/lib/orders/create-order.ts");
  const gaUpdate = createOrder.match(/\.update\(\{\s*ga_client_id:[\s\S]*?\}\)/);
  assert.ok(gaUpdate, "de ga_client_id-update bestaat");
  assert.equal(gaUpdate[0].includes("ad_consent"), false);
  assert.match(createOrder, /await writeAdConsent\(admin, "orders", orderId, selection\.adConsent/);

  for (const file of SRC_FILES) {
    const source = read(file);
    for (const match of source.matchAll(/\.select\(\s*(["'`])([\s\S]*?)\1/g)) {
      const columns = match[2].split(",").map((c) => c.trim());
      if (columns.includes("ad_consent")) {
        assert.deepEqual(columns, ["ad_consent"], `${file}: ad_consent gecombineerd in een select`);
      }
    }
    for (const match of source.matchAll(/\.(update|insert|upsert)\(\s*\{([\s\S]*?)\}\s*[,)]/g)) {
      if (/\bad_consent\b/.test(match[2])) {
        assert.match(match[2].trim(), /^ad_consent: [^,]+,?$/, `${file}: ad_consent gecombineerd in een write`);
      }
    }
  }
});

test("geen code vult action_page", () => {
  for (const file of SRC_FILES) {
    const source = read(file);
    assert.equal(/action_page:\s/.test(source.replace(/action_page: actionPage/g, "")), false, `${file} schrijft action_page`);
  }
});
