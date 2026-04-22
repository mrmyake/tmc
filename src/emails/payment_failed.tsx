import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

export interface PaymentFailedProps {
  firstName: string;
  amountEuro: string; // "€69,00"
  planLabel: string;
  siteUrl: string;
}

export default function PaymentFailed({
  firstName,
  amountEuro,
  planLabel,
  siteUrl,
}: PaymentFailedProps) {
  return (
    <EmailLayout preview={`Je betaling ${amountEuro} is niet gelukt`}>
      <Text
        style={{
          color: emailTokens.CHAMPAGNE,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          margin: "0 0 16px 0",
        }}
      >
        Betaling
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
        Hé {firstName || "daar"}, de incasso is niet gelukt.
      </Heading>

      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
        We probeerden {amountEuro} af te schrijven voor je {planLabel}, maar
        dat lukte niet. Mollie probeert het de komende dagen automatisch nog
        een paar keer.
      </Text>

      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 13,
          margin: "0 0 28px 0",
        }}
      >
        Check of je saldo klopt, of werk je betaalmethode bij. Zolang de
        incasso openstaat kunnen we je sessies niet boeken.
      </Text>

      <Button
        href={`${siteUrl}/app/facturen`}
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
        Bekijk je facturen
      </Button>
    </EmailLayout>
  );
}
