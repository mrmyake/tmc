import { client } from "./client";
import {
  siteSettingsQuery,
  openingHoursQuery,
  trainersQuery,
  offeringsQuery,
  pricingQuery,
  faqsByPageQuery,
  siteImagesQuery,
  crowdfundingSettingsQuery,
  crowdfundingTiersQuery,
} from "./queries";
import {
  SITE,
  PILLARS,
  OFFERINGS,
  PRICING_TIERS,
} from "@/lib/constants";

// Types
export interface SanitySettings {
  studioName: string;
  tagline: string;
  taglineAccent?: string;
  phone: string;
  email: string;
  whatsappNumber: string;
  address: { street: string; postalCode: string; city: string };
  kvkNumber: string;
  btwNumber: string;
  instagramUrl: string;
  googleMapsUrl?: string;
}

export interface SanityOpeningHours {
  schedule: Array<{
    day: string;
    open: string;
    close: string;
    closed: boolean;
  }>;
  note?: string;
}

export interface SanityTrainer {
  _id: string;
  name: string;
  role: string;
  photo?: { asset: { _ref: string } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bio?: any[];
  quote?: string;
  certifications?: string[];
}

export interface SanityOffering {
  _id: string;
  title: string;
  slug: { current: string };
  subtitle: string;
  image?: { asset: { _ref: string } };
  description?: unknown[];
  targetAudience: string;
  features: string[];
  frequency: string;
}

export interface SanityPricingTier {
  _id: string;
  name: string;
  subtitle: string;
  features: string[];
  price?: string;
  ctaText: string;
  ctaLink: string;
  highlighted: boolean;
}

export interface SanityFaq {
  _id: string;
  question: string;
  answer: unknown[];
  page: string;
}

// Fetch with fallback
async function safeFetch<T>(query: string, params?: Record<string, string>): Promise<T | null> {
  try {
    return await client.fetch<T>(query, params ?? {});
  } catch (e) {
    console.warn("[Sanity] Fetch failed, using fallback:", e);
    return null;
  }
}

export async function getSiteSettings(): Promise<SanitySettings> {
  const data = await safeFetch<SanitySettings>(siteSettingsQuery);
  if (data) return data;
  // Fallback
  return {
    studioName: SITE.name,
    tagline: SITE.tagline,
    phone: SITE.phone,
    email: SITE.email,
    whatsappNumber: "31600000000",
    address: {
      street: SITE.address.street,
      postalCode: SITE.address.zip,
      city: SITE.address.city,
    },
    kvkNumber: SITE.kvk,
    btwNumber: SITE.btw,
    instagramUrl: SITE.instagram,
  };
}

export async function getOpeningHours(): Promise<SanityOpeningHours> {
  const data = await safeFetch<SanityOpeningHours>(openingHoursQuery);
  if (data) return data;
  return {
    schedule: [
      { day: "Maandag", open: "07:00", close: "21:00", closed: false },
      { day: "Dinsdag", open: "07:00", close: "21:00", closed: false },
      { day: "Woensdag", open: "07:00", close: "21:00", closed: false },
      { day: "Donderdag", open: "07:00", close: "21:00", closed: false },
      { day: "Vrijdag", open: "07:00", close: "21:00", closed: false },
      { day: "Zaterdag", open: "08:00", close: "14:00", closed: false },
      { day: "Zondag", open: "", close: "", closed: true },
    ],
  };
}

export async function getTrainers(): Promise<SanityTrainer[]> {
  const data = await safeFetch<SanityTrainer[]>(trainersQuery);
  if (data && data.length > 0) return data;
  return [
    {
      _id: "fallback-marlon",
      name: SITE.trainer.name,
      role: SITE.trainer.role,
      quote:
        "Ik geloof dat iedereen een atleet is. Het gaat er niet om hoe zwaar je tilt, maar hoe goed je beweegt.",
    },
  ];
}

export async function getOfferings(): Promise<SanityOffering[]> {
  const data = await safeFetch<SanityOffering[]>(offeringsQuery);
  if (data && data.length > 0) return data;
  return OFFERINGS.map((o, i) => ({
    _id: `fallback-${i}`,
    title: o.title,
    slug: { current: o.href.split("#")[1] || "" },
    subtitle: "",
    targetAudience: "",
    features: [],
    frequency: "",
  }));
}

export async function getPricing(): Promise<SanityPricingTier[]> {
  const data = await safeFetch<SanityPricingTier[]>(pricingQuery);
  if (data && data.length > 0) return data;
  return PRICING_TIERS.map((t, i) => ({
    _id: `fallback-${i}`,
    name: t.name,
    subtitle: t.description,
    features: [...t.features],
    ctaText: t.cta,
    ctaLink: "/contact",
    highlighted: t.popular,
  }));
}

export async function getFaqs(page: string): Promise<SanityFaq[]> {
  const data = await safeFetch<SanityFaq[]>(faqsByPageQuery, { page });
  if (data && data.length > 0) return data;
  return [];
}

// Site Images
export interface SanityImage {
  asset: { _ref: string };
  hotspot?: { x: number; y: number };
}

export interface SanityGalleryImage extends SanityImage {
  caption?: string;
}

export interface SanitySiteImages {
  hero?: SanityImage;
  studio?: SanityImage;
  offeringPersonalTraining?: SanityImage;
  offeringSmallGroup?: SanityImage;
  offeringMobility?: SanityImage;
  offeringStrength?: SanityImage;
  overMarlon?: SanityImage;
  hormoonprofiel?: SanityImage;
  gallery?: SanityGalleryImage[];
  beweegBeterCover?: SanityImage;
  mobilityResetThumb?: SanityImage;
  ogImage?: SanityImage;
}

export async function getSiteImages(): Promise<SanitySiteImages> {
  const data = await safeFetch<SanitySiteImages>(siteImagesQuery);
  return data || {};
}

// Crowdfunding
export interface SanityBudgetItem {
  _key?: string;
  label: string;
  amount: number;
}

export interface SanityCrowdfundingSettings {
  active: boolean;
  goal: number;
  startDate?: string;
  endDate?: string;
  headline: string;
  subline?: string;
  heroImage?: SanityImage;
  story?: unknown[];
  budgetItems?: SanityBudgetItem[];
  whatsappShareText?: string;
  thankYouTitle?: string;
  thankYouText?: string;
}

export interface SanityCrowdfundingTier {
  _id: string;
  tierId: string;
  name: string;
  tagline?: string;
  description?: string;
  price: number;
  normalPrice?: number;
  maxSlots?: number;
  includes?: string[];
  badge?: string;
  highlighted: boolean;
  active: boolean;
  order: number;
}

export async function getCrowdfundingSettings(): Promise<SanityCrowdfundingSettings | null> {
  return await safeFetch<SanityCrowdfundingSettings>(crowdfundingSettingsQuery);
}

export async function getCrowdfundingTiers(): Promise<SanityCrowdfundingTier[]> {
  const data = await safeFetch<SanityCrowdfundingTier[]>(crowdfundingTiersQuery);
  return data || [];
}

export async function getCrowdfundingTierById(
  tierId: string
): Promise<SanityCrowdfundingTier | null> {
  return await safeFetch<SanityCrowdfundingTier>(
    `*[_type == "crowdfundingTier" && tierId == $tierId][0]`,
    { tierId }
  );
}

// Re-export PILLARS (not in CMS, static)
export { PILLARS };
