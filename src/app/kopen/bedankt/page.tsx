import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuestThanks } from "@/components/checkout/GuestThanks";
import { isGuestCheckoutEnabled } from "@/lib/checkout/guest-flag";

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
  if (!isGuestCheckoutEnabled()) notFound();
  const { t } = await searchParams;
  return <GuestThanks kind="product" token={t} />;
}
