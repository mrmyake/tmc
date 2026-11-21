import type { HpBlock, HpPage } from "./types";
import { DATE_MODIFIED, OPEN_FIELDS } from "./shared";

// COPY: confirm met Marlon (alle teksten in dit bestand)

const vragenlijst: HpBlock[] = OPEN_FIELDS.vragenlijstZichtbaarVoor
  ? [{ type: "p", text: OPEN_FIELDS.vragenlijstZichtbaarVoor }]
  : [];

export const hoewerkt: HpPage = {
  key: "hoewerkt",
  topic: "Hoe werkt Personal Hormonal Profiling?",
  metaDescription:
    "Van kennismaking tot hermeting: twee afspraken van een uur, een 12-punts huidplooimeting en een persoonlijk plan. Zo werkt een hormoonprofiel bij Marlon.",
  h1: "Hoe werkt Personal Hormonal Profiling?",
  eyebrow: "Het traject",
  inHetKort:
    "Je begint met een vrijblijvende kennismaking. Daarna volgen twee afspraken van een uur: eerst een intake met vragenlijst en een huidplooimeting op 12 punten, dan de uitleg van je persoonlijke plan voor training, voeding en supplementen. Na 6 weken meet je opnieuw.",
  blocks: [
    { type: "h2", id: "s1", text: "1. De kennismaking" },
    {
      type: "p",
      text: "Je vertelt waar je naartoe wilt en Marlon legt uit hoe het traject werkt. Zo weet je of PHP bij je past voordat je begint.",
    },
    { type: "h2", id: "s2", text: "2. Intake en vragenlijst", duration: "Afspraak 1" },
    {
      type: "p",
      text: "Vooraf vul je een uitgebreide vragenlijst in over je energie, slaap, eetpatroon en herstel. In de intake bespreek je de antwoorden, je werk en je leefsituatie. Een paar voorbeeldvragen:",
    },
    {
      type: "questions",
      items: [
        "Ben je 1 tot 3 uur na een maaltijd moe?",
        "Heb je een droge huid, broze nagels of dun haar?",
        "Zweet je snel?",
        "Heb je vaak stijve of pijnlijke spieren en gewrichten?",
      ],
    },
    ...vragenlijst,
    { type: "h2", id: "s3", text: "3. De huidplooimeting", duration: "Afspraak 1" },
    {
      type: "p",
      text: "Marlon meet met een huidplooimeter op 12 vaste punten van je lichaam. Niet de totale hoeveelheid vet telt, maar de verhoudingen tussen de punten. Die bepalen je profiel. Tien punten horen bij een van de zes profielen; kin en wang horen bij geen enkel profiel en laten vooral zien hoe je totale vetpercentage verandert. Bij flink overgewicht is de meting minder betrouwbaar; dan bespreek je samen hoe je begint.",
    },
    { type: "h2", id: "s4", text: "4. Je plan", duration: "Afspraak 2" },
    { type: "p", text: "In de tweede afspraak krijg je uitleg over je profiel en je plan. Wat je meekrijgt:" },
    {
      type: "get",
      items: [
        { label: "Persoonlijk trainingsschema", detail: "afgestemd op je profiel" },
        { label: "Voedingsrichtlijnen", detail: "met porties per maaltijd" },
        { label: "Supplementadvies", detail: "alleen wat jij nodig hebt" },
        { label: "Hermeting", detail: "na 6 weken" },
      ],
    },
    { type: "h2", id: "s5", text: "5. Hermeting na 6 weken" },
    {
      type: "p",
      text: "Je lichaam heeft tijd nodig om te reageren, daarom meet je pas na 6 weken opnieuw. Je ziet wat er veranderd is en Marlon stelt je plan bij.",
    },
  ],
  related: ["profielen", "voeding", "supplementen"],
  dateModified: DATE_MODIFIED,
};
