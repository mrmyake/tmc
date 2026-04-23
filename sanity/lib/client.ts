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
 * Build a Sanity image URL. Chains `.auto("format")` so the CDN serves
 * AVIF/WebP to clients that accept it. Next's `<Image>` already does its
 * own negotiation via the optimizer, but keeping this on the raw URL
 * means direct `.url()` output (used in PDF generation, og-image meta,
 * any remaining `<img>` fallback) is already efficient.
 */
export const urlFor = (source: SanityImageSource) =>
  builder.image(source).auto("format");
