/**
 * Patch-script: zet regionale SEO-velden (seoTitle/seoDescription) op de
 * bestaande yogaStyle-documenten, gericht op Loosdrecht + regio Hilversum.
 * Sinds fix/ads-landingspaginas-movenow (2026-10-26) zonder wachtlijst en met
 * de groepsgrootte (maximaal 8); opnieuw gedraaid op die datum.
 *
 * Run met: SANITY_TOKEN=xxx npx tsx sanity/patch-yoga-seo.ts
 *   (token met schrijfrechten via sanity.io/manage → API → Tokens,
 *    of `vercel env pull` als de token daar staat)
 *
 * Veilig en idempotent: gebruikt client.patch(_id).set(...), dus ALLEEN de
 * twee SEO-velden worden aangeraakt. Andere velden (afbeeldingen, body, FAQ's
 * die in Studio zijn bewerkt) blijven ongemoeid, anders dan bij een volledige
 * createOrReplace-seed. Voeg --dry toe om alleen te tonen wat er zou gebeuren.
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

// _id's komen overeen met de deterministische id's uit seed-yoga.ts
// (yogaStyle-${id}). title/slug staan erbij als referentie.
const SEO: Array<{
  id: string;
  slug: string;
  seoTitle: string;
  seoDescription: string;
}> = [
  {
    id: "yogaStyle-yoga-nidra",
    slug: "yoga-nidra",
    seoTitle: "Yoga Nidra in Loosdrecht, vlakbij Hilversum",
    seoDescription:
      "Yoga nidra in Loosdrecht: diepe ontspanning door geleide meditatie in lig. Maximaal 8 personen per les, op tien minuten van Hilversum. Plan je proefles.",
  },
  {
    id: "yogaStyle-irest",
    slug: "irest",
    seoTitle: "iRest Yoga in Loosdrecht, vlakbij Hilversum",
    seoDescription:
      "iRest yoga nidra in Loosdrecht: meditatieve diepe rust en herstel. Kleine lessen van maximaal 8 personen vlakbij Hilversum en het Gooi. Plan je proefles.",
  },
  {
    id: "yogaStyle-restorative-yoga",
    slug: "restorative-yoga",
    seoTitle: "Restorative Yoga in Loosdrecht, regio Hilversum",
    seoDescription:
      "Restorative yoga in Loosdrecht: volledig tot rust komen met ondersteunde houdingen. Kleine lessen van maximaal 8 personen vlakbij Hilversum en het Gooi. Plan je proefles.",
  },
  {
    id: "yogaStyle-yin-yoga",
    slug: "yin-yoga",
    seoTitle: "Yin Yoga in Loosdrecht, vlakbij Hilversum",
    seoDescription:
      "Yin yoga in Loosdrecht: rustige, lang vastgehouden houdingen voor diepe ontspanning en soepelheid. Maximaal 8 personen per les, op tien minuten van Hilversum. Plan je proefles.",
  },
  {
    id: "yogaStyle-flow-yoga",
    slug: "flow-yoga",
    seoTitle: "Flow Yoga in Loosdrecht, vlakbij Hilversum",
    seoDescription:
      "Flow yoga in Loosdrecht: dynamische beweging op je adem, voor kracht en mobiliteit. Maximaal 8 personen per les, vlakbij Hilversum. Plan je proefles.",
  },
];

async function main() {
  if (!process.env.SANITY_TOKEN && !DRY) {
    console.error("Missing SANITY_TOKEN (write token). Use --dry to preview.");
    process.exit(1);
  }
  for (const s of SEO) {
    console.log(`\n[${s.slug}]`);
    console.log(`  seoTitle       (${s.seoTitle.length}): ${s.seoTitle}`);
    console.log(
      `  seoDescription (${s.seoDescription.length}): ${s.seoDescription}`,
    );
    if (DRY) continue;
    await client
      .patch(s.id)
      .set({ seoTitle: s.seoTitle, seoDescription: s.seoDescription })
      .commit();
    console.log("  ✓ gepatcht");
  }
  console.log(DRY ? "\nDry run, niets geschreven." : "\nKlaar.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
