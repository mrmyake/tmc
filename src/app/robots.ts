import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

// AI-crawlers expliciet toegestaan zodat de content (incl. de yoga-minisite)
// meegenomen wordt in AI-zoekmachines en LLM-antwoorden (GEO).
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
];

// Prive/utility-paden die niet in de index horen. Raakt bewust geen
// publieke route (en geen /yoga-route).
const DISALLOW = ["/api/", "/studio/", "/app/", "/auth/", "/login", "/checkin"];

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
