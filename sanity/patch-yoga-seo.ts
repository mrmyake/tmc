/**
 * Patch-script: zet regionale SEO-velden (seoTitle/seoDescription) op de
 * bestaande yogaStyle-documenten, gericht op Loosdrecht + regio Hilversum.
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
    seoTitle: "Yoga Nidra in Loosdrecht, vlakbij Hilversum | The Movement Club",
    seoDescription:
      "Yoga nidra in Loosdrecht: diepe ontspanning door geleide meditatie in lig. Kleine groepen, op tien minuten van Hilversum. Zet je op de wachtlijst.",
  },
  {
    id: "yogaStyle-irest",
    slug: "irest",
    seoTitle: "iRest Yoga in Loosdrecht, vlakbij Hilversum | The Movement Club",
    seoDescription:
      "iRest yoga nidra in Loosdrecht: meditatieve diepe rust en herstel. Kleine lessen vlakbij Hilversum en het Gooi. Schrijf je in voor de wachtlijst.",
  },
  {
    id: "yogaStyle-restorative-yoga",
    slug: "restorative-yoga",
    seoTitle: "Restorative Yoga in Loosdrecht, regio Hilversum | The Movement Club",
    seoDescription:
      "Restorative yoga in Loosdrecht: volledig tot rust komen met ondersteunde houdingen. Kleine lessen vlakbij Hilversum en het Gooi. Zet je op de wachtlijst.",
  },
  {
    id: "yogaStyle-yin-yoga",
    slug: "yin-yoga",
    seoTitle: "Yin Yoga in Loosdrecht, vlakbij Hilversum | The Movement Club",
    seoDescription:
      "Yin yoga in Loosdrecht: rustige, lang vastgehouden houdingen voor diepe ontspanning en soepelheid. Kleine groepen, op tien minuten van Hilversum.",
  },
  {
    id: "yogaStyle-flow-yoga",
    slug: "flow-yoga",
    seoTitle: "Flow Yoga in Loosdrecht, vlakbij Hilversum | The Movement Club",
    seoDescription:
      "Flow yoga in Loosdrecht: dynamische beweging op je adem, voor kracht en mobiliteit. Kleine groepen vlakbij Hilversum. Zet je op de wachtlijst.",
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
