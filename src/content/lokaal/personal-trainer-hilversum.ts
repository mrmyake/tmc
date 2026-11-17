import type { LocatiePagina } from "./types";
import { CTA_KENNISMAKING } from "./gedeeld";

// COPY: confirm met Marlon (hele pagina, copy uit mockup v2)
export const personalTrainerHilversum: LocatiePagina = {
  status: "concept",
  slug: "personal-trainer-hilversum",
  bijgewerkt: "2026-11-17",
  plaats: "Hilversum",
  gedektePlaatsen: ["Hilversum"],
  seo: {
    title: "Personal trainer bij Hilversum",
    description:
      "Personal training op 10 minuten van Hilversum. Kleine studio in Loosdrecht, parkeren voor de deur, voorheen PT Loosdrecht. Plan een kennismaking.",
  },
  eyebrow: "Vanuit Hilversum",
  h1: "Personal trainer bij Hilversum",
  lead: "Een rustige studio in Loosdrecht, net buiten Hilversum. Parkeren voor de deur, en een trainer die je hele traject kent.",
  cta: {
    primair: CTA_KENNISMAKING,
    secundair: { label: "Bekijk personal training", href: "/personal-training" },
  },
  voorheen:
    "Kende je PT Loosdrecht? Dat is nu The Movement Club. Zelfde trainer, nieuwe studio.",
  kaart: { lat: 52.2292, lon: 5.1669 },
  // De enige reistijd die al vastligt: ongeveer 10 minuten met de auto vanaf het
  // centrum van Hilversum (staat ook op /yoga). Fiets en ov wachten op meting.
  reistijdAutoMin: 10,
  reistijdAutoVanaf: "het centrum van Hilversum",
  reistijdFietsMin: undefined,
  reistijdFietsVanaf: undefined,
  ov: undefined,
  parkeren: "Voor de deur",
  quoteKop: "Wie er uit Hilversum traint",
  // Wacht op Marlon: quote van een lid uit Hilversum, met schriftelijke toestemming.
  quote: undefined,
  tijden: {
    eyebrow: "Wanneer het past",
    titel: "Voor je werk of na je werk",
    tekst:
      "Train je vroeg en ga je daarna door naar Hilversum of de trein? Of juist na je werk? Personal training plan je samen met Marlon.",
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
  faqKop: { eyebrow: "Vragen uit Hilversum", titel: "Goed om te weten" },
  faq: [
    {
      vraag: "Hoe lang ben ik onderweg vanuit Hilversum?",
      // Bekend: met de auto zo'n tien minuten vanaf het centrum. De fietstijd
      // wacht op meting, dus het antwoord blijft leeg tot het compleet is.
      antwoord: undefined,
    },
    {
      vraag: "Waarom niet een trainer in Hilversum zelf?",
      // Wacht op Marlon: wat maakt TMC anders, in eigen woorden.
      antwoord: undefined,
    },
    {
      vraag: "Kan ik eerst kennismaken?",
      // Wacht op Marlon: hoe gaat de kennismaking voor PT, gratis of betaald, hoe lang?
      antwoord: undefined,
    },
  ],
  buurplaatsen: [
    { label: "Personal trainer Bussum", pagina: "personal-trainer-bussum" },
    { label: "Personal trainer Laren", pagina: "personal-trainer-laren" },
    { label: "Personal trainer het Gooi", pagina: "personal-trainer-gooi" },
  ],
  afsluiter: {
    titel: "Kennismaken met Marlon",
    tekst:
      "Vertel waar je naartoe wilt. Marlon neemt contact op en plant een eerste afspraak.",
    primair: CTA_KENNISMAKING,
  },
  serviceType: "Personal training",
  areaServed: ["Hilversum", "Loosdrecht"],
};
