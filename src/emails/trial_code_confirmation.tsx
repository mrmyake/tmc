import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

export interface TrialCodeConfirmationProps {
  firstName: string;
  className: string;
  trainerName: string;
  whenLabel: string;
  cancelUrl: string;
  locationLabel?: string;
}

/**
 * Bevestiging voor een gratis proefles via code (community-growth PR D).
 * Zelfde vorm als guest_confirmation.tsx (account-loos, geen prijs), met
 * daaraan toegevoegd de annuleerlink op cancel_token — die bestaat bij
 * guest_confirmation niet (een gast wordt beheerd door het uitnodigende
 * lid), maar hier is de bezoeker zelf de enige beheerder van de boeking.
 */
export default function TrialCodeConfirmation({
  firstName,
  className,
  trainerName,
  whenLabel,
  cancelUrl,
  locationLabel = "Industrieweg 14P, Loosdrecht",
}: TrialCodeConfirmationProps) {
  return (
    <EmailLayout preview={`Je proefles staat vast: ${className} · ${whenLabel}`}>
      <Text
        style={{
          color: emailTokens.CHAMPAGNE,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          margin: "0 0 16px 0",
        }}
      >
        Proefles bevestigd
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
        Hé {firstName || "daar"}, tot dan.
      </Heading>

      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
        Je proefles staat gepland: {className} met {trainerName}, {whenLabel}.
      </Text>

      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 13,
          margin: "0 0 28px 0",
        }}
      >
        Kom tien minuten eerder zodat je rustig kunt omkleden. Voor yoga of
        mobility-sessies is er mat en handdoek te huren aan de balie.
      </Text>

      <Button
        href={cancelUrl}
        style={{
          backgroundColor: "transparent",
          color: emailTokens.CHAMPAGNE,
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          padding: "14px 0",
          textDecoration: "underline",
        }}
      >
        Annuleer je proefles
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

      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 13,
          margin: "40px 0 0 0",
          lineHeight: 1.6,
        }}
      >
        Beviel het na afloop? Bekijk wat een lidmaatschap voor je kan zijn.
      </Text>
    </EmailLayout>
  );
}
