// Tijdelijk icoon van hormoonprofiel.com: een "h" op salie. De proxy
// herschrijft /favicon.svg en /favicon.ico hierheen.
export const dynamic = "force-static";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#4E5C46"/><text x="32" y="47" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-style="italic" font-size="44" fill="#F4EFE6">h</text></svg>`;

export function GET() {
  return new Response(SVG, {
    headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" },
  });
}
