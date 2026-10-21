import { Heading, Link, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";
import type { LastMinuteMailProps } from "@/lib/alerts/last-minute-core";

/**
 * Stafmail aan de trainer van een groepsles (spec-last-minute-alerts.md):
 * iemand heeft zich minder dan drie uur voor de start definitief
 * ingeschreven. Ontvanger is de trainer van de sessie, anders de head
 * trainer of een admin; buiten productie het omleidingsadres, dan met de
 * oorspronkelijke ontvanger als regel. Bevat een naam en gaat daarom per
 * mail, niet via het openbare ntfy-topic. Geen zichtbare URL: de
 * deelnemerslijst is een tekstlink (assertLinkRule in de tests).
 */
export type LastMinuteBookingProps = LastMinuteMailProps;

export default function LastMinuteBooking({
  recipientFirstName,
  className,
  whenLabel,
  participantName,
  kindLabel,
  totalParticipants,
  participantsUrl,
  originalRecipientLabel,
}: LastMinuteBookingProps) {
  const greeting = recipientFirstName.trim();
  return (
    // COPY: confirm met Marlon
    <EmailLayout preview={`${participantName} doet mee met ${className}, ${whenLabel}`}>
      <Text
        style={{
          color: emailTokens.CHAMPAGNE,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          margin: "0 0 16px 0",
        }}
      >
        {/* COPY: confirm met Marlon */}
        Last minute inschrijving
      </Text>
      <Heading
        as="h1"
        style={{
          fontFamily: emailTokens.FONT_SERIF,
          fontWeight: 300,
          fontSize: 30,
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
          color: emailTokens.STONE_100,
          margin: "0 0 24px 0",
        }}
      >
        {/* COPY: confirm met Marlon */}
        {className}, {whenLabel}
      </Heading>

      {originalRecipientLabel ? (
        <Text
          style={{
            color: emailTokens.CHAMPAGNE,
            fontSize: 13,
            margin: "0 0 20px 0",
          }}
        >
          {/* COPY: confirm met Marlon */}
          Testomgeving. Oorspronkelijke ontvanger: {originalRecipientLabel}
        </Text>
      ) : null}

      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
        {/* COPY: confirm met Marlon */}
        {greeting ? `Hoi ${greeting},` : "Hoi,"}
      </Text>

      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
        {/* COPY: confirm met Marlon */}
        {participantName} heeft zich zojuist ingeschreven voor {className} van {whenLabel}.
        Dat is binnen drie uur voor de start, daarom deze melding.
      </Text>

      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 4px 0" }}>
        {/* COPY: confirm met Marlon */}
        Deelnemer: {participantName}
      </Text>
      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 4px 0" }}>
        {/* COPY: confirm met Marlon */}
        Soort: {kindLabel}
      </Text>
      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 24px 0" }}>
        {/* COPY: confirm met Marlon */}
        Totaal ingeschreven: {totalParticipants} (inclusief proeflessen en gasten)
      </Text>

      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 8px 0" }}>
        <Link
          href={participantsUrl}
          style={{ color: emailTokens.CHAMPAGNE, textDecoration: "underline" }}
        >
          {/* COPY: confirm met Marlon */}
          Bekijk de deelnemerslijst
        </Link>
      </Text>

      <Text style={{ color: emailTokens.STONE_500, fontSize: 12, margin: "28px 0 0 0" }}>
        {/* COPY: confirm met Marlon */}
        Je krijgt deze mail bij elke inschrijving binnen drie uur voor de start van een van je lessen.
      </Text>
    </EmailLayout>
  );
}
