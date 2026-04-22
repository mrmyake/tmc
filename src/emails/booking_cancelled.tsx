import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

export interface BookingCancelledProps {
  firstName: string;
  className: string;
  whenLabel: string;
  withinWindow: boolean;
  lateMessage: string;
  siteUrl: string;
}

export default function BookingCancelled({
  firstName,
  className,
  whenLabel,
  withinWindow,
  lateMessage,
  siteUrl,
}: BookingCancelledProps) {
  return (
    <EmailLayout preview={`Geannuleerd: ${className} · ${whenLabel}`}>
      <Text
        style={{
          color: emailTokens.CHAMPAGNE,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          margin: "0 0 16px 0",
        }}
      >
        Annulering bevestigd
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
        Hé {firstName || "daar"}, je sessie staat niet meer.
      </Heading>

      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
        {className}, {whenLabel}.
      </Text>

      {withinWindow ? (
        <Text
          style={{
            color: emailTokens.STONE_500,
            fontSize: 13,
            margin: "0 0 28px 0",
          }}
        >
          Geannuleerd binnen het cancel-venster. Je credit staat weer op je
          account en je bent vrij om iets anders te boeken.
        </Text>
      ) : (
        <Text
          style={{
            color: emailTokens.STONE_500,
            fontSize: 13,
            margin: "0 0 28px 0",
          }}
        >
          {lateMessage}
        </Text>
      )}

      <Button
        href={`${siteUrl}/app/rooster`}
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
        Boek iets anders
      </Button>
    </EmailLayout>
  );
}
