/**
 * Patch-script: zet de juiste groepsgroottes in de Sanity-content
 * (fix/ads-landingspaginas-movenow, besluit Ilja 2026-10-26: yoga en
 * mobility maximaal 8, kettlebell maximaal 12). Raakt twee documenten:
 *
 * - faq-aanbod-3 (FAQ "Hoe groot zijn de groepen bij Small Group Training?",
 *   getoond op /aanbod): het antwoord zei "Maximaal 6 personen".
 * - offering-small-group (aanbodkaart op de homepage): subtitle
 *   "Maximaal 6 personen".
 *
 * Run met: SANITY_TOKEN=xxx npx tsx sanity/patch-groepsgrootte.ts
 * Voeg --dry toe om alleen te tonen wat er zou gebeuren.
 *
 * Veilig en idempotent: client.patch(_id).set(...), alleen het antwoord
 * respectievelijk de subtitle wordt aangeraakt. De yogaStyle-seoDescriptions
 * zonder wachtlijst lopen via patch-yoga-seo.ts.
 */
import { createClient } from "@sanity/client";

const client = createClient({
  projectId: "hn9lkvte",
  dataset: "production",
  apiVersion: "2026-04-01",
  token: process.env.SANITY_TOKEN,
  useCdn: false,
});

const DRY = process.argv.includes("--dry");

// COPY: confirm met Marlon
const FAQ_ANSWER =
  "Yoga en mobility maximaal 8 personen, kettlebell maximaal 12. Zo garanderen we dat iedereen persoonlijke aandacht krijgt en de techniek correct wordt uitgevoerd.";
// COPY: confirm met Marlon
const OFFERING_SUBTITLE = "Yoga & Mobility maximaal 8, Kettlebell maximaal 12 personen";

async function main() {
  if (!process.env.SANITY_TOKEN && !DRY) {
    console.error("Missing SANITY_TOKEN (write token). Use --dry to preview.");
    process.exit(1);
  }

  const docs = await client.fetch<
    Array<{ _id: string; subtitle?: string; answer?: Array<{ _key: string; children: Array<{ text: string }> }> }>
  >('*[_id in ["faq-aanbod-3","offering-small-group"]]{_id, subtitle, answer}');

  const faq = docs.find((d) => d._id === "faq-aanbod-3");
  const offering = docs.find((d) => d._id === "offering-small-group");
  if (!faq || !offering) {
    console.error("Een van beide documenten ontbreekt:", docs.map((d) => d._id));
    process.exit(1);
  }

  console.log("[faq-aanbod-3] antwoord");
  console.log("  was:", faq.answer?.[0]?.children?.[0]?.text);
  console.log("  wordt:", FAQ_ANSWER);
  console.log("[offering-small-group] subtitle");
  console.log("  was:", offering.subtitle);
  console.log("  wordt:", OFFERING_SUBTITLE);

  if (DRY) {
    console.log("\nDry run, niets geschreven.");
    return;
  }

  // Zelfde blokstructuur als de seed (een block met een span), met vaste
  // _key's zodat een herhaalde run geen diff geeft.
  await client
    .patch("faq-aanbod-3")
    .set({
      answer: [
        {
          _key: faq.answer?.[0]?._key ?? "a2",
          _type: "block",
          style: "normal",
          markDefs: [],
          children: [{ _key: "s1", _type: "span", marks: [], text: FAQ_ANSWER }],
        },
      ],
    })
    .commit();
  console.log("  faq-aanbod-3 gepatcht");

  await client.patch("offering-small-group").set({ subtitle: OFFERING_SUBTITLE }).commit();
  console.log("  offering-small-group gepatcht");
  console.log("\nKlaar.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
