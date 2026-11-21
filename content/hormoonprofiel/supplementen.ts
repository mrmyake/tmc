import type { HpPage } from "./types";
import { DATE_MODIFIED } from "./shared";

// COPY: confirm met Marlon (alle teksten in dit bestand)
// Geen merknamen. Alleen gezondheidsclaims van de EU-lijst van toegestane
// claims, of geen claim.

export const supplementen: HpPage = {
  key: "supplementen",
  topic: "Voedingssupplementen",
  metaDescription:
    "Vier basissupplementen: multivitamine, omega-3-visolie, groene-thee-extract en spijsverteringsenzymen. Supplementadvies krijg je binnen je traject.",
  h1: "Voedingssupplementen en jouw plan",
  eyebrow: "Supplementen",
  inHetKort:
    "Supplementen vullen een goede voeding aan, ze vervangen die niet. In je traject bespreekt Marlon welke bij jou passen. Hieronder lees je over de vier categorieën die we het vaakst bespreken.",
  blocks: [
    { type: "h2", id: "basis", text: "Vier basissupplementen" },
    {
      type: "p",
      text: "Supplementadvies krijg je binnen je traject. Wat je nodig hebt hangt af van je voeding, je leefstijl en je plan. Gebruik je medicijnen of ben je zwanger? Overleg dan eerst met je huisarts.",
    },
    { type: "h2", id: "multivitamine", text: "Multivitamine" },
    {
      type: "p",
      text: "Een multivitamine kan een basisaanvulling zijn als je voeding niet altijd compleet is. B-vitamines dragen bij aan de vermindering van vermoeidheid en uitputting. Vitamine C, vitamine D, ijzer en zink dragen bij aan de normale werking van het immuunsysteem.",
    },
    { type: "h2", id: "visolie", text: "Omega-3-visolie" },
    {
      type: "p",
      text: "Visolie bevat de omega-3-vetzuren EPA en DHA. EPA en DHA dragen bij aan de normale werking van het hart, bij een dagelijkse inname van minstens 250 mg EPA en DHA. DHA draagt bij aan het behoud van een normale hersenfunctie en een normaal gezichtsvermogen, bij een dagelijkse inname van 250 mg DHA.",
    },
    { type: "h2", id: "matcha", text: "Groene-thee-extract" },
    {
      type: "p",
      text: "Groene thee en groene-thee-extract zijn populair als onderdeel van een dagelijkse routine. Marlon bespreekt met je of het bij jouw plan past. Heb je last van onrust of slaap je slecht, houd er dan rekening mee dat groene thee cafeïne bevat.",
    },
    { type: "h2", id: "fundazymes", text: "Spijsverteringsenzymen" },
    {
      type: "p",
      text: "Spijsverteringsenzymen zijn plantaardige extracten, bijvoorbeeld uit ananas en papaya. Ze worden soms gebruikt als aanvulling bij maaltijden. Heb je vragen of klachten bij je spijsvertering, bespreek die dan met je huisarts.",
    },
  ],
  related: ["voeding", "hoewerkt", "profielen"],
  dateModified: DATE_MODIFIED,
};
