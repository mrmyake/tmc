export const siteSettingsQuery = `*[_type == "siteSettings"][0]`;

export const openingHoursQuery = `*[_type == "openingHours"][0]`;

export const trainersQuery = `*[_type == "trainer"] | order(order asc)`;

export const offeringsQuery = `*[_type == "offering"] | order(order asc)`;

export const pricingQuery = `*[_type == "pricingTier"] | order(order asc)`;

export const testimonialsQuery = `*[_type == "testimonial" && active == true] | order(order asc)`;

export const faqsByPageQuery = `*[_type == "faq" && page == $page] | order(order asc)`;

export const blogPostsQuery = `*[_type == "blogPost"] | order(publishedAt desc)`;

export const blogPostBySlugQuery = `*[_type == "blogPost" && slug.current == $slug][0]{
  ...,
  author->{ name, photo }
}`;
