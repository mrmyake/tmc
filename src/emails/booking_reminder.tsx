import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

export interface BookingReminderProps {
  firstName: string;
  className: string;
  trainerName: string;
  whenLabel: string;
  locationLabel?: string;
  siteUrl: string;
}

export default function BookingReminder({
  firstName,
  className,
  trainerName,
  whenLabel,
  locationLabel = "Industrieweg 14P, Loosdrecht",
  siteUrl,
}: BookingReminderProps) {
  return (
    <EmailLayout preview={`Morgen: ${className} · ${whenLabel}`}>
      <Text
        style={{
          color: emailTokens.CHAMPAGNE,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          margin: "0 0 16px 0",
        }}
      >
        Morgen op het rooster
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
        Tot morgen, {firstName || "daar"}.
      </Heading>

      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 24px 0" }}>
        {className} met {trainerName}, {whenLabel}.
      </Text>

      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 13,
          margin: "0 0 28px 0",
        }}
      >
        Kom tien minuten eerder zodat je rustig kunt omkleden. Annuleren kan
        nu nog via de app zonder dat de sessie meetelt.
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
        Open je boekingen
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
