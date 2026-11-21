import { AI_CRAWLERS } from "@/lib/robots-policy";
import { HP_ORIGIN } from "@/lib/hormoonprofiel/slugs";

// robots.txt van hormoonprofiel.com (de proxy herschrijft /robots.txt hierheen).
// Zelfde beleid als TMC: AI-crawlers toegestaan; alleen /api/ dicht.
export const dynamic = "force-static";

export function GET() {
  const rule = (agent: string) => `User-Agent: ${agent}\nAllow: /\nDisallow: /api/\n`;
  const body = [
    rule("*"),
    ...AI_CRAWLERS.map(rule),
    `Host: ${HP_ORIGIN}\nSitemap: ${HP_ORIGIN}/sitemap.xml\n`,
  ].join("\n");
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
