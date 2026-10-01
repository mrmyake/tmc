import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";
import { bookingInstructionText } from "@/lib/member/booking-instruction";

export interface BookingConfirmationProps {
  firstName: string;
  className: string;
  trainerName: string;
  whenLabel: string; // "woensdag 23 april · 06:30 – 07:30"
  locationLabel?: string;
  siteUrl: string;
  /** class_sessions.pillar; bepaalt welke instructietekst getoond wordt. */
  pillar?: string | null;
}

export default function BookingConfirmation({
  firstName,
  className,
  trainerName,
  whenLabel,
  locationLabel = "Industrieweg 14P, Loosdrecht",
  siteUrl,
  pillar,
}: BookingConfirmationProps) {
  return (
    <EmailLayout preview={`Je sessie staat: ${className} · ${whenLabel}`}>
      <Text
        style={{
          color: emailTokens.CHAMPAGNE,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          margin: "0 0 16px 0",
        }}
      >
        Bevestigd
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
        Hé {firstName || "daar"}, je sessie staat.
      </Heading>

      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 28px 0" }}>
        {className} met {trainerName}, {whenLabel}.
      </Text>

      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 13,
          margin: "0 0 28px 0",
        }}
      >
        {bookingInstructionText(pillar)}
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
        Open je rooster
      </Button>

      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 12,
          margin: "28px 0 0 0",
        }}
      >
        {locationLabel}
      </Text>
    </EmailLayout>
  );
}
