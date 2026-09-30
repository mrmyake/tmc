import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

export interface WaitlistPromotedProps {
  firstName: string;
  className: string;
  whenLabel: string;
  /** "voor 18:25" of "voor morgen 07:30" (confirmDeadlineLabel). */
  deadlineLabel: string;
  siteUrl: string;
}

export default function WaitlistPromoted({
  firstName,
  className,
  whenLabel,
  deadlineLabel,
  siteUrl,
}: WaitlistPromotedProps) {
  return (
    <EmailLayout preview={`Er is een plek vrij voor ${className}`}>
      <Text
        style={{
          color: emailTokens.CHAMPAGNE,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          margin: "0 0 16px 0",
        }}
      >
        Wachtlijst
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
        {/* COPY: confirm met Marlon */}
        Hé {firstName || "daar"}, er is een plek vrij.
      </Heading>

      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
        {/* COPY: confirm met Marlon */}
        {className}, {whenLabel}. De plek is voor jou gereserveerd.
      </Text>

      <Text
        style={{
          color: emailTokens.STONE_100,
          margin: "0 0 28px 0",
          fontWeight: 500,
        }}
      >
        {/* COPY: confirm met Marlon */}
        Bevestig {deadlineLabel}, anders gaat de plek door naar de volgende.
      </Text>

      <Button
        href={`${siteUrl}/app/boekingen`}
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
        Bevestig de plek
      </Button>
    </EmailLayout>
  );
}
