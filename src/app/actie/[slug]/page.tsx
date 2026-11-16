import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveAttribution, withAttribution } from "@/lib/attribution/params";
import { isActieSlug } from "@/lib/actie/core";
import { lookupCampaignLanding } from "@/lib/actie/lookup";
import { ACTIE_SHARED, GOOGLE_SCORE, actieContent } from "@/lib/actie/content";
import { getRoosterPreview } from "@/lib/actie/rooster-preview";
import { durationMinutes } from "@/lib/format-date";
import { SITE } from "@/lib/constants";
import { getTrainers } from "../../../../sanity/lib/fetch";
import { urlFor } from "../../../../sanity/lib/client";
import { ActieLanding, type ActieRoosterRow } from "./ActieLanding";

// Dynamisch: de pagina leest de slug uit de database, het rooster is live en
// de campagneparameters komen uit de URL. Nooit prerenderen of cachen.
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Noindex en nofollow, plus een eigen canonical naar de pagina zelf: zonder
 * die laatste erft de pagina de canonical van de root-layout (de homepage).
 * Bewust niet via robots.txt geblokkeerd, anders ziet een crawler de noindex
 * niet. De pagina staat niet in sitemap.ts.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const safeSlug = isActieSlug(slug) ? slug : "";
  const content = actieContent(safeSlug);
  return {
    // Title zonder merknaam: de layout-template voegt die toe.
    title: content.pill,
    description: content.lead,
    robots: { index: false, follow: false },
    alternates: { canonical: safeSlug ? `/actie/${safeSlug}` : "/proefles" },
  };
}

const TIME_ZONE = "Europe/Amsterdam";
const dayFormat = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: TIME_ZONE,
});
const timeFormat = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TIME_ZONE,
});

export default async function ActiePage({ params, searchParams }: PageProps) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  // Advertentie- en campagneparameters uit de URL
  // (spec-marketing-attribution.md): deze pagina is de landing (lp), en de
  // knop naar de startroute draagt ze mee tot in de boeking.
  const attribution = resolveAttribution(sp, `/actie/${slug}`);

  // Onbekende, inactieve of verlopen slug, of een ingetrokken, uitgeputte of
  // verlopen code: door naar de organische pagina (307).
  const landing = await lookupCampaignLanding(slug);
  if (!landing) redirect(withAttribution("/proefles", attribution));

  const content = actieContent(landing.slug);
  const [trainers, preview] = await Promise.all([
    getTrainers(),
    getRoosterPreview(landing.pillarFilter, 4),
  ]);

  // Tijden hier al opgemaakt in Europe/Amsterdam, zodat server en browser
  // dezelfde tekst renderen (geen hydratieverschil door de tijdzone).
  const rows: ActieRoosterRow[] = preview.map((item) => {
    const start = new Date(item.startAt);
    return {
      key: item.key,
      day: dayFormat.format(start),
      time: timeFormat.format(start),
      title: item.kind === "vrij" ? ACTIE_SHARED.vrijTrainenTitle : item.title,
      duration:
        item.kind === "vrij"
          ? ACTIE_SHARED.vrijTrainenDuration
          : `${durationMinutes(start, new Date(item.endAt))} min`,
      status: item.status,
    };
  });

  // Portret van Marlon (trainer.photo, hoofdtrainer eerst). Eén bron voor
  // mobiel en desktop; de uitsnede doet CSS met object-position (B14).
  const photo = trainers[0]?.photo;
  const photoUrl = photo ? urlFor(photo).width(1200).url() : null;

  // LET OP: geen enkel veld van `landing` behalve slug gaat naar de client.
  // landing.code blijft op de server (zie src/lib/actie/lookup.ts).
  return (
    <ActieLanding
      slug={landing.slug}
      content={content}
      shared={ACTIE_SHARED}
      googleScore={GOOGLE_SCORE}
      rows={rows}
      photoUrl={photoUrl}
      startHref={withAttribution(`/actie/${landing.slug}/start`, attribution)}
      whatsappHref={`${SITE.whatsapp}?text=${encodeURIComponent(ACTIE_SHARED.whatsappText)}`}
      address={`${SITE.address.street}, ${SITE.address.zip} ${SITE.address.city}`}
    />
  );
}
