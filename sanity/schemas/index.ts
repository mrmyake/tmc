import siteSettings from "./siteSettings";
import openingHours from "./openingHours";
import trainer from "./trainer";
import offering from "./offering";
import pricingTier from "./pricingTier";
import faq from "./faq";
import siteImages from "./siteImages";
import crowdfundingSettings from "./crowdfundingSettings";
import crowdfundingTier from "./crowdfundingTier";

// Schemas die bewust NIET meer geregistreerd zijn — ooit bedoeld, geen
// consumer in de website. Als we ze later opnieuw willen gebruiken
// (bv. een echte /blog pagina), revert via git en voeg hier weer toe:
//
// - testimonial  — homepage toont Google Reviews via react-google-reviews
// - blogPost     — geen /blog pagina gebouwd
// - classPillar  — member-system gebruikt Supabase enums, geen Sanity docs
// - classType    — idem
// - scheduleTemplate, membershipPlan, bookingSettings — live in Supabase

export const schemaTypes = [
  siteSettings,
  siteImages,
  openingHours,
  crowdfundingSettings,
  trainer,
  offering,
  pricingTier,
  crowdfundingTier,
  faq,
];
