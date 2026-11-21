import type { Metadata } from "next";
import { HP_PAGES } from "../../../content/hormoonprofiel";
import { canonicalUrl, type HpVariant } from "@/components/hormoonprofiel/links";
import type { HpPageKey } from "./slugs";

/**
 * Metadata per pagina en schil. De title krijgt zijn suffix van de template
 * in de layout: standalone " | Hormoonprofiel" (src/app/hp-site/layout.tsx),
 * sectie " | The Movement Club" (root layout). Geen noindex op inhoudspagina's.
 */
export function hpMetadata(variant: HpVariant, key: HpPageKey): Metadata {
  const page = HP_PAGES[key];
  const url = canonicalUrl(variant, key);
  const topic = variant === "section" && page.topicSection ? page.topicSection : page.topic;
  const siteName = variant === "standalone" ? "Hormoonprofiel" : "The Movement Club";
  return {
    title: topic,
    description: page.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "nl_NL",
      siteName,
      url,
      title: variant === "standalone" ? `${topic} | Hormoonprofiel` : `${topic} | The Movement Club`,
      description: page.metaDescription,
    },
    twitter: { card: "summary" },
  };
}

/** Volledige title zoals hij in de HTML komt (voor tests en JSON-LD). */
export function hpFullTitle(variant: HpVariant, key: HpPageKey): string {
  const page = HP_PAGES[key];
  const topic = variant === "section" && page.topicSection ? page.topicSection : page.topic;
  return variant === "standalone" ? `${topic} | Hormoonprofiel` : `${topic} | The Movement Club`;
}
