import type { LocatiePagina } from "./types";
import { CTA_KENNISMAKING } from "./gedeeld";

// COPY: confirm met Marlon (hele pagina)
// Reistijden: Google Maps, dinsdag 17-11-2026 rond 11:15, vertrek nu, bestemming
// Industrieweg 14P. Zie spec-locatiepaginas.md, sectie Reistijden.
export const personalTrainerLaren: LocatiePagina = {
  status: "live",
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
  reistijdAutoMin: 18,
  reistijdAutoVanaf: "het centrum van Laren",
  reistijdFietsMin: 36,
  reistijdFietsVanaf: "het centrum van Laren",
  extraVertrekpunten: [
    { van: "Blaricum", autoMin: 21 },
    { van: "Eemnes", autoMin: 20 },
  ],
  parkeren: "Parkeren voor de deur",
  quoteEyebrow: "Ervaringen",
  quoteKop: "Wat klanten zeggen",
  quote: {
    tekst: "Ze is professioneel, gepassioneerd en weet precies hoe ze mijn doelen kan helpen realiseren.",
    voornaam: "Jeroen",
    woonplaats: "Loosdrecht",
    bron: "Google-review",
    toestemmingsdatum: "2026-11-17",
  },
  tijden: {
    eyebrow: "Wanneer het past",
    titel: "Voor je werk of na je werk",
    tekst:
      "Train je vroeg of juist na je werk? Personal training plan je samen met Marlon.",
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
        tekst: "Yoga en kettlebell in kleine groepen.",
        href: "/aanbod#groepslessen",
      },
      {
        titel: "Vrij trainen",
        tekst: "Zelf trainen op je eigen tijd, in de studio.",
        href: "/aanbod#vrij-trainen",
      },
    ],
  },
  faqKop: { eyebrow: "Vragen uit Laren", titel: "Goed om te weten" },
  faq: [
    {
      vraag: "Hoe lang ben ik onderweg vanuit Laren?",
      antwoord:
        "Met de auto 18 minuten vanaf het centrum en 36 minuten met de fiets. Vanuit Blaricum rijd je 21 minuten, vanuit Eemnes 20.",
    },
    {
      vraag: "Is dat niet ver voor een training?",
      antwoord:
        "Je rijdt ongeveer achttien minuten, via de Utrechtseweg of de A27, en parkeert voor de deur. Je traint in een kleine studio met persoonlijke begeleiding, zonder drukte.",
    },
    {
      vraag: "Kan ik eerst kennismaken?",
      antwoord:
        "Ja. Je begint met een gratis en vrijblijvende intake in de studio, waarin Marlon je doel en je situatie met je doorneemt. Vul het terugbelformulier in, dan neemt ze contact met je op.",
    },
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
