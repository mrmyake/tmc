import type { HpPage } from "./types";
import { DATE_MODIFIED } from "./shared";

// COPY: confirm met Marlon (alle teksten in dit bestand)

export const wat: HpPage = {
  key: "wat",
  topic: "Wat is Personal Hormonal Profiling?",
  metaDescription:
    "Personal Hormonal Profiling (PHP) is een methode om training, voeding en leefstijl af te stemmen op jouw situatie. Lees wat het is en wat niet.",
  h1: "Wat is Personal Hormonal Profiling?",
  eyebrow: "De methode",
  inHetKort:
    "Personal Hormonal Profiling (PHP) is een methode om training, voeding en leefstijl af te stemmen op jouw persoonlijke situatie. Een intakegesprek, een vragenlijst en een huidplooimeting op 12 punten vormen het startpunt. Het is geen medische test en geen diagnose.",
  blocks: [
    { type: "h2", id: "definitie", text: "Wat is PHP?" },
    {
      type: "p",
      text: "PHP staat voor Personal Hormonal Profiling. Je begint met een intakegesprek en een uitgebreide vragenlijst. Daarna meet Marlon op 12 punten je huidplooien. Samen vormen die het startpunt voor je persoonlijke plan voor training, voeding en leefstijl.",
    },
    { type: "h2", id: "hormonen", text: "Hormonen in je dagelijks leven" },
    {
      type: "p",
      text: "Hormonen sturen veel processen in je lichaam aan, onder andere je stofwisseling, je eetlust en de manier waarop je energie opslaat. Ze hebben ook invloed op hoe je je voelt. Voeding, beweging, slaap en stress spelen daarbij elke dag een rol.",
    },
    { type: "h2", id: "stofwisseling", text: "Stofwisseling, eetlust en vetopslag" },
    {
      type: "p",
      text: "Je stofwisseling bepaalt hoe je lichaam met energie omgaat. Twee mensen die hetzelfde eten, kunnen daardoor een verschillend resultaat zien. Waar je vet opslaat, verschilt ook per persoon. PHP gebruikt die verschillen als aanknopingspunt om je training en voeding gerichter te kiezen.",
    },
    { type: "h2", id: "cyclus", text: "Cyclus, pil en testosteron" },
    {
      type: "p",
      text: "Veel vrouwen merken dat hun energie en eetlust meebewegen met hun cyclus. Sommigen merken ook verschil als ze starten of stoppen met de pil. Bij mannen speelt testosteron een rol bij spierbehoud en energie; vrouwen maken ook testosteron aan, in kleinere hoeveelheden. Dit zijn algemene voorbeelden. Heb je vragen over je cyclus of je medicatie, bespreek die dan met je huisarts.",
    },
    { type: "h2", id: "wel-niet", text: "Wat het wel en niet is" },
    {
      type: "wn",
      yes: [
        "Een startpunt om training, voeding en leefstijl op jou af te stemmen",
        "Persoonlijke begeleiding door een vaste trainer",
        "Meetbaar: na 6 weken zie je wat er veranderd is",
      ],
      no: [
        "Een bloedtest",
        "Een medische test of diagnose",
        "Een vervanging van je huisarts",
      ],
    },
  ],
  related: ["waarom", "hoewerkt", "profielen"],
  dateModified: DATE_MODIFIED,
};
