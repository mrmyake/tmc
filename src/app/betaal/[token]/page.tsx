import { notFound } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { getMollieClient } from "@/lib/mollie";
import { formatEuro } from "@/lib/format";
import { isValidOrderToken } from "@/lib/orders/payment-link-core";
import { PayButton } from "./PayButton";

export const metadata = {
  title: "Betaalverzoek | The Movement Club",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type ViewState = "payable" | "retry" | "processing" | "done" | "expired";

/**
 * WS-5 PR A: publieke landingspagina van een betaallink. Het token (uuid,
 * uniek op tmc.orders) is de enige poort; er is bewust geen login, want de
 * klant heeft mogelijk nog nooit ingelogd. Service-role lookup omdat orders
 * geen anonieme leespolicy heeft.
 *
 * Privacy: toont uitsluitend voornaam, catalogusnaam, bedragen en
 * geldig-tot. Onbekend, ongeldig of geannuleerd token wordt een kale 404
 * die niet verraadt of het token ooit bestaan heeft.
 */
export default async function BetaalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isValidOrderToken(token) || !isAdminConfigured()) notFound();

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select(
      "id, profile_id, kind, catalogue_slug, status, expires_at, first_charge_cents, recurring_cents, signup_fee_cents, mollie_payment_id",
    )
    .eq("token", token)
    .maybeSingle();

  if (!order || order.status === "cancelled") notFound();

  const [{ data: profile }, { data: item }] = await Promise.all([
    admin
      .from("profiles")
      .select("first_name")
      .eq("id", order.profile_id)
      .maybeSingle(),
    admin
      .from("catalogue")
      .select("display_name")
      .eq("slug", order.catalogue_slug)
      .maybeSingle(),
  ]);

  const isSubscription = order.kind === "subscription";
  const itemLabel = item?.display_name ?? order.catalogue_slug;
  const firstName = profile?.first_name ?? "";
  const isExpired =
    order.status === "expired" || new Date(order.expires_at) <= new Date();

  let state: ViewState;
  if (order.status === "activated") {
    state = "done";
  } else if (order.status === "paid") {
    // Geld is binnen maar activatie is ops-geblokkeerd (blocked_reason);
    // interne zaak, de klant ziet gewoon "ontvangen, wordt verwerkt".
    state = "processing";
  } else if (isExpired) {
    state = "expired";
  } else {
    state = "payable";
    // Na de Mollie-redirect terug hierheen kan de webhook nog onderweg
    // zijn: kijk naar de payment zelf voor directe feedback.
    if (order.mollie_payment_id) {
      try {
        const mollie = getMollieClient();
        const payment = mollie
          ? await mollie.payments.get(order.mollie_payment_id)
          : null;
        if (payment?.status === "paid" || payment?.status === "pending" || payment?.status === "authorized") {
          state = "processing";
        } else if (
          payment &&
          ["failed", "expired", "canceled"].includes(payment.status)
        ) {
          state = "retry";
        }
      } catch {
        // Status onbekend: toon gewoon de betaalstaat, de server action
        // hervalideert toch voordat er iets gemint wordt.
      }
    }
  }

  const expiresLabel = new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(order.expires_at));

  // COPY: confirm met Marlon
  const COPY: Record<ViewState, { eyebrow: string; title: string; body: string }> = {
    payable: {
      eyebrow: "Betaalverzoek",
      title: firstName
        ? `Hé ${firstName}, alles staat voor je klaar.`
        : "Alles staat voor je klaar.",
      body: "Controleer hieronder je bestelling en rond de betaling af via Mollie.",
    },
    retry: {
      eyebrow: "Betaalverzoek",
      title: "De vorige poging is niet gelukt.",
      body: "Geen zorgen: er is niets afgeschreven. Probeer het hieronder opnieuw.",
    },
    processing: {
      eyebrow: "Bijna klaar",
      title: "Je betaling is ontvangen.",
      body: "We verwerken hem nu. Dit duurt meestal maar een paar minuten; je hoeft niets meer te doen.",
    },
    done: {
      eyebrow: "Gelukt",
      title: "Je betaling is rond.",
      body: isSubscription
        ? "Welkom bij The Movement Club. Je abonnement is actief; je kunt inloggen en lessen boeken."
        : "Je aankoop is verwerkt en je tegoed staat klaar zodra je inlogt.",
    },
    expired: {
      eyebrow: "Verlopen",
      title: "Deze betaallink is verlopen.",
      body: "Neem contact op met Marlon, dan zet zij een nieuwe link voor je klaar.",
    },
  };
  const copy = COPY[state];
  const showDetails = state === "payable" || state === "retry";

  return (
    <main className="min-h-screen bg-bg">
      <Container className="py-24 max-w-2xl text-center">
        <span className="inline-block text-accent text-xs font-medium uppercase tracking-[0.25em] mb-4">
          {copy.eyebrow}
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl md:text-5xl text-text mb-5 leading-tight">
          {copy.title}
        </h1>
        <p className="text-text-muted text-lg leading-relaxed mb-10">
          {copy.body}
        </p>

        {showDetails && (
          <>
            <div className="inline-block w-full max-w-md bg-bg-elevated border border-bg-subtle px-8 py-6 mb-8 text-left">
              <div className="text-xs uppercase tracking-[0.2em] text-text-muted mb-2">
                {isSubscription ? "Jouw abonnement" : "Jouw bestelling"}
              </div>
              <div className="font-[family-name:var(--font-playfair)] text-2xl text-text mb-4">
                {itemLabel}
              </div>
              <div className="flex justify-between text-sm text-text mb-1">
                <span>{isSubscription ? "Eerste betaling" : "Totaal"}</span>
                <span>{formatEuro(Math.round(order.first_charge_cents / 100))}</span>
              </div>
              {isSubscription && order.signup_fee_cents > 0 && (
                <div className="flex justify-between text-xs text-text-muted mb-1">
                  <span>Waarvan eenmalige inschrijfkosten</span>
                  <span>{formatEuro(Math.round(order.signup_fee_cents / 100))}</span>
                </div>
              )}
              {isSubscription && order.recurring_cents !== null && (
                <div className="flex justify-between text-sm text-text-muted">
                  <span>Daarna per 4 weken</span>
                  <span>{formatEuro(Math.round(order.recurring_cents / 100))}</span>
                </div>
              )}
            </div>

            {isSubscription && (
              <p className="text-text-muted text-sm leading-relaxed max-w-md mx-auto mb-8">
                Je betaalt de eerste periode nu via Mollie. Daarmee geef je
                toestemming (SEPA-machtiging) om het abonnementsbedrag daarna
                per 4 weken automatisch af te schrijven.
              </p>
            )}

            <PayButton token={token} />
            <p className="text-text-muted text-xs mt-6">
              Deze link is geldig tot {expiresLabel}. Betalen gaat veilig via
              Mollie.
            </p>
          </>
        )}
      </Container>
    </main>
  );
}
