import { CLASS_CAPACITY } from "@/lib/constants";
import type { HubPagina } from "./types";
import { CTA_KENNISMAKING, CTA_PROEFLES, VOORHEEN_KORT } from "./gedeeld";

// COPY: confirm met Marlon (hele pagina, copy uit mockup v2)
// Coordinaten zijn de centra van de plaatsen (openbare gegevens); de kaart is
// schematisch. Reistijden: Google Maps, dinsdag 17-11-2026 rond 11:15, vertrek nu,
// bestemming Industrieweg 14P, vertrekpunt het centrum van elke plaats. Zie
// spec-locatiepaginas.md, sectie Reistijden.
export const personalTrainerGooi: HubPagina = {
  status: "live",
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
      reistijdAutoMin: 12,
      reistijdFietsMin: 19,
    },
    {
      naam: "Bussum",
      lat: 52.2736,
      lon: 5.1625,
      pagina: "personal-trainer-bussum",
      omschrijving: "Route en tijden vanuit Bussum en Naarden.",
      reistijdAutoMin: 20,
      reistijdFietsMin: 34,
    },
    {
      naam: "Laren",
      lat: 52.2569,
      lon: 5.225,
      pagina: "personal-trainer-laren",
      omschrijving: "Route en tijden vanuit Laren, Blaricum en Eemnes.",
      reistijdAutoMin: 18,
      reistijdFietsMin: 36,
    },
    { naam: "Blaricum", lat: 52.2717, lon: 5.2467, reistijdAutoMin: 21, reistijdFietsMin: 47 },
    { naam: "Huizen", lat: 52.299, lon: 5.2417, reistijdAutoMin: 23, reistijdFietsMin: 53 },
    { naam: "Naarden", lat: 52.2956, lon: 5.1611, reistijdAutoMin: 25, reistijdFietsMin: 43 },
    { naam: "Eemnes", lat: 52.2528, lon: 5.2567, reistijdAutoMin: 20, reistijdFietsMin: 45 },
  ],
  reistijden: {
    eyebrow: "Reistijden",
    titel: "Hoe ver is het vanaf jou?",
    intro: "Gemeten met Google Maps op een doordeweekse ochtend, vanaf het centrum van elke plaats.",
  },
  waarom: {
    eyebrow: "Waarom naar Loosdrecht",
    titel: "Klein, rustig en persoonlijk",
    punten: [
      {
        titel: "Kleine groepen",
        tekst: `Maximaal ${CLASS_CAPACITY.yogaMobility} bij yoga, maximaal ${CLASS_CAPACITY.kettlebell} bij kettlebell.`,
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
        tekst: "Les van een Master Kettlebell.",
        href: "/kettlebell-training",
      },
      {
        titel: "Yoga",
        tekst: `Vijf vormen, maximaal ${CLASS_CAPACITY.yogaMobility} per les.`,
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
