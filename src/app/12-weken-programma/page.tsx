import type { Metadata } from "next";
import { getCatalogue } from "@/lib/catalogue";
import { resolveAttribution } from "@/lib/attribution/params";
import { getSiteImages } from "../../../sanity/lib/fetch";
import { TwaalfWekenProgrammaContent } from "./TwaalfWekenProgrammaContent";

// Noodgreep, alleen gebruikt als de catalogus-fetch faalt. Moet gelijk
// blijven aan de live catalogus, maar is bewust niet de bron van waarheid.
const FALLBACK_STUDIO_CENTS = 240000;
const FALLBACK_ONLINE_CENTS = 125000;

export const metadata: Metadata = {
  title: "Het 12 Weken Programma | The Movement Club Loosdrecht",
  description:
    "Eerst meten, dan pas trainen. Een persoonlijk traject van twaalf weken met Marlon: volledige meting, hormonaal profiel, voeding en dagelijkse begeleiding.",
  alternates: { canonical: "/12-weken-programma" },
  openGraph: {
    title: "Het 12 Weken Programma | The Movement Club Loosdrecht",
    description:
      "Eerst meten, dan pas trainen. Een persoonlijk traject van twaalf weken met Marlon: volledige meting, hormonaal profiel, voeding en dagelijkse begeleiding.",
  },
};

// Dynamisch vanwege de campagneparameters (gclid, utm_*) in searchParams: ze
// reizen alleen via de URL en de interne links mee naar de intake
// (spec-marketing-attribution.md), zonder cookie of web storage.
export const dynamic = "force-dynamic";

export default async function TwaalfWekenProgrammaPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const attribution = resolveAttribution(sp, "/12-weken-programma");
  const [catalogue, images] = await Promise.all([
    getCatalogue(),
    getSiteImages(),
  ]);

  return (
    <TwaalfWekenProgrammaContent
      attribution={attribution}
      marlonImage={images.overMarlon}
      studioPriceCents={
        catalogue.get("program_studio_12w")?.price_cents ??
        FALLBACK_STUDIO_CENTS
      }
      onlinePriceCents={
        catalogue.get("program_online_12w")?.price_cents ??
        FALLBACK_ONLINE_CENTS
      }
    />
  );
}
