import siteSettings from "./siteSettings";
import openingHours from "./openingHours";
import trainer from "./trainer";
import offering from "./offering";
import faq from "./faq";
import siteImages from "./siteImages";
import yogaStyle from "./yogaStyle";
import yogaTeacher from "./yogaTeacher";

// Schemas die bewust NIET meer geregistreerd zijn — ooit bedoeld, geen
// consumer in de website. Als we ze later opnieuw willen gebruiken
// (bv. een echte /blog pagina), revert via git en voeg hier weer toe:
//
// - testimonial  — homepage toont Google Reviews via react-google-reviews
// - blogPost     — geen /blog pagina gebouwd
// - classPillar  — member-system gebruikt Supabase enums, geen Sanity docs
// - classType    — idem
// - scheduleTemplate, membershipPlan, bookingSettings — live in Supabase
// - crowdfundingSettings, crowdfundingTier — campagne vervangen door Early
//   Member (/early-member); documenten blijven in de dataset voor de legacy
//   checkout/webhook-routes, maar zijn niet meer bewerkbaar in Studio
// - pricingTier  — alle prijzen komen nu uit tmc.membership_plan_catalogue
//   en tmc.pricing_items (Supabase); documenten blijven in de dataset,
//   opschonen is een aparte PR

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
