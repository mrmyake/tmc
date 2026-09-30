import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { isGuestCheckoutEnabled } from "@/lib/checkout/guest-flag";
import { DevGuestCheckoutForm } from "./DevGuestCheckoutForm";

export const metadata: Metadata = {
  title: "Dev: gastcheckout | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Tijdelijk testformulier voor PR 2 van "betalen voor account": de
 * checkoutstappen zelf krijgen de nieuwe gegevensstap pas in PR 3, maar
 * de serverkant (startGuestCheckout, webhook, /welkom, bedankpagina's)
 * moet op de preview al end-to-end te doorlopen zijn. Alleen buiten
 * production en met de vlag aan; PR 3 verwijdert deze route.
 */
export default function DevGastcheckoutPage() {
  if (process.env.VERCEL_ENV === "production" || !isGuestCheckoutEnabled()) notFound();
  return (
    <Container className="py-16 max-w-2xl">
      <span className="tmc-eyebrow tmc-eyebrow--accent block mb-4">Dev · gastcheckout (PR 2)</span>
      <h1 className="font-[family-name:var(--font-playfair)] text-3xl text-text mb-3">
        Testformulier voor de serverkant
      </h1>
      <p className="text-text-muted mb-8 max-w-xl">
        Roept startGuestCheckout aan met de ingevulde gegevens en stuurt je naar de
        Mollie-testcheckout. Bestaat het adres al, dan is de inlogcode verstuurd en zie
        je dat hier. Deze pagina bestaat alleen op previews en verdwijnt in PR 3.
      </p>
      <DevGuestCheckoutForm />
    </Container>
  );
}
