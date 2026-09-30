import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuestThanks } from "@/components/checkout/GuestThanks";
import { isGuestCheckoutEnabled } from "@/lib/checkout/guest-flag";

export const metadata: Metadata = {
  title: "Bedankt | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Publieke bedankpagina van de gastcheckout voor abonnementen (PR 2). De
 * ingelogde variant blijft /app/abonnement/bedankt. Het status-token in ?t=
 * leest alleen status en e-mail; nooit een sessie.
 */
export default async function AbonnementBedanktPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  if (!isGuestCheckoutEnabled()) notFound();
  const { t } = await searchParams;
  return <GuestThanks kind="subscription" token={t} />;
}
