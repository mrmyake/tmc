import type { MetadataRoute } from "next";
import {
  getYogaStyleSlugs,
  getYogaTeacherSlugs,
} from "../../sanity/lib/fetch";

const BASE_URL = "https://themovementclub.nl";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/over`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/aanbod`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/contact`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/proefles`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/beweeg-beter`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/mobility-reset`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/mobility-check`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/crowdfunding`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    // /bedankt pages excluded (noindex via metadata)
  ];

  // Yoga-minisite: slugs uit Sanity zodat nieuwe vormen/docenten
  // automatisch in de sitemap verschijnen.
  const [styleSlugs, teacherSlugs] = await Promise.all([
    getYogaStyleSlugs(),
    getYogaTeacherSlugs(),
  ]);

  const yogaRoutes: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/yoga`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/yoga/docenten`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/yoga/rooster`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
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

  return [...staticRoutes, ...yogaRoutes];
}
