import type { HpPage } from "./types";
import { DATE_MODIFIED } from "./shared";

// COPY: confirm met Marlon (alle teksten in dit bestand)

export const voeding: HpPage = {
  key: "voeding",
  topic: "Voedingsrichtlijnen",
  metaDescription:
    "De basis voedingsrichtlijnen bij Personal Hormonal Profiling: de vier voedselgroepen, drinken, quick start rules en handporties.",
  h1: "Basis voedingsrichtlijnen",
  eyebrow: "Voeding",
  inHetKort:
    "Een maaltijd bestaat uit eiwit, groente en een gezond vet. Koolhydraten eet je apart en afgestemd op je profiel. Hieronder staan de basisregels en de handporties; je persoonlijke advies stel je samen met Marlon op.",
  blocks: [
    { type: "h2", id: "caveman", text: "De caveman-regel" },
    {
      type: "p",
      text: "Kies voeding die zo min mogelijk bewerkt is. Twijfel je over een product? Vraag je dan af of onze voorouders het als eten zouden herkennen: alles wat vliegt, zwemt, rent of groen is en geen barcode heeft is toegestaan.",
    },
    { type: "h2", id: "voedselgroepen", text: "De 4 voedselgroepen" },
    {
      type: "p",
      text: "Een maaltijd stel je samen uit vier groepen: eiwitten, groenten, vetten en koolhydraten. Eiwitten, groenten en vetten combineer je in één maaltijd, bijvoorbeeld vis of vlees met een portie groente en een handje noten of een lepel boter. Koolhydraten eet je apart, met alleen groente erbij. Eet je koolhydraten, dan niet twee koolhydraatmaaltijden direct achter elkaar. Start je dag met een maaltijd van eiwitten, groenten en vetten.",
    },
    {
      type: "p",
      text: "Eet regelmatig: begin na het opstaan en eet ongeveer elke 3 uur een maaltijd of snack. Zo eet je voordat je honger krijgt.",
    },
    { type: "h2", id: "drinken", text: "Drinken" },
    {
      type: "p",
      text: "Drink 3 liter water per dag, bij voorkeur mineraal of gefilterd water. Een groot glas voor, tussen en na de maaltijden werkt goed; tijdens de maaltijd drink je weinig. Groene thee is een goede aanvulling. Beperk koffie tot maximaal 2 koppen per dag, bij voorkeur zonder suiker.",
    },
    { type: "h2", id: "quick-start", text: "Quick start rules" },
    {
      type: "list",
      items: [
        "Eet 6 maaltijden of eetmomenten per dag.",
        "Eet minstens elke 3 uur een maaltijd of snack.",
        "Eet voordat je honger krijgt.",
        "Eet maximaal 2 koolhydraatmaaltijden per dag, niet direct achter elkaar.",
        "Combineer koolhydraten niet met eiwitten of vetten.",
        "Drink 3 liter water per dag.",
        "Train 2 tot 4 keer per week.",
        "Drink groene thee.",
        "Houd een logboek bij van wat je eet en drinkt en wanneer.",
        "Sla geen maaltijd over.",
        "Vermijd vruchtensappen en producten met toegevoegde suiker.",
      ],
    },
    { type: "h2", id: "porties", text: "Hoeveel kun je eten?" },
    {
      type: "p",
      text: "Met je hand heb je altijd een maatstaf bij je. Dit zijn de handporties:",
    },
    {
      type: "table",
      head: ["Voedselgroep", "Een portie"],
      rows: [
        ["Eiwitten", "1 keer de grootte van je gesloten hand"],
        ["Groenten", "2 keer de grootte van je gesloten hand"],
        ["Vetten", "een halve tot 1 eetlepel"],
        ["Koolhydraten", "1 keer de grootte van je gesloten hand"],
      ],
    },
    {
      type: "p",
      text: "Je persoonlijke voedingsadvies stel je samen met Marlon op, na de vragenlijst en de huidplooimeting.",
    },
  ],
  related: ["supplementen", "training", "hoewerkt"],
  dateModified: DATE_MODIFIED,
};
