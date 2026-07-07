import type { MetadataRoute } from "next";
import {
  getYogaStyleSlugs,
  getYogaTeacherSlugs,
} from "../../sanity/lib/fetch";
import { SITE_URL } from "@/lib/constants";

// Canonieke base-URL (www) uit de gedeelde constant. Alle sitemap-URL's
// staan zo exact in de geserveerde, niet-redirectende vorm.
const BASE_URL = SITE_URL;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Alleen routes die echt bestaan en indexeerbaar zijn. /bedankt, /login,
  // /checkin en het member-portaal hebben noindex en horen hier niet.
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${BASE_URL}/over`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/aanbod`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/prijzen`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/proefles`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/beweeg-beter`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/mobility-reset`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/mobility-check`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/early-member`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/rooster`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/yoga`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/yoga/docenten`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/yoga/rooster`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
  ];

  // Dynamische yoga-routes uit Sanity (alleen docs met een ingevulde slug;
  // docenten ook alleen als isActive). Bij een fetch-fout valt de sitemap
  // terug op de statische routes zodat de build nooit sneuvelt.
  let yogaDynamic: MetadataRoute.Sitemap = [];
  try {
    const [styleSlugs, teacherSlugs] = await Promise.all([
      getYogaStyleSlugs(),
      getYogaTeacherSlugs(),
    ]);
    yogaDynamic = [
      ...styleSlugs.map((slug) => ({
        url: `${BASE_URL}/yoga/${slug}`,
        lastModified: now,
        changeFrequency: "monthly" as const,
        priority: 0.8,
      })),
      ...teacherSlugs.map((slug) => ({
        url: `${BASE_URL}/yoga/docenten/${slug}`,
        lastModified: now,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
    ];
  } catch (e) {
    console.error("[sitemap] Sanity fetch failed, static routes only:", e);
  }

  return [...staticRoutes, ...yogaDynamic];
}
