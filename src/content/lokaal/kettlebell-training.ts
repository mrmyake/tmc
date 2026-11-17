import { CLASS_CAPACITY } from "@/lib/constants";
import type { DienstPagina } from "./types";
import {
  AREA_SERVED_REGIO,
  CTA_PROEFLES,
  CTA_ROOSTER,
  marlon,
  REGIO_PLAATSEN,
} from "./gedeeld";

// COPY: confirm met Marlon (hele pagina)
export const kettlebellTraining: DienstPagina = {
  status: "live",
  slug: "kettlebell-training",
  bijgewerkt: "2026-11-17",
  seo: {
    title: "Kettlebell training in Loosdrecht, voor het Gooi",
    description: `Kettlebell training in kleine groepen van max ${CLASS_CAPACITY.kettlebell}, onder begeleiding van Master Kettlebell Marlon. Op 12 minuten van Hilversum. Plan je proefles.`,
  },
  eyebrow: "Kettlebell",
  h1: "Kettlebell training in Loosdrecht",
  lead: "Sterker worden met één stuk ijzer en goede techniek. Les van Master Kettlebell Marlon, op 12 minuten van Hilversum.",
  heroImage: {
    src: "/images/lokaal/kettlebell-hero.jpg",
    alt: "Vijf kettlebells in oplopend gewicht op de vloer van de studio.",
  },
  cta: { primair: CTA_PROEFLES, secundair: CTA_ROOSTER },
  stats: [
    { waarde: `Max ${CLASS_CAPACITY.kettlebell}`, label: "per les" },
    // Duur uit tmc.class_types en class_sessions (Kettlebell Power, 60 minuten).
    { waarde: "60 min", label: "kracht en conditie" },
    { waarde: "Master Kettlebell", label: "Overload Worldwide" },
  ],
  basis: {
    eyebrow: "De basis",
    titel: "Drie bewegingen die je hier leert",
    intro: "Elke les bouwt op dezelfde basis. Eerst de techniek, dan pas het gewicht.",
    items: [
      {
        titel: "Swing",
        tekst: "De motor van elke les. Kracht uit je heupen, niet uit je rug.",
      },
      {
        titel: "Goblet squat",
        tekst: "Diep zitten met een rechte rug. De basis voor sterke benen.",
        beeld: {
          src: "/images/lokaal/goblet-squat.jpg",
          alt: "Een groep traint goblet squats met kettlebells terwijl de trainer een deelnemer corrigeert.",
        },
      },
      {
        titel: "Turkish get-up",
        tekst:
          "Van liggen naar staan met de kettlebell boven je hoofd. Controle en stabiliteit.",
      },
    ],
  },
  trainerKop: "Les van een Master Kettlebell",
  trainer: marlon(
    "Marlon is eigenaar van The Movement Club en opgeleid als Master Kettlebell en T.O.P Personal Trainer bij Overload Worldwide.",
  ),
  rooster: { pijler: "kettlebell", titel: "Kettlebell deze week" },
  vormen: {
    eyebrow: "Zo train je kettlebell bij ons",
    titel: "Drie manieren",
    kaarten: [
      {
        titel: "Groepsles",
        tekst: `Vaste tijden, maximaal ${CLASS_CAPACITY.kettlebell} per les. Valt onder het kettlebell-abonnement of All Access.`,
        link: { label: "Bekijk prijzen", href: "/prijzen" },
        uitgelicht: true,
      },
      {
        titel: "Personal training",
        tekst: "Eén op één met Marlon, met een schema op jouw doel. Ook als Duo.",
        link: { label: "Personal training", href: "/personal-training" },
      },
      {
        titel: "Vrij trainen",
        tekst: "Kettlebells liggen klaar. Train zelf op je eigen tijd.",
        link: { label: "Vrij trainen", href: "/aanbod#vrij-trainen" },
      },
    ],
  },
  faqKop: { eyebrow: "Veelgestelde vragen", titel: "Voor je eerste les" },
  faq: [
    {
      vraag: "Ik heb nog nooit met een kettlebell getraind. Hoe ziet mijn eerste les eruit?",
      antwoord:
        "Iedereen begint bij de basis. Je leert eerst de swing en de squat met een licht gewicht. Marlon kijkt mee en corrigeert je techniek; pas als die goed zit, gaat het gewicht omhoog.",
    },
    {
      vraag: "Welk gewicht moet ik nemen?",
      antwoord:
        "Dat kies je in de les samen met Marlon. Je begint licht, zodat je de beweging goed leert. Er liggen kettlebells in verschillende gewichten klaar, dus je schuift op zodra het goed gaat.",
    },
    {
      vraag: "Is kettlebell slecht voor mijn rug?",
      antwoord:
        "Niet als je de techniek goed uitvoert. Bij de swing komt de kracht uit je heupen, niet uit je onderrug, en daar besteedt Marlon veel aandacht aan. Heb je rugklachten, meld dat dan vooraf, dan past ze de oefeningen aan.",
    },
    {
      vraag: "Wat neem ik mee?",
      antwoord:
        "Sportkleding, een handdoek en een flesje water. Kettlebells liggen klaar.",
    },
  ],
  regio: {
    tekst:
      "Studio aan de Industrieweg in Loosdrecht, parkeren voor de deur. Leden komen uit:",
    plaatsen: REGIO_PLAATSEN,
  },
  serviceType: "Kettlebell training",
  areaServed: AREA_SERVED_REGIO,
  afsluiter: {
    titel: "Probeer een kettlebellles",
    tekst:
      "Kies een les uit het rooster. Marlon laat je de techniek zien voordat je begint.",
    primair: CTA_PROEFLES,
    secundair: CTA_ROOSTER,
  },
};
