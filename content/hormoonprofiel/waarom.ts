import type { HpPage } from "./types";
import { DATE_MODIFIED } from "./shared";

// COPY: confirm met Marlon (alle teksten in dit bestand)

export const waarom: HpPage = {
  key: "waarom",
  topic: "Waarom een persoonlijk hormoonprofiel?",
  metaDescription:
    "Waarom diëten vaak niet beklijven en waarom een persoonlijk plan voor training, voeding en leefstijl meer oplevert dan alleen trainen of minder eten.",
  h1: "Waarom is een persoonlijk hormoonprofiel belangrijk?",
  eyebrow: "Het waarom",
  inHetKort:
    "Een standaarddieet houdt geen rekening met jouw situatie, en alleen trainen is vaak niet genoeg. Een persoonlijk plan combineert training, voeding en leefstijl en begint bij wat je lichaam laat zien. Zo kun je gerichter werken aan energie, kracht en een lichaam waar je je prettig in voelt.",
  blocks: [
    { type: "h2", id: "dieten", text: "Waarom diëten vaak niet beklijven" },
    {
      type: "p",
      text: "Veel diëten werken met een sterk verlaagde calorie-inname. Je lichaam past zich daar vaak op aan: naast vet verlies je ook spiermassa, en je verbruikt in rust minder energie. Spiermassa is een belangrijke factor voor je stofwisseling. Hoe minder spiermassa, hoe lastiger het is om een resultaat vast te houden.",
    },
    { type: "h2", id: "trainen", text: "Alleen trainen is niet genoeg" },
    {
      type: "p",
      text: "Trainen is belangrijk, maar het is maar een deel van je dag. Wat je eet, hoe je slaapt en hoe je herstelt tellen minstens zo zwaar. Een plan waarin training, voeding en leefstijl op elkaar aansluiten werkt daarom beter dan elk onderdeel los.",
    },
    { type: "h2", id: "persoonlijk", text: "Een plan dat bij jou past" },
    {
      type: "p",
      text: "Iedereen reageert anders op voeding en training. Een hormoonprofiel is een startpunt om dat plan persoonlijk te maken. Na 6 weken meet je opnieuw, zodat je ziet wat werkt en wat je kunt bijstellen.",
    },
    { type: "h2", id: "herkenbaar", text: "Herkenbare signalen" },
    {
      type: "p",
      text: "Dit zijn voorbeelden van wat mensen vaak benoemen als ze starten:",
    },
    {
      type: "list",
      items: [
        "Je energie zakt een paar uur na het eten in.",
        "Je hebt vaak trek in zoet.",
        "Je vet zit vooral op een plek, ondanks training en gezond eten.",
        "Je herstelt traag na het trainen.",
        "Je slaapt onrustig.",
      ],
    },
    {
      type: "p",
      text: "Herken je jezelf? Dat zegt niets over je gezondheid. Heb je klachten, ga dan naar je huisarts.",
    },
  ],
  related: ["wat", "hoewerkt", "profielen"],
  dateModified: DATE_MODIFIED,
};
