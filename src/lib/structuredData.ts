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
    areaServed: SERVICE_AREA,
    sameAs: [SITE.instagram, SITE.hormoonprofiel],
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

// --- Yoga (PR-Y4) ---

/** Korte verwijzing naar de studio als provider/werkgever in yoga-schemas. */
const localBusinessRef = {
  "@type": "GymOrHealthClub",
  name: SITE.name,
  url: SITE.url,
};

/**
 * Verzorgingsgebied van de studio. De studio staat in Loosdrecht, maar bedient
 * eerlijk de hele regio: Hilversum (de grote buur op ~10 minuten) en de rest
 * van Wijdemeren en het Gooi. Wordt gedeeld door de yoga- en business-schemas.
 */
export const SERVICE_AREA = [
  { "@type": "Place", name: "Loosdrecht" },
  { "@type": "City", name: "Hilversum" },
  { "@type": "Place", name: "Wijdemeren" },
  { "@type": "Place", name: "Kortenhoef" },
  { "@type": "Place", name: "Nederhorst den Berg" },
] as const;

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function getBreadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function getYogaServiceSchema(style: {
  title: string;
  slug: string;
  definition: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: style.title,
    serviceType: "Yogales",
    description: style.definition,
    url: `${SITE.url}/yoga/${style.slug}`,
    provider: localBusinessRef,
    areaServed: SERVICE_AREA,
  };
}

export function getYogaFaqSchema(
  faqs: Array<{ question: string; answer: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

export function getYogaItemListSchema(
  styles: Array<{ title: string; slug: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Yogavormen bij The Movement Club",
    itemListElement: styles.map((style, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: style.title,
      url: `${SITE.url}/yoga/${style.slug}`,
    })),
  };
}

export function getYogaTeacherSchema(teacher: {
  name: string;
  slug: string;
  description?: string;
  image?: string;
  knowsAbout?: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: teacher.name,
    jobTitle: "Yogadocent",
    url: `${SITE.url}/yoga/docenten/${teacher.slug}`,
    ...(teacher.description ? { description: teacher.description } : {}),
    ...(teacher.image ? { image: teacher.image } : {}),
    ...(teacher.knowsAbout && teacher.knowsAbout.length > 0
      ? { knowsAbout: teacher.knowsAbout }
      : {}),
    worksFor: localBusinessRef,
  };
}
