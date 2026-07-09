export const siteSettingsQuery = `*[_type == "siteSettings"][0]`;

export const openingHoursQuery = `*[_type == "openingHours"][0]`;

export const trainersQuery = `*[_type == "trainer"] | order(order asc)`;

export const offeringsQuery = `*[_type == "offering"] | order(order asc)`;

export const faqsByPageQuery = `*[_type == "faq" && page == $page] | order(order asc)`;

export const siteImagesQuery = `*[_type == "siteImages"][0]`;

// Legacy: alleen nog gebruikt door /api/crowdfunding (zie fetch.ts).
export const crowdfundingSettingsQuery = `*[_type == "crowdfundingSettings"][0]`;

// --- Yoga ---

const yogaTeacherProjection = `{
  _id,
  name,
  "slug": slug.current,
  specialty,
  heroQuote,
  bio,
  photo,
  isActive,
  order
}`;

const yogaStyleProjection = `{
  _id,
  title,
  "slug": slug.current,
  intensity,
  definition,
  shortDescription,
  forWho,
  benefits,
  body,
  image,
  faqs,
  seoTitle,
  seoDescription,
  order,
  "teachers": teachers[]->${yogaTeacherProjection}
}`;

// Vormen, gesorteerd op de rust → actief as.
export const yogaStylesQuery = `*[_type == "yogaStyle"] | order(intensity asc) ${yogaStyleProjection}`;

export const yogaStyleBySlugQuery = `*[_type == "yogaStyle" && slug.current == $slug][0] ${yogaStyleProjection}`;

export const yogaStyleSlugsQuery = `*[_type == "yogaStyle" && defined(slug.current)].slug.current`;

// Docenten. Hun vormen worden afgeleid via een reverse reference op yogaStyle.
export const yogaTeachersQuery = `*[_type == "yogaTeacher"] | order(order asc) {
  _id,
  name,
  "slug": slug.current,
  specialty,
  heroQuote,
  bio,
  photo,
  isActive,
  internalNote,
  order,
  "styles": *[_type == "yogaStyle" && references(^._id)] | order(intensity asc) {
    title,
    "slug": slug.current
  }
}`;

export const yogaTeacherBySlugQuery = `*[_type == "yogaTeacher" && slug.current == $slug][0] {
  _id,
  name,
  "slug": slug.current,
  specialty,
  heroQuote,
  bio,
  photo,
  isActive,
  internalNote,
  order,
  "styles": *[_type == "yogaStyle" && references(^._id)] | order(intensity asc) {
    title,
    "slug": slug.current
  }
}`;

export const yogaTeacherSlugsQuery = `*[_type == "yogaTeacher" && isActive == true && defined(slug.current)].slug.current`;
