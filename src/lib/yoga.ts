import { urlFor } from "../../sanity/lib/client";
import type { SanityImage } from "../../sanity/lib/fetch";

/** Docenten waarvoor een lokale placeholder-portretfoto is aangeleverd. */
const PLACEHOLDER_SLUGS = new Set(["kim", "bionda", "connie", "annouschka"]);

/**
 * Portretfoto voor een yogadocent. Gebruikt de Sanity-afbeelding zodra die
 * is geüpload; valt anders terug op de aangeleverde placeholder in
 * `public/images/yoga/`. Geeft `null` als er niets is, zodat de UI een
 * tekst-fallback kan tonen.
 */
export function teacherPhotoSrc(teacher: {
  slug: string;
  photo?: SanityImage;
}): string | null {
  if (teacher.photo?.asset) {
    return urlFor(teacher.photo).width(640).height(800).url();
  }
  return PLACEHOLDER_SLUGS.has(teacher.slug)
    ? `/images/yoga/${teacher.slug}.jpg`
    : null;
}

/** Maximale waarde op de intensiteits-as (rust → actief). */
export const YOGA_INTENSITY_MAX = 5;
