import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

/**
 * Bevestiging naar de prospect zodra staf een intake inplant (PT-agenda
 * PR K). Een intake is account-loos en gratis: geen app-link, geen
 * prijs- of credit-taal; alleen wie, wanneer, hoe lang en waar, met een
 * routeknop naar de contactpagina.
 */
export interface IntakeConfirmationProps {
  prospectName: string;
  trainerName: string;
  whenLabel: string;
  durationLabel: string;
  locationLabel: string;
  siteUrl: string;
}

export default function IntakeConfirmation({
  prospectName,
  trainerName,
  whenLabel,
  durationLabel,
  locationLabel,
  siteUrl,
}: IntakeConfirmationProps) {
  // COPY: confirm met Marlon
  const preview = `Je intake staat gepland · ${whenLabel}`;

  return (
    <EmailLayout preview={preview}>
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
        Je kennismaking
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
        Je intake staat gepland, {prospectName || "welkom"}.
      </Heading>
      {/* COPY: confirm met Marlon */}
      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 12px 0" }}>
        We zien je {whenLabel} bij The Movement Club. Je hebt een intake met{" "}
        {trainerName}; reken op ongeveer {durationLabel}.
      </Text>
      {/* COPY: confirm met Marlon */}
      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 13,
          margin: "0 0 28px 0",
        }}
      >
        {locationLabel}. Kom in makkelijk zittende sportkleding; verder heb je
        niets nodig.
      </Text>
      <Button
        href={`${siteUrl}/contact`}
        style={{
          backgroundColor: emailTokens.CHAMPAGNE,
          color: "#0B0B0B",
          fontSize: 14,
          padding: "12px 24px",
          borderRadius: 0,
          textDecoration: "none",
          display: "inline-block",
        }}
      >
        {/* COPY: confirm met Marlon */}
        Bekijk de route
      </Button>
    </EmailLayout>
  );
}
