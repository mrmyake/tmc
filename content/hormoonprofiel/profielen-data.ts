// COPY: confirm met Marlon (alle teksten in dit bestand, ook de meetpunten)
// Letterlijk overgenomen uit mockups/hormoonprofiel-mockup.html (v1.1).

export interface HpProfile {
  /** Ankers blijven 1:1 gelijk aan de oude site, ook #thyroid-profiel. */
  id: string;
  name: string;
  short: string;
  does: string;
  signs: string;
  self: string;
  /** Vervolg op "In PHP hoort dit profiel bij ". */
  site: string;
}

export const PROFILES: readonly HpProfile[] = [
  {
    id: "insuline-profiel",
    site: "de huidplooien onder je schouderblad en boven je heupkam",
    name: "Insuline",
    short: "Bloedsuiker en energieopslag",
    does: "Insuline helpt suiker uit je bloed naar je cellen. Het bepaalt mee of energie uit je maaltijd wordt verbruikt of opgeslagen.",
    signs: "Een dip na het eten, snel weer trek, vooral zin in zoet of brood.",
    self: "Eiwit en groente bij elke maaltijd, koolhydraten vooral rond je training, en krachttraining.",
  },
  {
    id: "cortisol-profiel",
    site: "de huidplooi naast je navel",
    name: "Cortisol",
    short: "Stress en herstel",
    does: "Cortisol maakt je wakker en alert en helpt je in actie komen. Bij langdurige stress blijft het te lang hoog.",
    signs: "Moe maar onrustig, slecht doorslapen, vet vooral rond je buik.",
    self: "Vaste slaaptijden, herstel inplannen en niet elke training op maximaal.",
  },
  {
    id: "oestrogeen-profiel",
    site: "de huidplooien aan de voor- en achterkant van je bovenbeen",
    name: "Oestrogeen",
    short: "Cyclus, botten en vetverdeling",
    does: "Belangrijk voor de cyclus en voor sterke botten, bij vrouwen en in kleinere mate bij mannen. Het beïnvloedt waar je vet opslaat.",
    signs: "Vocht vasthouden, schommelingen rond je cyclus, vet op heupen en bovenbenen.",
    self: "Veel groente en vezels, minder alcohol, en regelmatig krachttraining.",
  },
  {
    id: "groeihormoon-profiel",
    site: "de huidplooien bij je knie en je kuit",
    name: "Groeihormoon",
    short: "Slaap, herstel en spieropbouw",
    does: "Wordt vooral 's nachts aangemaakt en speelt een rol bij herstel en de opbouw van spieren.",
    signs: "Traag herstel na trainen, slecht slapen, moeite met spier opbouwen.",
    self: "Genoeg slaap, korte intensieve trainingen en 's avonds niet laat zwaar eten.",
  },
  {
    id: "thyroid-profiel",
    site: "de huidplooi aan de zijkant van je borstkas, onder je oksel",
    name: "Schildklier",
    short: "Het tempo van je stofwisseling",
    does: "De schildklier regelt het tempo van je stofwisseling, je lichaamstemperatuur en je energie.",
    signs: "Snel koud, weinig energie, het gevoel dat je stofwisseling traag is.",
    self: "Twijfel je over je schildklier? Laat het checken bij je huisarts: dat kan alleen met bloedonderzoek.",
  },
  {
    id: "testosteron-profiel",
    site: "de huidplooien op je borst en aan de achterkant van je bovenarm",
    name: "Testosteron",
    short: "Kracht, energie en zin in trainen",
    does: "Bij mannen en vrouwen belangrijk voor spierkracht, energie en zin in bewegen.",
    signs: "Minder kracht, weinig energie, moeilijk spieren vasthouden.",
    self: "Zwaar genoeg trainen, goed slapen en genoeg eten.",
  },
];

export function meetpuntText(profile: HpProfile): string {
  return `In PHP hoort dit profiel bij ${profile.site}.`;
}
