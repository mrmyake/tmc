import siteSettings from "./siteSettings";
import openingHours from "./openingHours";
import trainer from "./trainer";
import offering from "./offering";
import faq from "./faq";
import siteImages from "./siteImages";
import yogaStyle from "./yogaStyle";
import yogaTeacher from "./yogaTeacher";

// Schemas die bewust NIET meer geregistreerd zijn: ooit bedoeld, geen
// consumer in de website. Als we ze later opnieuw willen gebruiken
// (bv. een echte /blog pagina), revert via git en voeg hier weer toe:
//
// - testimonial: schemabestand bestaat niet meer (verwijderd vóór
//   2026-07-24), geen call-sites, 0 documenten in de dataset (geverifieerd
//   2026-07-24). Homepage toont Google Reviews via react-google-reviews.
// - blogPost: geen /blog pagina gebouwd
// - classPillar: member-system gebruikt Supabase enums, geen Sanity docs
// - classType: idem
// - scheduleTemplate, membershipPlan, bookingSettings: live in Supabase
// - crowdfundingSettings, crowdfundingTier: campagne vervangen door Early
//   Member (/early-member); documenten blijven in de dataset voor de legacy
//   checkout/webhook-routes, maar zijn niet meer bewerkbaar in Studio
// - pricingTier: schemabestand verwijderd (2026-07-24, fix/marketing-
//   content-bugs). tmc.catalogue is de enige prijsbron, dit was een tweede.
//   3 legacy documenten (pricing-essentials/premium/private) blijven in de
//   dataset staan, ongetypeerd en onzichtbaar in Studio. Opschonen van de
//   dataset zelf is een aparte actie (schrijftoegang nodig, niet gedaan
//   als onderdeel van deze schema-opruiming).

export const schemaTypes = [
  siteSettings,
  siteImages,
  openingHours,
  trainer,
  offering,
  faq,
  yogaStyle,
  yogaTeacher,
];
