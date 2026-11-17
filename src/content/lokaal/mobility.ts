import { CLASS_CAPACITY } from "@/lib/constants";
import type { DienstPagina } from "./types";
import {
  AREA_SERVED_REGIO,
  CTA_PROEFLES,
  marlon,
  placeholder,
  REGIO_PLAATSEN,
} from "./gedeeld";

// COPY: confirm met Marlon (hele pagina). Volgt het dienstsjabloon uit mockup v2
// en gebruikt de bestaande tekst van /aanbod; deze pagina staat niet zelf in de
// mockup. Er is geen aparte mobility-pijler in het rooster, dus geen live strip
// maar een link naar het gefilterde rooster.
export const mobility: DienstPagina = {
  status: "concept",
  slug: "mobility",
  bijgewerkt: "2026-11-17",
  seo: {
    title: "Mobility training in Loosdrecht, voor het Gooi",
    description: `Mobility sessies in kleine groepen van max ${CLASS_CAPACITY.yogaMobility}. Werk aan je beweeglijkheid, flexibiliteit en lichaamsbewustzijn. Op 10 minuten van Hilversum. Plan je proefles.`,
  },
  eyebrow: "Mobility",
  h1: "Mobility training in Loosdrecht",
  lead: "Mobility is geen nice-to-have, het is de basis. We werken gericht aan je beweeglijkheid, flexibiliteit en lichaamsbewustzijn.",
  heroImage: placeholder("Beeldvullende foto: mobility sessie"),
  cta: { primair: CTA_PROEFLES, secundair: { label: "Bekijk het rooster", href: "/rooster?pijler=yoga_mobility" } },
  stats: [
    { waarde: `Max ${CLASS_CAPACITY.yogaMobility}`, label: "per les" },
  ],
  basis: {
    eyebrow: "Wat je doet",
    titel: "Gericht werken aan hoe je beweegt",
    intro:
      "Ideaal als aanvulling op je training of als zelfstandig traject. Voor iedereen met stijfheid, blessuregevoeligheid of zittend werk.",
    items: [
      {
        titel: "Gerichte mobiliteitsroutines",
        tekst: "Oefeningen die passen bij wat jouw lichaam nodig heeft.",
      },
      {
        titel: "Myofasciale release",
        tekst: "Technieken om spanning los te laten.",
      },
      {
        titel: "Ademhalingswerk",
        tekst: "Ademhaling als basis voor bewegen en herstel.",
      },
      {
        titel: "Bewegingsscreenings",
        tekst: "Zicht op waar je beweging beter kan.",
      },
    ],
  },
  trainerKop: "Met Marlon",
  trainer: marlon("Eigenaar van The Movement Club."),
  // Besluit 9: geen mobility-pijler, dus een link in plaats van een strip.
  rooster: {
    tekst: "Mobility staat samen met yoga in het rooster.",
    link: {
      label: "Bekijk het rooster van yoga en mobility",
      href: "/rooster?pijler=yoga_mobility",
    },
  },
  vormen: {
    eyebrow: "Zo train je mobility bij ons",
    titel: "Drie manieren",
    kaarten: [
      {
        titel: "Groepsles",
        tekst: `Yoga en mobility in groepen tot ${CLASS_CAPACITY.yogaMobility} personen.`,
        link: { label: "Bekijk prijzen", href: "/prijzen" },
        uitgelicht: true,
      },
      {
        titel: "Yoga",
        tekst: "Vijf vormen, van rust tot beweging.",
        link: { label: "Yoga", href: "/yoga" },
      },
      {
        titel: "Personal training",
        tekst: "Mobility als onderdeel van een traject met Marlon.",
        link: { label: "Personal training", href: "/personal-training" },
      },
    ],
  },
  faqKop: { eyebrow: "Veelgestelde vragen", titel: "Voor je eerste les" },
  faq: [
    { vraag: "Voor wie is mobility training?", antwoord: undefined },
    { vraag: "Hoe vaak kan ik het beste komen?", antwoord: undefined },
    { vraag: "Wat is het verschil met yoga?", antwoord: undefined },
  ],
  regio: {
    tekst:
      "Studio aan de Industrieweg in Loosdrecht, parkeren voor de deur. Leden komen uit:",
    plaatsen: REGIO_PLAATSEN,
  },
  serviceType: "Mobility training",
  areaServed: AREA_SERVED_REGIO,
  afsluiter: {
    titel: "Probeer een mobility les",
    tekst: "Kies een les uit het rooster en ervaar het zelf.",
    primair: CTA_PROEFLES,
    secundair: { label: "Bekijk het rooster", href: "/rooster?pijler=yoga_mobility" },
  },
};
