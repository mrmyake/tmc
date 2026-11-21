import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";
import { AI_CRAWLERS } from "@/lib/robots-policy";

// Prive/utility-paden die niet in de index horen. Raakt bewust geen
// publieke route (en geen /yoga-route).
const DISALLOW = [
  "/api/",
  "/studio/",
  "/app/",
  "/auth/",
  "/login",
  "/checkin",
  "/kiosk",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: DISALLOW,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
