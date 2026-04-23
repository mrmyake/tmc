import { createClient } from "@sanity/client";
import imageUrlBuilder, {
  type SanityImageSource,
} from "@sanity/image-url";

const projectId =
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "hn9lkvte";
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production";

export const client = createClient({
  projectId,
  dataset,
  apiVersion: "2026-04-01",
  useCdn: true,
});

const builder = imageUrlBuilder(client);

/**
 * Build a Sanity image URL. Chains `.auto("format")` zodat de CDN AVIF/
 * WebP teruggeeft aan browsers die het ondersteunen, en `.quality(75)`
 * voor een balans tussen bestandsgrootte en kwaliteit. Next's `<Image>`
 * doet zijn eigen negotiatie via de optimizer, maar deze ketting geldt
 * ook voor directe `.url()` output (PDF-rendering, OG-meta, raw `<img>`
 * fallbacks) zodat die óók klein en modern zijn.
 */
export const urlFor = (source: SanityImageSource) =>
  builder.image(source).auto("format").quality(75);
