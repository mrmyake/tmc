/**
 * Configuratie van de quiz "Welke yoga past bij jou?" (spec-yoga-test.md).
 * Alle inhoud staat hier: vragen, punten, uitkomsten, teksten en de
 * proefcode. De componenten en de rekenlaag lezen dit bestand en bevatten
 * zelf geen quizinhoud.
 *
 * Pure module, zonder server- of browserimports, zodat node:test hem direct
 * laadt (scripts/yoga-test/*.test.mts).
 *
 * Alle Nederlandse tekst hieronder: COPY: confirm met Marlon.
 */

export type OutcomeKey = "v" | "p" | "ym" | "y" | "r" | "n";

export type TimeBucket = "weekdag-dag" | "weekdag-avond" | "weekend";

export const TIME_BUCKETS: readonly TimeBucket[] = ["weekdag-dag", "weekdag-avond", "weekend"];

export function isTimeBucket(value: unknown): value is TimeBucket {
  return typeof value === "string" && (TIME_BUCKETS as readonly string[]).includes(value);
}

export interface QuizOption {
  text: string;
  /** Punten per uitkomst; leeg = geen punten. */
  points: Partial<Record<OutcomeKey, number>>;
  /** Alleen vraag 7: de gekozen tijdsbucket, null = maakt niet uit. */
  bucket?: TimeBucket | null;
  /** Alleen vraag 8: bij true toont de uitslag de rekening-houden-melding. */
  careNote?: boolean;
}

export interface QuizQuestion {
  id: string;
  text: string;
  hint?: string;
  options: readonly QuizOption[];
}

export interface QuizOutcome {
  key: OutcomeKey;
  /** tmc.class_types.id; de koppeling loopt op id, nooit op slug. */
  classTypeId: string;
  name: string;
  eyebrow: string;
  why: string;
  what: string;
}

export const YOGA_QUIZ_ID = "yoga";

/** Eyebrow van de uitslagkaart als een uitkomst geen eigen eyebrow heeft. */
export const DEFAULT_RESULT_EYEBROW = "Jouw les";

/**
 * Volgorde bij gelijke score: v, y, p, ym, r, n. Ook de volgorde waarin
 * uitkomsten afvallen of doorschuiven.
 */
export const TIE_BREAK_ORDER: readonly OutcomeKey[] = ["v", "y", "p", "ym", "r", "n"];

export const yogaQuiz = {
  id: YOGA_QUIZ_ID,
  /** De proefcode; staat in hoofdletters zoals in tmc.trial_codes. */
  trialCode: "JOUWYOGA",
  /** Scopes waarvoor de startroute de code als bruikbaar voor deze quiz ziet. */
  usableScopes: ["yoga_mobility", "group", "all"] as const,
  start: {
    eyebrow: "Yoga bij The Movement Club",
    title: "Welke yoga past bij jou?",
    lead:
      "Vinyasa, Yin, Pilates, Nidra: het zijn allemaal heel verschillende lessen. Beantwoord 8 korte vragen en je ziet welke les op ons rooster het beste bij je past, en wanneer je hem kunt volgen.",
    facts: ["8 vragen", "1 min van je tijd", "max 8 per les"],
    button: "Start de test",
    note: "Je ziet je uitslag direct, zonder e-mailadres.",
  },
  careNoteText:
    "Je gaf aan dat er iets is om rekening mee te houden. Fijn dat je het zegt. Laat het ons even weten bij je boeking of bel ons, dan stemt de trainer de les op je af.",
} as const;

/**
 * Server-side allowlist voor /proefles/code/start: quiz-id naar proefcode.
 * De querystring bevat nooit de code zelf; een onbekend quiz-id of een
 * meegegeven code wordt genegeerd.
 */
export const QUIZ_TRIAL_CODES: Readonly<Record<string, string>> = {
  [yogaQuiz.id]: yogaQuiz.trialCode,
};

