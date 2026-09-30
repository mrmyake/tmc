import type { Metadata } from "next";
import { GuestThanks } from "@/components/checkout/GuestThanks";

export const metadata: Metadata = {
  title: "Bedankt | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Publieke bedankpagina van de gastcheckout voor producten (PR 2); zie /abonnement/bedankt. */
export default async function KopenBedanktPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  return <GuestThanks kind="product" token={t} />;
}
