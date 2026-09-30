import { Button, Heading, Hr, Section, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";
import {
  ProductBody,
  Row,
  SubscriptionBody,
  confirmationStyles,
  type OrderConfirmationProps,
} from "./order_confirmation";

/**
 * Welkomstmail van de gastcheckout ("betalen voor account", PR 2, scherm 10
 * van mockups/checkout-betalen-voor-account.html). Vervangt de gewone
 * bevestigingsmail voor een account dat in de Mollie-webhook is aangemaakt:
 * zelfde chrome, zelfde bedragen en btw-regels (props uit
 * order-confirmation-core), plus het linkblok met de inloglink.
 *
 * De link draagt het inlogtoken (/welkom/<token>). Een GET op die pagina
 * verbruikt niets; pas de knop "Inloggen" daar logt in.
 */
export interface WelcomeCheckoutProps {
  order: OrderConfirmationProps;
  /** Volledige URL naar /welkom/<inlogtoken>. */
  loginUrl: string;
}

export default function WelcomeCheckout({ order, loginUrl }: WelcomeCheckoutProps) {
  const { firstName, productName, paidEuro, paidVatEuro, vatRateLabel } = order;
  const s = confirmationStyles;
  return (
    // COPY: confirm met Marlon
    <EmailLayout preview="Welkom bij The Movement Club, je inloglink staat klaar">
      {/* COPY: confirm met Marlon */}
      <Text style={s.eyebrow}>Welkom</Text>
      {/* COPY: confirm met Marlon */}
      <Heading as="h1" style={s.heading}>
        Hé {firstName || "daar"}, je bent lid.
      </Heading>
      {/* COPY: confirm met Marlon */}
      <Text style={s.body}>
        {order.kind === "subscription"
          ? `Je betaling is binnen en je abonnement ${productName} is actief. `
          : `Je betaling is binnen en je ${productName} staat klaar. `}
        We hebben een account voor je aangemaakt op dit e-mailadres. Log in met
        de knop hieronder; daarna zie je je rooster, boekingen en{" "}
        {order.kind === "subscription" ? "abonnement" : "tegoed"}.
      </Text>

      <Section
        style={{
          backgroundColor: "#17140F",
          border: `1px solid ${emailTokens.INK_700}`,
          padding: "20px 24px",
          margin: "8px 0 24px 0",
        }}
      >
        {/* COPY: confirm met Marlon */}
        <Text style={{ ...s.eyebrow, margin: "0 0 10px 0" }}>Je inloglink</Text>
        <Button
          href={loginUrl}
          style={{
            backgroundColor: emailTokens.CHAMPAGNE,
            color: emailTokens.INK_900,
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            padding: "14px 28px",
            textDecoration: "none",
          }}
        >
          {/* COPY: confirm met Marlon */}
          {order.kind === "subscription" ? "Log in en boek je eerste les" : "Log in en bekijk je tegoed"}
        </Button>
        {/* COPY: confirm met Marlon */}
        <Text style={{ ...s.muted, margin: "16px 0 0 0" }}>
          Deze link is 7 dagen geldig. Op de pagina die opent druk je op
          Inloggen; daarna is de link gebruikt en log je voortaan in op
          themovementclub.nl/login met dit e-mailadres, met een inlogcode per
          mail.
        </Text>
      </Section>

      {order.kind === "subscription" ? (
        <SubscriptionBody {...order} />
      ) : (
        <ProductBody {...order} />
      )}
      <Hr style={s.divider} />
      {/* COPY: confirm met Marlon */}
      <Row label="Betaald" value={`${paidEuro} (waarvan ${paidVatEuro} btw, ${vatRateLabel})`} />
      {/* COPY: confirm met Marlon */}
      <Row label="Product" value={productName} />
      {/* COPY: confirm met Marlon */}
      <Text style={{ ...s.muted, margin: "28px 0 0 0" }}>
        Dit is een bevestiging van je betaling, geen factuur.
      </Text>
    </EmailLayout>
  );
}
