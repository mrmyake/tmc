import { SITE } from "./constants";

export function getLocalBusinessSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "GymOrHealthClub",
    name: SITE.name,
    description:
      "Exclusieve boutique gym in Loosdrecht. Personal training, small group sessions, mobility en strength.",
    url: SITE.url,
    telephone: SITE.phone,
    email: SITE.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: SITE.address.street,
      addressLocality: SITE.address.city,
      postalCode: SITE.address.zip,
      addressRegion: SITE.address.region,
      addressCountry: "NL",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 52.2,
      longitude: 5.095,
    },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "07:00",
        closes: "21:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "Saturday",
        opens: "08:00",
        closes: "14:00",
      },
    ],
    priceRange: "€€€",
    image: `${SITE.url}/images/hero/studio.jpg`,
    sameAs: [SITE.instagram],
  };
}

export function getWebsiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.url,
  };
}
