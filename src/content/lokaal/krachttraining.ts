import { CLASS_CAPACITY } from "@/lib/constants";
import type { DienstPagina } from "./types";
import {
  AREA_SERVED_REGIO,
  CTA_PROEFLES,
  marlon,
  REGIO_PLAATSEN,
} from "./gedeeld";

// COPY: confirm met Marlon (hele pagina). Route-pagina: kracht via de
// kettlebell-groepsles, vrij trainen of personal training. Staat niet
// zelf in de mockup; volgt het dienstsjabloon en de tekst van /aanbod.
export const krachttraining: DienstPagina = {
  status: "live",
  slug: "krachttraining",
  bijgewerkt: "2026-11-17",
  seo: {
    title: "Krachttraining in Loosdrecht, voor het Gooi",
    description:
      "Krachttraining met begeleiding: kettlebell in de groep, vrij trainen of personal training met Marlon. Op 12 minuten van Hilversum.",
  },
  eyebrow: "Krachttraining",
  h1: "Krachttraining in Loosdrecht",
  lead: "Geen random workouts, maar een plan dat je meetbaar sterker maakt, week na week. Kies de vorm die bij je past.",
  heroImage: {
    src: "/images/lokaal/krachttraining-hero.jpg",
    alt: "Een man doet een pull-up aan een rek.",
  },
  cta: { primair: CTA_PROEFLES },
  stats: [
    { waarde: "Groepsles", label: `kettlebell, max ${CLASS_CAPACITY.kettlebell}` },
    { waarde: "Vrij trainen", label: "op je eigen tijd" },
    { waarde: "Personal training", label: "één op één" },
  ],
  basis: {
    eyebrow: "Wat je krijgt",
    titel: "Gestructureerd sterker worden",
    intro:
      "Periodisatie, progressieve overload en herstelbeheer, in plaats van losse trainingen.",
    items: [
      {
        titel: "Progressie bijhouden",
        tekst: "Je ziet wat je tilt en hoe dat groeit.",
      },
      {
        titel: "Techniekanalyse",
        tekst: "Aandacht voor de techniek van compound lifts.",
      },
      {
        titel: "Evaluatiemomenten",
        tekst: "Regelmatig bijsturen op wat je bereikt.",
      },
    ],
  },
  trainerKop: "Met Marlon",
  trainer: marlon("Eigenaar van The Movement Club."),
  vormen: {
    eyebrow: "Zo train je kracht bij ons",
    titel: "Drie routes",
    kaarten: [
      {
        titel: "Kettlebell in de groep",
        tekst: `Kracht en conditie in lessen tot ${CLASS_CAPACITY.kettlebell} personen, met techniek als basis.`,
        link: { label: "Kettlebell training", href: "/kettlebell-training" },
        uitgelicht: true,
      },
      {
        titel: "Vrij trainen",
        tekst: "Train zelf op je eigen tijd, in de studio.",
        link: { label: "Vrij trainen", href: "/aanbod#vrij-trainen" },
      },
      {
        titel: "Personal training",
        tekst: "Eén op één met Marlon, met een schema op jouw doel.",
        link: { label: "Personal training", href: "/personal-training" },
      },
    ],
  },
  faqKop: { eyebrow: "Veelgestelde vragen", titel: "Voor je begint" },
  faq: [
    {
      vraag: "Welke route past bij mij?",
      antwoord:
        "Train je graag in een groep op vaste tijden, kies dan de kettlebell-groepsles. Train je liever zelf op je eigen tijd, dan past vrij trainen. Wil je volledige begeleiding en een schema op maat, dan is personal training de beste keus. Twijfel je, vraag Marlon dan om advies.",
    },
    {
      vraag: "Ik heb nog nooit met gewichten getraind. Kan ik beginnen?",
      antwoord:
        "Ja. Je leert eerst de basisbewegingen met een licht gewicht, onder begeleiding. Het gewicht gaat pas omhoog als de techniek goed zit.",
    },
    {
      vraag: "Hoe vaak per week moet ik trainen?",
      antwoord:
        "Voor de meeste mensen zijn twee tot drie trainingen per week een goed begin. Gevorderden trainen vaak drie tot vier keer per week.",
    },
  ],
  regio: {
    tekst:
      "Studio aan de Industrieweg in Loosdrecht, parkeren voor de deur. Leden komen uit:",
    plaatsen: REGIO_PLAATSEN,
  },
  serviceType: "Krachttraining",
  areaServed: AREA_SERVED_REGIO,
  afsluiter: {
    titel: "Begin met een proefles",
    tekst: "Ervaar in de studio welke vorm bij je past.",
    primair: CTA_PROEFLES,
  },
};
