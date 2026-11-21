import { HP_PAGES } from "../../../content/hormoonprofiel";
import { BREADCRUMB_LABEL, CONTACT, MARLON, credentialLine } from "../../../content/hormoonprofiel/shared";
import { FAQ_ITEMS } from "../../../content/hormoonprofiel/faq";
import { HOME_FAQ } from "../../../content/hormoonprofiel/home";
import { canonicalUrl, TMC_BASE, type HpVariant } from "@/components/hormoonprofiel/links";
import { BUSINESS_ID } from "@/lib/structuredData";
import { HP_ORIGIN, type HpPageKey } from "./slugs";

/**
 * JSON-LD per pagina (spec-hormoonprofiel.md): Person (Marlon, hasCredential),
 * WebPage of Article met author en dateModified, BreadcrumbList, FAQPage op de
 * home en op de vragenpagina, WebSite alleen in standalone. De organisatie is
 * de bestaande TMC-entiteit (#business, Industrieweg 14P): een verwijzing met
 * hetzelfde @id, geen tweede LocalBusiness.
 */

const base = (variant: HpVariant) => (variant === "standalone" ? HP_ORIGIN : TMC_BASE);

function businessRef() {
  return {
    "@type": "ExerciseGym",
    "@id": BUSINESS_ID,
    name: "The Movement Club",
    address: {
      "@type": "PostalAddress",
      streetAddress: CONTACT.street,
      postalCode: CONTACT.zip,
      addressLocality: CONTACT.city,
      addressCountry: "NL",
    },
  };
}

export function personSchema(variant: HpVariant) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${base(variant)}/#marlon`,
    name: MARLON.name,
    jobTitle: MARLON.jobTitle,
    worksFor: { "@id": BUSINESS_ID },
    hasCredential: [
      {
        "@type": "EducationalOccupationalCredential",
        name: credentialLine(),
        credentialCategory: "certificate",
      },
      {
        "@type": "EducationalOccupationalCredential",
        name: MARLON.other,
        credentialCategory: "certificate",
      },
    ],
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${HP_ORIGIN}/#website`,
    name: "Hormoonprofiel",
    url: HP_ORIGIN,
    inLanguage: "nl-NL",
    publisher: { "@id": BUSINESS_ID },
  };
}

export function breadcrumbs(variant: HpVariant, key: HpPageKey) {
  const items =
    variant === "standalone"
      ? key === "home"
        ? [{ name: "Home", url: HP_ORIGIN }]
        : [
            { name: "Home", url: HP_ORIGIN },
            { name: BREADCRUMB_LABEL[key], url: canonicalUrl(variant, key) },
          ]
      : key === "home"
        ? [
            { name: "Home", url: TMC_BASE },
            { name: "Hormoonprofiel", url: canonicalUrl(variant, "home") },
          ]
        : [
            { name: "Home", url: TMC_BASE },
            { name: "Hormoonprofiel", url: canonicalUrl(variant, "home") },
            { name: BREADCRUMB_LABEL[key], url: canonicalUrl(variant, key) },
          ];
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

function faqSchema(items: ReadonlyArray<{ vraag: string; antwoord: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((q) => ({
      "@type": "Question",
      name: q.vraag,
      acceptedAnswer: { "@type": "Answer", text: q.antwoord },
    })),
  };
}

export function pageSchemas(variant: HpVariant, key: HpPageKey): object[] {
  const page = HP_PAGES[key];
  const url = canonicalUrl(variant, key);
  const type = key === "home" ? "WebPage" : key === "contact" ? "ContactPage" : "Article";
  const common = {
    "@context": "https://schema.org",
    "@type": type,
    "@id": `${url}#webpage`,
    url,
    name: page.h1,
    headline: page.h1,
    description: page.metaDescription,
    inLanguage: "nl-NL",
    dateModified: page.dateModified,
    author: { "@id": `${base(variant)}/#marlon` },
    publisher: { "@id": BUSINESS_ID },
    provider: businessRef(),
    ...(variant === "standalone" ? { isPartOf: { "@id": `${HP_ORIGIN}/#website` } } : {}),
  };
  const out: object[] = [personSchema(variant), common, breadcrumbs(variant, key)];
  if (variant === "standalone") out.unshift(websiteSchema());
  if (key === "home") out.push(faqSchema(HOME_FAQ));
  if (key === "faq") out.push(faqSchema(FAQ_ITEMS));
  return out;
}
