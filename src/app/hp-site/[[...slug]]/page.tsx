import { notFound } from "next/navigation";
import { PageView } from "@/components/hormoonprofiel/PageView";
import { hpMetadata } from "@/lib/hormoonprofiel/metadata";
import { HP_PAGE_KEYS, HP_PATHS, keyForPath, type HpPageKey } from "@/lib/hormoonprofiel/slugs";

// Interne route van hormoonprofiel.com. Alleen via de proxy bereikbaar.
export const dynamicParams = true;

export function generateStaticParams() {
  return HP_PAGE_KEYS.map((key) => ({
    slug: key === "home" ? [] : HP_PATHS[key].slice(1).split("/"),
  }));
}

function resolveKey(slug: string[] | undefined): HpPageKey | null {
  return keyForPath(slug && slug.length > 0 ? `/${slug.join("/")}` : "/");
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) {
  const key = resolveKey((await params).slug);
  return key ? hpMetadata("standalone", key) : {};
}

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const key = resolveKey((await params).slug);
  if (!key) notFound();
  return <PageView pageKey={key} variant="standalone" />;
}