export const outcomes: Readonly<Record<OutcomeKey, QuizOutcome>> = {
  v: {
    key: "v",
    classTypeId: "bf950cf7-be76-431b-bbb4-b9ac80304ebf",
    name: "Vinyasa Flow",
    eyebrow: DEFAULT_RESULT_EYEBROW,
    why: "Jij wilt bewegen, energie kwijt en na afloop voelen dat je iets gedaan hebt.",
    what:
      "Een dynamische les waarin je houdingen vloeiend op je ademhaling verbindt. Je bouwt kracht, souplesse en focus op, en je blijft in beweging.",
  },
  p: {
    key: "p",
    classTypeId: "8aef0315-e700-4383-a4aa-6929ba1ef563",
    name: "Pilates",
    eyebrow: "Geen yoga, wel precies wat je zoekt",
    why:
      "Jij zoekt kracht van binnenuit: een sterke core, een betere houding en controle over elke beweging.",
    what:
      "Gecontroleerde oefeningen die je core versterken, je houding verbeteren en je lichaam in balans brengen. Rustig tempo, maar je voelt het de dag erna.",
  },
  ym: {
    key: "ym",
    classTypeId: "2128502e-e328-4e93-8204-c053f25ff240",
    name: "Yin Movement",
    eyebrow: DEFAULT_RESULT_EYEBROW,
    why: "Jij wilt allebei: loslaten en sterker worden. Niet alleen rekken, niet alleen werken.",
    what:
      "Een combinatieles waarin diepe, aangehouden yin-houdingen samenkomen met pilatesoefeningen voor kracht en controle.",
  },
  y: {
    key: "y",
    classTypeId: "dd1a833e-e5ed-47e7-b271-902e472efd18",
    name: "Yin",
    eyebrow: DEFAULT_RESULT_EYEBROW,
    why: "Jij voelt je stijf of gespannen en wilt soepeler worden, zonder haast.",
    what:
      "Een langzame les met lang aangehouden houdingen die dieper gelegen bindweefsel en gewrichten soepel maken. Je leert loslaten, letterlijk.",
  },
  r: {
    key: "r",
    classTypeId: "7ab7b079-d2af-44f9-bcdf-8e977c31d066",
    name: "Restorative",
    eyebrow: DEFAULT_RESULT_EYEBROW,
    why: "Jij hebt vooral herstel nodig. Je lichaam en je hoofd mogen even helemaal niets.",
    what:
      "Een rustige les waarin je met bolsters en dekens lang ondersteund in houdingen ligt, zodat je zenuwstelsel kan herstellen.",
  },
  n: {
    key: "n",
    classTypeId: "61c41104-7a73-421b-8075-2d2aab5c2078",
    name: "Nidra",
    eyebrow: DEFAULT_RESULT_EYEBROW,
    why: "Jouw lichaam is het probleem niet, je hoofd staat gewoon nooit uit.",
    what:
      "Een begeleide, diep ontspannende meditatie in lighouding. Je hoeft niets te kunnen, alleen te liggen en te luisteren.",
  },
};

export const OUTCOME_KEYS: readonly OutcomeKey[] = ["v", "p", "ym", "y", "r", "n"];

export function outcomeByClassTypeId(id: string): QuizOutcome | null {
  return OUTCOME_KEYS.map((k) => outcomes[k]).find((o) => o.classTypeId === id) ?? null;
}

/** Index van de tijdvraag en de zorgvraag in `questions`. */
export const TIME_QUESTION_INDEX = 6;
export const CARE_QUESTION_INDEX = 7;

