import { getYogaStyles, getYogaTeachers } from "../../../sanity/lib/fetch";
import { SITE } from "@/lib/constants";

// Verversen elke 10 minuten; llms.txt hoeft niet realtime te zijn.
export const revalidate = 600;

/**
 * llms.txt — beknopte, machine-leesbare index voor AI-zoekmachines en LLM's.
 * Volgt de llmstxt.org-conventie: H1 + samenvatting + secties met links.
 */
export async function GET() {
  const [styles, teachers] = await Promise.all([
    getYogaStyles(),
    getYogaTeachers(),
  ]);
  const activeTeachers = teachers.filter((t) => t.isActive);

  const lines: string[] = [
    "# The Movement Club — Yoga in Loosdrecht",
    "",
    "> Boutique yogastudio in Loosdrecht (Wijdemeren). Vijf vormen, van diepe rust tot dynamische beweging: Yin, Restorative, Yoga Nidra, iRest en Flow. Kleine groepen, persoonlijke begeleiding. De studio opent binnenkort; inschrijven kan via de wachtlijst.",
    "",
    "## Yoga",
    `- [Yoga in Loosdrecht](${SITE.url}/yoga): overzicht van alle vormen, docenten en het rooster.`,
    `- [Yoga rooster](${SITE.url}/yoga/rooster): het wekelijkse lesrooster.`,
    `- [Yoga docenten](${SITE.url}/yoga/docenten): de docenten en hun specialisaties.`,
    "",
    "## Yogavormen",
  ];

  for (const style of styles) {
    lines.push(`- [${style.title}](${SITE.url}/yoga/${style.slug}): ${style.definition}`);
  }

  if (activeTeachers.length > 0) {
    lines.push("", "## Docenten");
    for (const teacher of activeTeachers) {
      const specialty = teacher.specialty ? `: ${teacher.specialty}` : "";
      lines.push(`- [${teacher.name}](${SITE.url}/yoga/docenten/${teacher.slug})${specialty}`);
    }
  }

  lines.push("");

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
