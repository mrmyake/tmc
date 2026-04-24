export const siteSettingsQuery = `*[_type == "siteSettings"][0]`;

export const openingHoursQuery = `*[_type == "openingHours"][0]`;

export const trainersQuery = `*[_type == "trainer"] | order(order asc)`;

export const offeringsQuery = `*[_type == "offering"] | order(order asc)`;

export const pricingQuery = `*[_type == "pricingTier"] | order(order asc)`;

export const faqsByPageQuery = `*[_type == "faq" && page == $page] | order(order asc)`;

export const siteImagesQuery = `*[_type == "siteImages"][0]`;

export const crowdfundingSettingsQuery = `*[_type == "crowdfundingSettings"][0]`;

export const crowdfundingTiersQuery = `*[_type == "crowdfundingTier" && active == true] | order(order asc)`;
