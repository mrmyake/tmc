import type { HpPage, HpFaqItem } from "./types";
import { DATE_MODIFIED } from "./shared";

// COPY: confirm met Marlon (alle teksten in dit bestand)

export const HOME_TRAJECT = [
  { n: 1, titel: "Kennismaking", tekst: "Een vrijblijvend gesprek over je doel en of PHP bij je past.", duur: null },
  { n: 2, titel: "Intake en vragenlijst", tekst: "Je leefstijl, werk, slaap en herstel. Een vragenlijst vul je vooraf in.", duur: "Afspraak 1, 1 uur" },
  { n: 3, titel: "Huidplooimeting", tekst: "Marlon meet op 12 punten. De verhoudingen bepalen je profiel.", duur: "Afspraak 1" },
  { n: 4, titel: "Jouw plan", tekst: "Training, voeding en supplementadvies, afgestemd op je profiel.", duur: "Afspraak 2, 1 uur" },
  { n: 5, titel: "Hermeting", tekst: "Na 6 weken meet je opnieuw en stel je het plan bij.", duur: "Na 6 weken" },
] as const;

export const HOME_WEL = [
  "Een startpunt om training, voeding en leefstijl op jou af te stemmen",
  "Persoonlijke begeleiding door een vaste trainer",
  "Meetbaar: na 6 weken zie je wat er veranderd is",
] as const;

export const HOME_NIET = [
  "Een medische test of diagnose",
  "Bloed- of speekselonderzoek",
  "Een vervanging van je huisarts",
] as const;

export const HOME_META = ["Gecertificeerd practitioner", "Studio aan de Industrieweg", "Op afspraak"] as const;

export const HOME_FAQ: readonly HpFaqItem[] = [
  {
    vraag: "Is dit een medische test?",
    antwoord:
      "Nee. De huidplooimeting en de vragenlijst geven een startpunt voor je training en voeding. Wil je weten hoe je hormoonwaarden echt zijn, dan kan dat alleen met bloedonderzoek via je huisarts.",
  },
  {
    vraag: "Hoe lang duren de afspraken?",
    antwoord:
      "Er zijn twee afspraken van een uur: eerst de intake en de meting, daarna de uitleg van je plan. Na 6 weken volgt de hermeting.",
  },
  {
    vraag: "Kan iedereen gemeten worden?",
    antwoord:
      "Bij flink overgewicht is een huidplooimeting minder betrouwbaar. Marlon bespreekt dan met je hoe je het beste kunt beginnen.",
  },
  {
    vraag: "Wat kost het?",
    antwoord: "Dat bespreek je in de kennismaking, zodat het traject past bij wat je nodig hebt.",
  },
];

export const home: HpPage = {
  key: "home",
  topic: "Persoonlijk hormoonprofiel in Loosdrecht",
  topicSection: "Persoonlijk hormoonprofiel bij Marlon",
  metaDescription:
    "Personal Hormonal Profiling bij Marlon van der Leij in Loosdrecht: intake, 12-punts huidplooimeting en een plan voor training, voeding en supplementen. Plan een kennismaking.",
  h1: "Persoonlijk hormoonprofiel bij Marlon van der Leij",
  eyebrow: "Personal Hormonal Profiling in Loosdrecht",
  inHetKort:
    "Personal Hormonal Profiling (PHP) is een methode waarbij een intakegesprek, een uitgebreide vragenlijst en een huidplooimeting op 12 punten samen het startpunt vormen voor je training, voeding en supplementadvies. Je doet het bij Marlon van der Leij in The Movement Club in Loosdrecht. Het is geen medische test.",
  blocks: [],
  faq: HOME_FAQ,
  related: [],
  dateModified: DATE_MODIFIED,
};

export const HOME_LEAD =
  "Waar je lichaam vet opslaat, vertelt iets over hoe je het beste kunt trainen, eten en herstellen. Marlon meet, luistert en maakt een plan dat bij jou past.";
export const HOME_PROFIELEN_INTRO =
  "Je profiel laat zien op welk gebied je plan de meeste winst geeft. Lees per profiel wat het hormoon doet en wat je er zelf aan kunt doen.";
export const HOME_MARLON_INTRO =
  "Eigenaar en hoofdtrainer van The Movement Club in Loosdrecht. Ze begeleidt je van de eerste meting tot je hermeting, en past je training aan op wat je profiel laat zien.";
