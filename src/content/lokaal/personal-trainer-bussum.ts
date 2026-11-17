import type { LocatiePagina } from "./types";
import { CTA_KENNISMAKING } from "./gedeeld";

// COPY: confirm met Marlon (hele pagina)
// Reistijden: Google Maps, dinsdag 17-11-2026 rond 11:15, vertrek nu, bestemming
// Industrieweg 14P. Zie spec-locatiepaginas.md, sectie Reistijden.
export const personalTrainerBussum: LocatiePagina = {
  status: "live",
  slug: "personal-trainer-bussum",
  bijgewerkt: "2026-11-17",
  plaats: "Bussum",
  gedektePlaatsen: ["Bussum", "Naarden"],
  seo: {
    title: "Personal trainer bij Bussum en Naarden",
    description:
      "Personal training vlak bij Bussum en Naarden. Kleine studio in Loosdrecht, parkeren voor de deur, voorheen PT Loosdrecht. Plan een kennismaking.",
  },
  eyebrow: "Vanuit Bussum",
  h1: "Personal trainer bij Bussum en Naarden",
  lead: "Een rustige studio in Loosdrecht, aan de rand van het Gooi. Parkeren voor de deur, en een trainer die je hele traject kent.",
  cta: {
    primair: CTA_KENNISMAKING,
    secundair: { label: "Bekijk personal training", href: "/personal-training" },
  },
  voorheen:
    "Kende je PT Loosdrecht? Dat is nu The Movement Club. Zelfde trainer, nieuwe studio.",
  kaart: { lat: 52.2736, lon: 5.1625 },
  reistijdAutoMin: 20,
  reistijdAutoVanaf: "het centrum van Bussum",
  reistijdFietsMin: 34,
  reistijdFietsVanaf: "het centrum van Bussum",
  extraVertrekpunten: [
    { van: "Naarden", autoMin: 25 },
  ],
  parkeren: "Parkeren voor de deur",
  quoteEyebrow: "Ervaringen",
  quoteKop: "Wat klanten zeggen",
  quote: {
    tekst: "Een persoonlijke aanpak (wat een fijn mens!) en een op maat gemaakt traject, precies afgestemd op wat je lijf nodig heeft en het was ook echt goed vol te houden.",
    voornaam: "Savannah",
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
        tekst: "Yoga, mobility en kettlebell in kleine groepen.",
        href: "/aanbod#groepslessen",
      },
      {
        titel: "Vrij trainen",
        tekst: "Zelf trainen op je eigen tijd, in de studio.",
        href: "/aanbod#vrij-trainen",
      },
    ],
  },
  faqKop: { eyebrow: "Vragen uit Bussum", titel: "Goed om te weten" },
  faq: [
    {
      vraag: "Hoe lang ben ik onderweg vanuit Bussum?",
      antwoord:
        "Met de auto 20 minuten vanaf het centrum en 34 minuten met de fiets. Vanuit Naarden rijd je er in 25 minuten.",
    },
    {
      vraag: "Is dat niet ver voor een training?",
      antwoord:
        "Het is ongeveer twintig minuten rijden en je parkeert voor de deur. Daarvoor krijg je een kleine studio waar Marlon je persoonlijk begeleidt, in plaats van een drukke sportschool.",
    },
    {
      vraag: "Kan ik voor of na mijn werk trainen?",
      antwoord:
        "Ja. De studio is doordeweeks vroeg open en 's avonds tot laat. In het overzicht op deze pagina zie je precies wanneer Marlon er is.",
    },
  ],
  buurplaatsen: [
    { label: "Personal trainer Hilversum", pagina: "personal-trainer-hilversum" },
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
  areaServed: ["Bussum", "Naarden", "Loosdrecht"],
};
