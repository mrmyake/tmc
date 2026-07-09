import type { Metadata } from "next";
import { getPricingItems } from "@/lib/pricing-items";
import { TwaalfWekenProgrammaContent } from "./TwaalfWekenProgrammaContent";

// Noodgreep, alleen gebruikt als de pricing_items-fetch faalt. Moet gelijk
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

export default async function TwaalfWekenProgrammaPage() {
  const pricingItems = await getPricingItems([
    "program_studio_12w",
    "program_online_12w",
  ]);

  return (
    <TwaalfWekenProgrammaContent
      studioPriceCents={
        pricingItems.get("program_studio_12w")?.price_cents ??
        FALLBACK_STUDIO_CENTS
      }
      onlinePriceCents={
        pricingItems.get("program_online_12w")?.price_cents ??
        FALLBACK_ONLINE_CENTS
      }
    />
  );
}
