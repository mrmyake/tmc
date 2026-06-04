import type { MetadataRoute } from "next";

// AI-crawlers expliciet toegestaan zodat de yoga-content (en de rest van
// de site) meegenomen wordt in AI-zoekmachines en LLM-antwoorden (GEO).
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

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: "/" })),
    ],
    sitemap: "https://themovementclub.nl/sitemap.xml",
    host: "https://themovementclub.nl",
  };
}
