import type { LocatiePagina } from "./types";
import { CTA_KENNISMAKING } from "./gedeeld";

// COPY: confirm met Marlon (hele pagina). Volgt het locatiesjabloon uit
// mockup v2 ("Bussum en Laren gebruiken exact dit sjabloon met eigen inhoud");
// de plaatsspecifieke inhoud is nog niet aangeleverd en blijft leeg.
export const personalTrainerLaren: LocatiePagina = {
  status: "concept",
  slug: "personal-trainer-laren",
  bijgewerkt: "2026-11-17",
  plaats: "Laren",
  gedektePlaatsen: ["Laren", "Blaricum", "Eemnes"],
  seo: {
    title: "Personal trainer bij Laren, Blaricum en Eemnes",
    description:
      "Personal training vlak bij Laren, Blaricum en Eemnes. Kleine studio in Loosdrecht, parkeren voor de deur, voorheen PT Loosdrecht. Plan een kennismaking.",
  },
  eyebrow: "Vanuit Laren",
  h1: "Personal trainer bij Laren, Blaricum en Eemnes",
  lead: "Een rustige studio in Loosdrecht, aan de rand van het Gooi. Parkeren voor de deur, en een trainer die je hele traject kent.",
  cta: {
    primair: CTA_KENNISMAKING,
    secundair: { label: "Bekijk personal training", href: "/personal-training" },
  },
  voorheen:
    "Kende je PT Loosdrecht? Dat is nu The Movement Club. Zelfde trainer, nieuwe studio.",
  kaart: { lat: 52.2569, lon: 5.2250 },
  // Wacht op meting: reistijd auto en fiets (doordeweekse ochtend, twee punten).
  reistijdAutoMin: undefined,
  reistijdAutoVanaf: undefined,
  reistijdFietsMin: undefined,
  reistijdFietsVanaf: undefined,
  ov: undefined,
  parkeren: "Voor de deur",
  quoteKop: "Wie er uit Laren traint",
  // Wacht op Marlon: quote van een lid uit Laren, met schriftelijke toestemming.
  quote: undefined,
  tijden: {
    eyebrow: "Wanneer het past",
    titel: "Voor je werk of na je werk",
    tekst:
      "Train je vroeg of juist na je werk? Personal training plan je samen met Marlon.",
    // Wacht op Marlon: vaste PT-tijden of in overleg?
    ptTijden: undefined,
  },
  aanbod: {
    eyebrow: "Wat je kunt doen",
    titel: "Van één sessie tot een traject",
    regels: [
      {
        titel: "Personal training",
        tekst: "Eén op één of als Duo, met intake en schema.",
        href: "/personal-training",
      },
      {
        titel: "12-weken programma",
        tekst: "Een vast traject met onbeperkt groepslessen erbij.",
        href: "/12-weken-programma",
      },
      {
        titel: "Groepslessen",
        tekst: "Yoga, mobility en kettlebell in kleine groepen.",
        href: "/aanbod#groepslessen",
      },
      {
        titel: "Vrij trainen",
        tekst: "Zelf trainen met je schema in de app.",
        href: "/aanbod#vrij-trainen",
      },
    ],
  },
  faqKop: { eyebrow: "Vragen uit Laren", titel: "Goed om te weten" },
  faq: [
    { vraag: "Hoe lang ben ik onderweg vanuit Laren?", antwoord: undefined },
    { vraag: "Waarom niet een trainer in Laren zelf?", antwoord: undefined },
    { vraag: "Kan ik eerst kennismaken?", antwoord: undefined },
  ],
  buurplaatsen: [
    { label: "Personal trainer Hilversum", pagina: "personal-trainer-hilversum" },
    { label: "Personal trainer Bussum", pagina: "personal-trainer-bussum" },
    { label: "Personal trainer het Gooi", pagina: "personal-trainer-gooi" },
  ],
  afsluiter: {
    titel: "Kennismaken met Marlon",
    tekst:
      "Vertel waar je naartoe wilt. Marlon neemt contact op en plant een eerste afspraak.",
    primair: CTA_KENNISMAKING,
  },
  serviceType: "Personal training",
  areaServed: ["Laren", "Blaricum", "Eemnes", "Loosdrecht"],
};