export const questions: readonly QuizQuestion[] = [
  {
    id: "doel",
    text: "Wat wil je vooral uit yoga halen?",
    options: [
      { text: "Energie en een goede workout", points: { v: 3, p: 1 } },
      { text: "Een sterkere core en een betere houding", points: { p: 3, ym: 2 } },
      { text: "Soepeler worden", points: { y: 3, ym: 2 } },
      { text: "Tot rust komen en stress kwijtraken", points: { n: 3, r: 2 } },
    ],
  },
  {
    id: "avond",
    text: "Hoe voel je je meestal aan het eind van de dag?",
    options: [
      { text: "Onrustig, ik moet nog bewegen", points: { v: 2 } },
      { text: "Stijf, vooral in rug, heupen of schouders", points: { y: 2, ym: 1 } },
      { text: "Op, ik wil alleen nog liggen", points: { r: 2, n: 1 } },
      { text: "Mijn lichaam is prima, mijn hoofd zit vol", points: { n: 3 } },
    ],
  },
  {
    id: "tempo",
    text: "Welk tempo past bij jou?",
    options: [
      { text: "Vlot, steeds in beweging", points: { v: 3 } },
      { text: "Rustig en precies, elke beweging gecontroleerd", points: { p: 3 } },
      { text: "Afwisselend, rustig en dan weer uitdagend", points: { ym: 3 } },
      { text: "Langzaam, minutenlang in een houding", points: { y: 3, r: 2 } },
    ],
  },
  {
    id: "ontspannen",
    text: "Hoe makkelijk kun jij ontspannen?",
    options: [
      { text: "Makkelijk, daar heb ik geen hulp bij nodig", points: { v: 1, p: 1 } },
      { text: "Pas als ik eerst flink heb bewogen", points: { v: 2, ym: 1 } },
      { text: "Lastig, mijn hoofd blijft maar doorgaan", points: { n: 3, r: 1 } },
      { text: "Wisselend, het hangt af van hoe druk ik het heb", points: { y: 1, r: 1, n: 1 } },
    ],
  },
  {
    id: "aanspreken",
    text: "Wat spreekt je het meest aan?",
    options: [
      { text: "Zweten en voelen dat je gewerkt hebt", points: { v: 2, p: 1 } },
      { text: "Spieren voelen waarvan je niet wist dat je ze had", points: { p: 2, ym: 2 } },
      {
        text: "Lang in een houding blijven en voelen dat er iets loslaat",
        points: { y: 3, r: 1 },
      },
      { text: "Helemaal ondersteund liggen op bolsters en dekens", points: { r: 3, n: 1 } },
    ],
  },
  {
    id: "ervaring",
    text: "Hoeveel ervaring heb je met yoga of pilates?",
    hint: "Elke les is ook geschikt als je net begint.",
    options: [
      { text: "Geen, ik begin net", points: { r: 1, y: 1, n: 1 } },
      { text: "Een beetje, ik heb het wel eens gedaan", points: {} },
      { text: "Ik doe het regelmatig", points: { v: 2, ym: 1 } },
    ],
  },
  {
    id: "wanneer",
    text: "Wanneer train je het liefst?",
    options: [
      { text: "Door de week, overdag", points: {}, bucket: "weekdag-dag" },
      { text: "Door de week, 's avonds", points: {}, bucket: "weekdag-avond" },
      { text: "In het weekend", points: {}, bucket: "weekend" },
      { text: "Maakt me niet uit", points: {}, bucket: null },
    ],
  },
  {
    id: "rekening",
    text: "Is er iets waar we rekening mee moeten houden?",
    hint: "Bijvoorbeeld een blessure, zwangerschap of fysieke klachten.",
    options: [
      { text: "Nee", points: {}, careNote: false },
      { text: "Ja", points: {}, careNote: true },
    ],
  },
];

export const QUESTION_COUNT = questions.length;

/** Punten die een uitkomst krijgt als het live rooster een tijd in de gekozen bucket heeft. */
export const BUCKET_BONUS = 1;

export const resultCopy = {
  onSchedule: "Op het rooster",
  codeLead: "Je eerste les is gratis met code",
  bookFree: "Boek je gratis proefles",
  bookPaid: "Boek je proefles",
  callFirst: "Liever eerst even gebeld worden",
  alsoTitle: "Ook iets voor jou",
  alsoButton: "Bekijk",
  restart: "Test opnieuw doen",
  noScheduleTitle: "Het rooster wordt nog ingericht",
  noScheduleBody:
    "We hebben op dit moment geen lessen om je uitslag op te baseren. Kijk op de proefles-pagina hoe je kennis kunt maken.",
  noScheduleButton: "Naar de proefles-pagina",
  mailTitle: "Je uitslag in je mail?",
  mailLead:
    "Dan sturen we je uitslag, de lestijden en wat je voor je eerste les moet weten. Matjes liggen klaar, neem zelf een handdoek mee.",
  mailNameLabel: "Voornaam (optioneel)",
  mailEmailLabel: "E-mailadres",
  mailOptIn: "Stuur me ook af en toe tips en nieuws van The Movement Club. Afmelden kan altijd.",
  mailButton: "Stuur mijn uitslag",
  mailSending: "Even geduld",
  mailError: "Dat lukte niet. Controleer je e-mailadres en probeer het opnieuw.",
  mailRateLimited: "Je hebt het te vaak geprobeerd. Probeer het over een kwartier opnieuw.",
  previous: "Vorige vraag",
} as const;

export function mailThanks(name: string, lessonName: string): string {
  const who = name.trim();
  return `Dank je${who ? `, ${who}` : ""}. Je uitslag voor ${lessonName} staat in je mail.`;
}
