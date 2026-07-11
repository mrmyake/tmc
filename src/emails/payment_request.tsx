import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

export interface PaymentRequestProps {
  firstName: string;
  /** Catalogusnaam van wat er gekocht wordt, bv. "All Inclusive 3x per week". */
  itemLabel: string;
  /** Eerste incasso, bv. "€148,-". */
  amountEuro: string;
  /** Terugkerend bedrag per 4 weken, alleen bij een abonnement. */
  recurringEuro?: string | null;
  payUrl: string;
  /** Bv. "18 juli 2026". */
  expiresAtLabel: string;
}

// COPY: confirm met Marlon
export default function PaymentRequest({
  firstName,
  itemLabel,
  amountEuro,
  recurringEuro,
  payUrl,
  expiresAtLabel,
}: PaymentRequestProps) {
  return (
    <EmailLayout preview={`Je betaalverzoek voor ${itemLabel} staat klaar`}>
      <Text
        style={{
          color: emailTokens.CHAMPAGNE,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          margin: "0 0 16px 0",
        }}
      >
        Betaalverzoek
      </Text>
      <Heading
        as="h1"
        style={{
          fontFamily: emailTokens.FONT_SERIF,
          fontWeight: 300,
          fontSize: 34,
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
          color: emailTokens.STONE_100,
          margin: "0 0 24px 0",
        }}
      >
        Hé {firstName || "daar"}, alles staat voor je klaar.
      </Heading>

      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
        Marlon heeft een betaalverzoek voor je klaargezet: {itemLabel} voor{" "}
        {amountEuro}.
      </Text>

      {recurringEuro ? (
        <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
          Daarna betaal je {recurringEuro} per 4 weken via automatische
          incasso. Met je eerste betaling geef je daarvoor toestemming
          (SEPA-machtiging).
        </Text>
      ) : null}

      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 13,
          margin: "0 0 28px 0",
        }}
      >
        Betalen gaat veilig via Mollie. Deze link is geldig tot{" "}
        {expiresAtLabel}.
      </Text>

      <Button
        href={payUrl}
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
        Bekijk en betaal
      </Button>
    </EmailLayout>
  );
}
