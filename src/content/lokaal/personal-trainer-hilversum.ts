import type { LocatiePagina } from "./types";
import { CTA_KENNISMAKING } from "./gedeeld";

// COPY: confirm met Marlon (hele pagina)
// Reistijden: Google Maps, dinsdag 17-11-2026 rond 11:15, vertrek nu, bestemming
// Industrieweg 14P. Zie spec-locatiepaginas.md, sectie Reistijden.
export const personalTrainerHilversum: LocatiePagina = {
  status: "live",
  slug: "personal-trainer-hilversum",
  bijgewerkt: "2026-11-17",
  plaats: "Hilversum",
  gedektePlaatsen: ["Hilversum"],
  seo: {
    title: "Personal trainer bij Hilversum",
    description:
      "Personal training op 12 minuten van Hilversum. Kleine studio in Loosdrecht, parkeren voor de deur, voorheen PT Loosdrecht. Plan een kennismaking.",
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
  reistijdAutoMin: 12,
  reistijdAutoVanaf: "het centrum van Hilversum",
  reistijdFietsMin: 19,
  reistijdFietsVanaf: "het centrum van Hilversum",
  extraVertrekpunten: [
    { van: "station Hilversum", autoMin: 16 },
  ],
  ov: "Bus 104 vanaf Hilversum Centraal, in 29 minuten",
  parkeren: "Parkeren voor de deur",
  quoteEyebrow: "Ervaringen",
  quoteKop: "Wie er uit Hilversum traint",
  quote: {
    tekst: "Mijn een-op-een traject bij Marlon was life-changing. Ik heb me nog nooit zo lekker in mijn vel gevoeld.",
    voornaam: "Sara",
    woonplaats: "Hilversum",
    bron: "Google-review",
    toestemmingsdatum: "2026-11-17",
  },
  tijden: {
    eyebrow: "Wanneer het past",
    titel: "Voor je werk of na je werk",
    tekst:
      "Train je vroeg en ga je daarna door naar Hilversum of de trein? Of juist na je werk? Personal training plan je samen met Marlon.",
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
  faqKop: { eyebrow: "Vragen uit Hilversum", titel: "Goed om te weten" },
  faq: [
    {
      vraag: "Hoe lang ben ik onderweg vanuit Hilversum?",
      antwoord:
        "Met de auto 12 minuten vanaf het centrum en 19 minuten met de fiets. Vanaf station Hilversum ben je er in 16 minuten met de auto, of met bus 104 in 29 minuten.",
    },
    {
      vraag: "Waarom niet een trainer in Hilversum zelf?",
      antwoord:
        "Bij The Movement Club train je in een kleine, rustige studio, met maximaal 8 mensen per yogales en 12 bij kettlebell. Marlon begeleidt je zelf, van intake tot schema. Voor veel klanten is dat de korte rit waard, en je parkeert voor de deur.",
    },
    {
      vraag: "Kan ik eerst kennismaken?",
      antwoord:
        "Ja. Je begint met een gratis en vrijblijvende intake in de studio. Vul het terugbelformulier in, dan neemt Marlon contact met je op.",
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
