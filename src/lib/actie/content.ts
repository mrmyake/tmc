import "server-only";

/**
 * Copy per actiepagina (spec-proefles-funnel.md). Server-only: de pagina
 * geeft deze teksten als props door. Hier staat nooit een proefcode; alleen
 * tmc.campaign_landings kent de koppeling slug naar code.
 *
 * Een slug die wel in de database staat maar hier geen eigen copy heeft,
 * krijgt de algemene tekst (GENERIC), zodat een nieuwe slug zonder deploy
 * werkt.
 */

export interface ActieBenefit {
  title: string;
  text: string;
}

export interface ActieContent {
  /** Naam van het aanbod; ook in de boekingsstap getoond in plaats van een code. */
  pill: string;
  h1: string;
  lead: string;
  benefits: [ActieBenefit, ActieBenefit, ActieBenefit];
  /** Kop boven de roosterpreview. */
  roosterTitle: string;
}

// De Google-score is een vaste tekst, geen live widget (B13).
// COPY: confirm met Marlon
export const GOOGLE_SCORE = { score: "5.0", reviews: "25+ reviews" } as const;

// COPY: confirm met Marlon
export const ACTIE_SHARED = {
  cta: "Kies je gratis les",
  ctaSub: "Geen betaling, geen abonnement. Binnen een minuut geregeld.",
  whatsappHelp: "Vragen? App Marlon",
  whatsappAria: "App Marlon via WhatsApp",
  whatsappText: "Hoi Marlon, ik heb een vraag over de gratis proefles.",
  roosterLive: "live uit het rooster",
  statusFree: "Plek vrij",
  statusFew: "Bijna vol",
  vrijTrainenTitle: "Vrij trainen",
  vrijTrainenDuration: "1 uur, Marlon is erbij",
  roosterEmpty: "Het rooster voor de komende dagen volgt. Kies je les in de volgende stap.",
  smallPrint:
    "Gratis proefles voor nieuwe leden, één keer per persoon. Geldt voor groepslessen en vrij trainen, niet voor personal training.",
  privacy: "Privacyverklaring",
  terms: "Algemene voorwaarden",
} as const;

// COPY: confirm met Marlon
const GENERIC: ActieContent = {
  pill: "Gratis proefles",
  h1: "Kom kennismaken met The Movement Club.",
  lead: "Een groepsles of een uur vrij trainen met Marlon erbij. Kleine groepen, echte coaching, tien minuten van Hilversum.",
  benefits: [
    { title: "Kleine groepen", text: "Maximaal 8 bij yoga, maximaal 12 bij kettlebell." },
    { title: "Coaching van Marlon", text: "Kettlebell Master en eigenaar van de studio." },
    { title: "Parkeren voor de deur", text: "Industrieweg 14P, Loosdrecht." },
  ],
  roosterTitle: "Deze week",
};

// COPY: confirm met Marlon
const BY_SLUG: Record<string, ActieContent> = {
  "google-kettlebell": {
    pill: "Gratis proefles kettlebell",
    h1: "Sterker worden begint met techniek.",
    lead: "Train in een groep van maximaal 12, onder begeleiding van Kettlebell Master Marlon. Je eerste les is gratis.",
    benefits: [
      {
        title: "Les van een Kettlebell Master",
        text: "Marlon let op je techniek vanaf je eerste swing.",
      },
      { title: "Maximaal 12 per groep", text: "Genoeg ruimte en aandacht voor iedereen." },
      {
        title: "Voor beginners en gevorderden",
        text: "Je start op jouw niveau, het gewicht volgt later.",
      },
    ],
    roosterTitle: "Kettlebell deze week",
  },
  "google-yoga": {
    pill: "Gratis proefles yoga",
    h1: "Rust, ruimte en aandacht.",
    lead: "Yoga en mobility in groepen van maximaal 8. Van Nidra en Yin tot Flow, voor elk niveau. Je eerste les is gratis.",
    benefits: [
      { title: "Maximaal 8 per les", text: "Persoonlijke aandacht, ook als je net begint." },
      { title: "Yin, Flow, Nidra en Restorative", text: "Kies de vorm die bij je past." },
      { title: "Matten liggen voor je klaar", text: "Neem alleen je eigen handdoek mee." },
    ],
    roosterTitle: "Yoga deze week",
  },
  "google-merk": GENERIC,
  "meta-ig": GENERIC,
  "flyer-weekblad": GENERIC,
};

export function actieContent(slug: string): ActieContent {
  return Object.hasOwn(BY_SLUG, slug) ? BY_SLUG[slug] : GENERIC;
}
