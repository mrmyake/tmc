import type { HpFaqItem, HpPage } from "./types";
import { DATE_MODIFIED } from "./shared";

// COPY: confirm met Marlon (alle teksten in dit bestand)

export const FAQ_ITEMS: readonly HpFaqItem[] = [
  { vraag: "Waar staat PHP voor?", antwoord: "PHP staat voor Personal Hormonal Profiling." },
  {
    vraag: "Is dit een medische test?",
    antwoord:
      "Nee. De huidplooimeting en de vragenlijst geven een startpunt voor je training en voeding. Wil je weten hoe je hormoonwaarden echt zijn, dan kan dat alleen met bloedonderzoek via je huisarts.",
  },
  {
    vraag: "Kan iedereen gemeten worden?",
    antwoord:
      "Bij flink overgewicht is een huidplooimeting minder betrouwbaar. Marlon bespreekt dan met je hoe je het beste kunt beginnen. Is meten om een andere reden niet mogelijk, dan geeft ze je een advies dat past bij jouw doel.",
  },
  {
    vraag: "Wat zijn de verschillende hormoonprofielen?",
    antwoord: "Er zijn 6 profielen: insuline, cortisol, oestrogeen, groeihormoon, schildklier en testosteron.",
    link: { label: "Lees meer over de profielen", key: "profielen" },
  },
  {
    vraag: "Waar vindt het plaats?",
    antwoord: "In de studio van The Movement Club aan de Industrieweg 14P in Loosdrecht, op afspraak.",
    link: { label: "Contactgegevens", key: "contact" },
  },
  {
    vraag: "Hoe lang duren de afspraken?",
    antwoord:
      "Er zijn twee afspraken van een uur: eerst de intake en de meting, daarna de uitleg van je plan. Na 6 weken volgt de hermeting.",
  },
  {
    vraag: "Wat is een anamnese?",
    antwoord:
      "Een anamnese is een intakegesprek. Marlon bespreekt je vragenlijst met je en stelt vragen over je werk, je leefsituatie en andere zaken die voor je plan van belang zijn.",
  },
  {
    vraag: "Wanneer doe ik een volgende meting?",
    antwoord:
      "Na 6 weken. Eerder heeft geen toegevoegde waarde, omdat je lichaam die tijd nodig heeft om te reageren.",
  },
  {
    vraag: "Ik heb 6 weken het programma gevolgd, hoe ga ik verder?",
    antwoord:
      "Na 6 weken meet je opnieuw. Je ziet wat er is veranderd en Marlon stelt je plan bij, zodat je stap voor stap verder werkt.",
  },
  {
    vraag: "Ik herken me niet in mijn profiel, hoe kan dat?",
    antwoord:
      "Dat kan. Het profiel is een startpunt en laat zien waar je plan de meeste winst kan geven, niet wat je zelf in de spiegel ziet. De genoemde signalen zijn voorbeelden en hoeven niet precies voor jou te gelden. Bespreek het met Marlon, dan kijkt ze samen met je naar je antwoorden en je meting.",
  },
  {
    vraag: "Is PHP wetenschappelijk onderbouwd?",
    antwoord:
      "De adviezen over training, voeding en slaap sluiten aan bij onderzoek. Dat je met een huidplooimeting hormoonwaarden kunt bepalen is niet wetenschappelijk aangetoond. Daarom is de meting een startpunt en geen diagnose.",
  },
  {
    vraag: "Kan ik mijn huidige training combineren met mijn profiel?",
    antwoord:
      "Vaak wel, maar het hangt af van je profiel en je doel. Bespreek je huidige training met Marlon, dan kijkt ze wat je kunt houden en wat je beter kunt aanpassen.",
  },
  {
    vraag: "Mag ik andere supplementen gebruiken?",
    antwoord:
      "Bespreek het eerst met Marlon. Niet elk supplement past bij elk plan, en sommige kunnen met medicijnen of met je situatie botsen. Heb je medicijnen, overleg dan ook met je huisarts.",
  },
  {
    vraag: "Kan ik ook spiermassa opbouwen?",
    antwoord:
      "Ja, als dat je doel is. Training, voeding en herstel worden daar dan op afgestemd. Marlon bespreekt in de kennismaking wat realistisch is.",
  },
  {
    vraag: "Mijn gewicht blijft gelijk maar ik ben slanker, kan dat?",
    antwoord:
      "Ja. Spiermassa is compacter dan vet, dus je kunt in omvang afnemen terwijl je gewicht gelijk blijft. Daarom meet je naast je gewicht ook je omvang en je huidplooien.",
  },
  {
    vraag: "Wat kost het?",
    antwoord: "Dat bespreek je in de kennismaking, zodat het traject past bij wat je nodig hebt.",
  },
  {
    vraag: "Ik heb een vraag over voeding, training of supplementen.",
    antwoord:
      "Kijk eerst bij de voedingsrichtlijnen, de hormoontraining en de supplementen. Staat je vraag er niet bij, neem dan contact op per e-mail of telefoon.",
    link: { label: "Contactgegevens", key: "contact" },
  },
];

export const faq: HpPage = {
  key: "faq",
  topic: "Veelgestelde vragen",
  metaDescription:
    "Antwoorden op de vragen die we het vaakst krijgen over Personal Hormonal Profiling: de afspraken, de meting, je profiel en je plan.",
  h1: "Veelgestelde vragen",
  eyebrow: "Vragen",
  inHetKort:
    "Hier vind je antwoord op de vragen die we het vaakst krijgen over Personal Hormonal Profiling: de afspraken, de meting, je profiel en je plan. Staat je vraag er niet bij, neem dan gerust contact op.",
  blocks: [],
  faq: FAQ_ITEMS,
  related: ["hoewerkt", "profielen", "contact"],
  dateModified: DATE_MODIFIED,
};
