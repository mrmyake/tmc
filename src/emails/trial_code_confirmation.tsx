import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

export interface TrialCodeConfirmationProps {
  firstName: string;
  className: string;
  trainerName: string;
  whenLabel: string;
  cancelUrl: string;
  /** Uit tmc.booking_settings.cancellation_window_hours, geen hardcoded getal. */
  cancellationWindowHours: number;
  locationLabel?: string;
  /**
   * Bv. "€17,-". Alleen gezet voor een betaalde proefles (drop-in-tarief
   * via /proefles/boeken); een gratis proefles via code heeft geen
   * prijsregel. Al geformatteerd door de caller (formatPriceEuro), zelfde
   * conventie als amountEuro in payment_request.tsx.
   */
  priceLabel?: string | null;
}

/**
 * Bevestiging voor een proefles, twee gevallen op één template: gratis via
 * code (community-growth PR D) en betaald via /proefles/boeken (drop-in-
 * tarief, bevestigd op de Mollie-webhook). Het enige verschil is de
 * prijsregel (priceLabel: aanwezig bij betaald, weggelaten bij een code).
 * Zelfde vorm als guest_confirmation.tsx (account-loos), met daaraan
 * toegevoegd de annuleerlink op cancel_token — die bestaat bij
 * guest_confirmation niet (een gast wordt beheerd door het uitnodigende
 * lid), maar hier is de bezoeker zelf de enige beheerder van de boeking.
 */
export default function TrialCodeConfirmation({
  firstName,
  className,
  trainerName,
  whenLabel,
  cancelUrl,
  cancellationWindowHours,
  locationLabel = "Industrieweg 14P, Loosdrecht",
  priceLabel = null,
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

      {priceLabel && (
        <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
          Betaald: {priceLabel}.
        </Text>
      )}

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
          margin: "12px 0 0 0",
        }}
      >
        Annuleren kan tot {cancellationWindowHours} uur van tevoren via de
        link hierboven.
      </Text>

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
