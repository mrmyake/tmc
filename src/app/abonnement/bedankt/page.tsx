import type { Metadata } from "next";
import { GuestThanks } from "@/components/checkout/GuestThanks";

export const metadata: Metadata = {
  title: "Bedankt | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Publieke bedankpagina van de gastcheckout voor abonnementen (PR 2). De
 * ingelogde variant blijft /app/abonnement/bedankt. Het status-token in ?t=
 * leest alleen status en e-mail; nooit een sessie. Bewust niet achter
 * CHECKOUT_GUEST_ENABLED: wie terugkomt van Mollie moet zijn status zien, ook
 * als de vlag intussen uit staat; alleen een nieuwe betaling starten is dan
 * dicht (retryGuestCheckoutPayment geeft "disabled").
 */
export default async function AbonnementBedanktPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  return <GuestThanks kind="subscription" token={t} />;
}
