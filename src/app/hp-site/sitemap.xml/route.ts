import { HP_PAGES } from "../../../../content/hormoonprofiel";
import { HP_ORIGIN, HP_PAGE_KEYS, HP_PATHS } from "@/lib/hormoonprofiel/slugs";

// sitemap.xml van hormoonprofiel.com: alleen de 10 pagina's. De proxy
// herschrijft /sitemap.xml hierheen.
export const dynamic = "force-static";

export function GET() {
  const urls = HP_PAGE_KEYS.map((key) => {
    const loc = `${HP_ORIGIN}${HP_PATHS[key] === "/" ? "/" : HP_PATHS[key]}`;
    return `  <url><loc>${loc}</loc><lastmod>${HP_PAGES[key].dateModified}</lastmod></url>`;
  }).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
