import { CLASS_CAPACITY } from "@/lib/constants";
import type { HubPagina } from "./types";
import { CTA_KENNISMAKING, CTA_PROEFLES, VOORHEEN_KORT } from "./gedeeld";

// COPY: confirm met Marlon (hele pagina, copy uit mockup v2)
// Coordinaten zijn de centra van de plaatsen (openbare gegevens); de kaart is
// schematisch. Reistijden wachten op meting door Marlon of Ilja, behalve de ene
// bekende: ongeveer 10 minuten met de auto vanaf het centrum van Hilversum.
export const personalTrainerGooi: HubPagina = {
  status: "concept",
  slug: "personal-trainer-gooi",
  bijgewerkt: "2026-11-17",
  seo: {
    title: "Personal trainer in het Gooi",
    description:
      "Personal training, kettlebell en yoga voor het Gooi. Reistijden vanaf Hilversum, Bussum, Laren en meer. Kleine studio in Loosdrecht.",
  },
  eyebrow: "Regio",
  h1: "Personal trainer in het Gooi",
  lead: "The Movement Club staat in Loosdrecht, aan de rand van het Gooi. Personal training, kleine groepslessen en vrij trainen, met parkeren voor de deur.",
  cta: { primair: CTA_KENNISMAKING, secundair: CTA_PROEFLES },
  voorheen: VOORHEEN_KORT,
  plaatsenKop: { eyebrow: "Per plaats", titel: "Uit jouw plaats" },
  plaatsen: [
    {
      naam: "Hilversum",
      lat: 52.2292,
      lon: 5.1669,
      pagina: "personal-trainer-hilversum",
      omschrijving: "Route, parkeren en trainingstijden vanuit Hilversum.",
      reistijdAutoMin: 10,
      reistijdFietsMin: undefined,
    },
    {
      naam: "Bussum",
      lat: 52.2736,
      lon: 5.1625,
      pagina: "personal-trainer-bussum",
      omschrijving: "Route en tijden vanuit Bussum en Naarden.",
    },
    {
      naam: "Laren",
      lat: 52.2569,
      lon: 5.225,
      pagina: "personal-trainer-laren",
      omschrijving: "Route en tijden vanuit Laren, Blaricum en Eemnes.",
    },
    { naam: "Blaricum", lat: 52.2717, lon: 5.2467 },
    { naam: "Huizen", lat: 52.299, lon: 5.2417 },
    { naam: "Naarden", lat: 52.2956, lon: 5.1611 },
    { naam: "Eemnes", lat: 52.2528, lon: 5.2567 },
  ],
  reistijden: {
    eyebrow: "Reistijden",
    titel: "Hoe ver is het vanaf jou?",
    intro: "Gemeten op een doordeweekse ochtend, vanaf het centrum van elke plaats.",
  },
  waarom: {
    eyebrow: "Waarom naar Loosdrecht",
    titel: "Klein, rustig en persoonlijk",
    punten: [
      {
        titel: "Kleine groepen",
        tekst: `Maximaal ${CLASS_CAPACITY.yogaMobility} bij yoga en mobility, maximaal ${CLASS_CAPACITY.kettlebell} bij kettlebell.`,
      },
      {
        titel: "Eén trainer die je kent",
        tekst: "Marlon volgt je van intake tot schema.",
      },
      {
        titel: "Geen gedoe met parkeren",
        tekst: "Ruim parkeren voor de deur aan de Industrieweg.",
      },
    ],
  },
  aanbod: {
    eyebrow: "Aanbod",
    titel: "Wat je bij ons kunt doen",
    regels: [
      {
        titel: "Personal training",
        tekst: "Eén op één of als Duo.",
        href: "/personal-training",
      },
      {
        titel: "Kettlebell training",
        tekst: "Les van een Kettlebell Master.",
        href: "/kettlebell-training",
      },
      {
        titel: "Yoga en mobility",
        tekst: `Vijf vormen, max ${CLASS_CAPACITY.yogaMobility} per les.`,
        href: "/yoga",
      },
      {
        titel: "12-weken programma",
        tekst: "Een vast traject met begeleiding.",
        href: "/12-weken-programma",
      },
    ],
  },
  afsluiter: {
    titel: "Kennismaken met Marlon",
    tekst:
      "Vertel waar je naartoe wilt. Marlon neemt contact op en plant een eerste afspraak.",
    primair: CTA_KENNISMAKING,
    secundair: CTA_PROEFLES,
  },
  serviceType: "Personal training",
  areaServed: [
    "Loosdrecht",
    "Hilversum",
    "Bussum",
    "Naarden",
    "Laren",
    "Blaricum",
    "Eemnes",
    "Huizen",
    "'t Gooi",
  ],
};
