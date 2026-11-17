import { CLASS_CAPACITY } from "@/lib/constants";
import type { DienstPagina } from "./types";
import {
  AREA_SERVED_REGIO,
  CTA_PROEFLES,
  CTA_ROOSTER,
  marlon,
  placeholder,
  REGIO_PLAATSEN,
} from "./gedeeld";

// COPY: confirm met Marlon (hele pagina, copy uit mockup v2)
export const kettlebellTraining: DienstPagina = {
  status: "concept",
  slug: "kettlebell-training",
  bijgewerkt: "2026-11-17",
  seo: {
    title: "Kettlebell training in Loosdrecht, voor het Gooi",
    description: `Kettlebell training in kleine groepen van max ${CLASS_CAPACITY.kettlebell}, onder begeleiding van Kettlebell Master Marlon. Op 10 minuten van Hilversum. Plan je proefles.`,
  },
  eyebrow: "Kettlebell",
  h1: "Kettlebell training in Loosdrecht",
  lead: "Sterker worden met één stuk ijzer en goede techniek. Les van Kettlebell Master Marlon, op zo'n tien minuten van Hilversum.",
  heroImage: placeholder("Beeldvullende foto: swing in de Kracht Studio"),
  cta: { primair: CTA_PROEFLES, secundair: CTA_ROOSTER },
  stats: [
    { waarde: `Max ${CLASS_CAPACITY.kettlebell}`, label: "per les" },
    { waarde: "60 min", label: "kracht en conditie" },
    // Besluit 8: geen eigen reviewscore; de Google-badge staat elders op de site.
    { waarde: "Kettlebell Master", label: "Marlon geeft de les" },
  ],
  basis: {
    eyebrow: "De basis",
    titel: "Drie bewegingen die je hier leert",
    intro: "Elke les bouwt op dezelfde basis. Eerst de techniek, dan pas het gewicht.",
    items: [
      {
        titel: "Swing",
        tekst: "De motor van elke les. Kracht uit je heupen, niet uit je rug.",
        beeld: placeholder("Foto swing"),
      },
      {
        titel: "Goblet squat",
        tekst: "Diep zitten met een rechte rug. De basis voor sterke benen.",
        beeld: placeholder("Foto goblet squat"),
      },
      {
        titel: "Turkish get-up",
        tekst:
          "Van liggen naar staan met de kettlebell boven je hoofd. Controle en stabiliteit.",
        beeld: placeholder("Foto get-up"),
      },
    ],
  },
  trainerKop: "Les van een Kettlebell Master",
  trainer: marlon(
    "Eigenaar van The Movement Club en Kettlebell Master.",
    // Wacht op Marlon: opleiding en certificering, één zin.
    undefined,
  ),
  rooster: { pijler: "kettlebell", titel: "Kettlebell deze week" },
  vormen: {
    eyebrow: "Zo train je kettlebell bij ons",
    titel: "Drie manieren",
    // Een vierde kaart "Kettlebell bootcamp buiten" kan hier bij, zodra Marlon
    // bevestigt dat die nog bestaat. Het sjabloon past zich aan.
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
        tekst:
          "Kettlebells liggen klaar. Train zelf op je eigen tijd, met schema in de app.",
        link: { label: "Vrij trainen", href: "/aanbod#vrij-trainen" },
      },
    ],
  },
  faqKop: { eyebrow: "Veelgestelde vragen", titel: "Voor je eerste les" },
  faq: [
    {
      vraag: "Ik heb nog nooit met een kettlebell getraind. Kan ik meedoen?",
      // Mockup: "Ja. Marlon begint met de basis en kiest samen met jou een gewicht
      // dat past." plus een open stuk: hoe ziet de eerste les eruit? Wacht op Marlon.
      antwoord: undefined,
    },
    {
      vraag: "Welk gewicht moet ik nemen?",
      // Wacht op Marlon: richtlijn startgewicht.
      antwoord: undefined,
    },
    {
      vraag: "Is kettlebell slecht voor mijn rug?",
      // Wacht op Marlon: antwoord over techniek en hip hinge.
      antwoord: undefined,
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
