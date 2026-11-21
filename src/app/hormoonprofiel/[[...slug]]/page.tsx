import { notFound } from "next/navigation";
import { PageView } from "@/components/hormoonprofiel/PageView";
import { hpMetadata } from "@/lib/hormoonprofiel/metadata";
import { HP_PAGE_KEYS, HP_PATHS, keyForSectionRest, type HpPageKey } from "@/lib/hormoonprofiel/slugs";

// De sectie /hormoonprofiel op TMC (spec-hormoonprofiel.md). Staat
// hormoonprofiel.com op standalone, dan stuurt de proxy deze paden met 307
// naar hormoonprofiel.com; in een redirect-modus toont de proxy ze door.
export const dynamicParams = false;

export function generateStaticParams() {
  return HP_PAGE_KEYS.map((key) => ({
    slug: key === "home" ? [] : HP_PATHS[key].slice(1).split("/"),
  }));
}

function resolveKey(slug: string[] | undefined): HpPageKey | null {
  return keyForSectionRest(slug && slug.length > 0 ? `/${slug.join("/")}` : "");
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) {
  const key = resolveKey((await params).slug);
  return key ? hpMetadata("section", key) : {};
}

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const key = resolveKey((await params).slug);
  if (!key) notFound();
  return <PageView pageKey={key} variant="section" />;
}
