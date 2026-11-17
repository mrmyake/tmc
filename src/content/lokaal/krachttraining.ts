import { CLASS_CAPACITY } from "@/lib/constants";
import type { DienstPagina } from "./types";
import {
  AREA_SERVED_REGIO,
  CTA_PROEFLES,
  marlon,
  placeholder,
  REGIO_PLAATSEN,
} from "./gedeeld";

// COPY: confirm met Marlon (hele pagina). Route-pagina: kracht via de
// kettlebell-groepsles, vrij trainen met schema of personal training. Staat niet
// zelf in de mockup; volgt het dienstsjabloon en de tekst van /aanbod.
export const krachttraining: DienstPagina = {
  status: "concept",
  slug: "krachttraining",
  bijgewerkt: "2026-11-17",
  seo: {
    title: "Krachttraining in Loosdrecht, voor het Gooi",
    description:
      "Krachttraining met begeleiding: kettlebell in de groep, vrij trainen met schema of personal training met Marlon. Op 10 minuten van Hilversum.",
  },
  eyebrow: "Krachttraining",
  h1: "Krachttraining in Loosdrecht",
  lead: "Geen random workouts, maar een plan dat je meetbaar sterker maakt, week na week. Kies de vorm die bij je past.",
  heroImage: placeholder("Beeldvullende foto: krachttraining in de Kracht Studio"),
  cta: { primair: CTA_PROEFLES },
  stats: [
    { waarde: `Max ${CLASS_CAPACITY.kettlebell}`, label: "per kettlebell-les" },
  ],
  basis: {
    eyebrow: "Wat je krijgt",
    titel: "Gestructureerd sterker worden",
    intro:
      "Periodisatie, progressieve overload en herstelbeheer, in plaats van losse trainingen.",
    items: [
      {
        titel: "Schema op maat",
        tekst: "Een periodisatie-schema dat bij jouw doel past.",
      },
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
        titel: "Vrij trainen met schema",
        tekst: "Train zelf op je eigen tijd, met een schema in de app.",
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
    { vraag: "Welke vorm past bij mij?", antwoord: undefined },
    { vraag: "Kan ik beginnen zonder ervaring?", antwoord: undefined },
    { vraag: "Hoe vaak moet ik trainen om sterker te worden?", antwoord: undefined },
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
