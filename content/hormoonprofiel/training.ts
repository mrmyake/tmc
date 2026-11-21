import type { HpPage } from "./types";
import { DATE_MODIFIED } from "./shared";

// COPY: confirm met Marlon (alle teksten in dit bestand)

export const training: HpPage = {
  key: "training",
  topic: "Het belang van hormoontraining",
  metaDescription:
    "Hormoontraining is trainen met een doel, afgestemd op je profiel. Lees over doelgericht trainen, tempo en het verschil tussen intervaltraining en langdurige cardio.",
  h1: "Het belang van hormoontraining",
  eyebrow: "Training",
  inHetKort:
    "Hormoontraining is een trainingsschema dat is afgestemd op je profiel en je doel. Elke training heeft een functie in het geheel, zodat je weet waarom je doet wat je doet. Tempo, intensiteit en herstel zijn daarbij de belangrijkste knoppen.",
  blocks: [
    { type: "h2", id: "doelgericht", text: "Doelgericht trainen" },
    {
      type: "p",
      text: "Veel mensen sporten zonder helder doel. Bij hormoontraining werkt elke sessie naar jouw einddoel toe. De richtlijnen zijn afgestemd op je profiel, en Marlon legt ze in je plan uit.",
    },
    { type: "h2", id: "tempo", text: "Het belang van tempo" },
    {
      type: "p",
      text: "Het tempo waarmee je een herhaling uitvoert bepaalt hoe lang je spieren onder spanning staan. Een gecontroleerd tempo geeft meer grip op de beweging en helpt je blessures te voorkomen. Welk tempo bij je past, hangt af van je profiel en je doel.",
    },
    { type: "h2", id: "intensiteit", text: "Intervaltraining of langdurige cardio" },
    {
      type: "p",
      text: "Intervaltraining (HIT) wisselt korte, intensieve inspanning af met herstel. Onderzoek laat zien dat het een tijdefficiënte manier is om je conditie te verbeteren. Rustige duurinspanning heeft zeker een plek, maar is voor veel mensen niet de enige of beste keuze als ze ook kracht en spiermassa willen opbouwen. Een mix van krachttraining, intervallen en rustige beweging past bij de meeste profielen.",
    },
    {
      type: "sources",
      intro: "Meer lezen:",
      items: [
        { label: "BarBend: tempo training", href: "https://barbend.com/tempo-training-strength-exercises/" },
        {
          label: "Harvard Health: high intensity exercise and your heart",
          href: "https://www.health.harvard.edu/exercise-and-fitness/high-intensity-exercise-and-your-heart",
        },
      ],
    },
    { type: "h2", id: "tmc", text: "Trainen bij The Movement Club" },
    {
      type: "tmcLinks",
      intro:
        "Je plan kun je uitvoeren in de studio in Loosdrecht, onder begeleiding. Lees meer over onze training:",
      links: [
        { label: "Krachttraining", href: "/krachttraining" },
        { label: "Kettlebelltraining", href: "/kettlebell-training" },
      ],
    },
  ],
  related: ["profielen", "voeding", "hoewerkt"],
  dateModified: DATE_MODIFIED,
};
