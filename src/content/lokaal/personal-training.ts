import type { DienstPagina } from "./types";
import {
  AREA_SERVED_REGIO,
  CTA_KENNISMAKING,
  marlon,
  placeholder,
  REGIO_PLAATSEN,
  VOORHEEN_KORT,
} from "./gedeeld";

// COPY: confirm met Marlon (hele pagina). De tekst volgt het dienstsjabloon uit
// mockup v2 en gebruikt de bestaande tekst van /aanbod; deze pagina staat niet
// zelf in de mockup.
export const personalTraining: DienstPagina = {
  status: "concept",
  slug: "personal-training",
  bijgewerkt: "2026-11-17",
  seo: {
    title: "Personal training in Loosdrecht, voor het Gooi",
    description:
      "Personal training één op één met Marlon, ook als Duo. Kleine studio in Loosdrecht, op 10 minuten van Hilversum. Plan een kennismaking.",
  },
  eyebrow: "Personal training",
  h1: "Personal training in Loosdrecht",
  lead: "Eén-op-één, volledig op maat. Elke sessie is afgestemd op jouw lichaam, niveau en ambities, met de volle aandacht van Marlon.",
  heroImage: placeholder("Beeldvullende foto: personal training met Marlon"),
  // Dienstpagina "personal training": hoofdknop is de kennismaking, niet de proefles.
  cta: { primair: CTA_KENNISMAKING },
  stats: [
    { waarde: "1 op 1", label: "met Marlon" },
    { waarde: "Ook als Duo", label: "samen trainen" },
  ],
  basis: {
    eyebrow: "Wat je krijgt",
    titel: "Een traject dat bij je past",
    intro: "Je begint met een intake. Daarna werkt Marlon met jou aan een schema dat op jouw doel is gebouwd.",
    items: [
      {
        titel: "Intake en assessment",
        tekst: "Een beeld van je huidige niveau, voordat je begint.",
      },
      {
        titel: "Gepersonaliseerd schema",
        tekst: "Opgebouwd rond jouw doel en jouw lichaam.",
      },
      {
        titel: "Continue begeleiding",
        tekst: "Marlon stuurt bij waar nodig, sessie na sessie.",
      },
      {
        titel: "Voedingsadvies op maat",
        tekst: "Afgestemd op wat jij nodig hebt.",
      },
    ],
  },
  trainerKop: "Jouw trainer",
  trainer: marlon(
    "Eigenaar van The Movement Club en jouw trainer van intake tot schema.",
  ),
  vormen: {
    eyebrow: "Zo train je met Marlon",
    titel: "Drie manieren",
    kaarten: [
      {
        titel: "Personal training",
        tekst: "Eén op één, flexibel in te plannen.",
        link: { label: "Bekijk prijzen", href: "/prijzen" },
        uitgelicht: true,
      },
      {
        titel: "Duo",
        tekst: "Train samen met iemand anders, met dezelfde persoonlijke aandacht.",
        link: { label: "Bekijk prijzen", href: "/prijzen" },
      },
      {
        titel: "12-weken programma",
        tekst:
          "Eerst meten, dan pas trainen. Een persoonlijk traject van twaalf weken met volledige meting, hormonaal profiel, voeding en dagelijkse begeleiding.",
        link: { label: "12-weken programma", href: "/12-weken-programma" },
      },
    ],
  },
  faqKop: { eyebrow: "Veelgestelde vragen", titel: "Voor je eerste sessie" },
  faq: [
    {
      vraag: "Hoe ziet de kennismaking eruit?",
      // Wacht op Marlon: gratis of betaald, hoe lang.
      antwoord: undefined,
    },
    {
      vraag: "Kan ik samen met iemand anders trainen?",
      // Wacht op Marlon: hoe werkt Duo.
      antwoord: undefined,
    },
    {
      vraag: "Hoe vaak moet ik trainen?",
      // Wacht op Marlon.
      antwoord: undefined,
    },
  ],
  regio: {
    tekst:
      "Studio aan de Industrieweg in Loosdrecht, parkeren voor de deur. Leden komen uit:",
    plaatsen: REGIO_PLAATSEN,
  },
  serviceType: "Personal training",
  areaServed: AREA_SERVED_REGIO,
  voorheen: VOORHEEN_KORT,
  afsluiter: {
    titel: "Kennismaken met Marlon",
    tekst:
      "Vertel waar je naartoe wilt. Marlon neemt contact op en plant een eerste afspraak.",
    primair: CTA_KENNISMAKING,
  },
};
