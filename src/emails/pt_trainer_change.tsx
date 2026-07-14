import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

/**
 * Trainer-notificatie bij een LID-geinitieerde wijziging van een
 * PT-boeking (annuleren of verzetten). Wordt nooit gestuurd voor
 * Marlon-eigen acties; de afzender-check zit in de server action
 * (PT-agenda C1).
 */
export interface PtTrainerChangeProps {
  trainerName: string;
  memberLabel: string;
  kind: "cancelled" | "rescheduled";
  whenLabel: string;
  newWhenLabel?: string;
  siteUrl: string;
}

export default function PtTrainerChange({
  trainerName,
  memberLabel,
  kind,
  whenLabel,
  newWhenLabel,
  siteUrl,
}: PtTrainerChangeProps) {
  // COPY: confirm met Marlon
  const title =
    kind === "cancelled" ? "PT-sessie geannuleerd" : "PT-sessie verzet";
  const preview = `${memberLabel} heeft een PT-sessie ${
    kind === "cancelled" ? "geannuleerd" : "verzet"
  }`;

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
        Agenda-update
      </Text>
      <Heading
        as="h1"
        style={{
          fontFamily: emailTokens.FONT_SERIF,
          fontWeight: 300,
          fontSize: 30,
          lineHeight: 1.15,
          color: emailTokens.STONE_100,
          margin: "0 0 20px 0",
        }}
      >
        {title}
      </Heading>
      <Text
        style={{
          color: emailTokens.STONE_100,
          fontSize: 15,
          lineHeight: 1.6,
          margin: "0 0 12px 0",
        }}
      >
        Hoi {trainerName},
      </Text>
      {/* COPY: confirm met Marlon */}
      <Text
        style={{
          color: emailTokens.STONE_100,
          fontSize: 15,
          lineHeight: 1.6,
          margin: "0 0 12px 0",
        }}
      >
        {kind === "cancelled"
          ? `${memberLabel} heeft de PT-sessie van ${whenLabel} geannuleerd.`
          : `${memberLabel} heeft de PT-sessie van ${whenLabel} verzet naar ${newWhenLabel}.`}
      </Text>
      <Button
        href={`${siteUrl}/app`}
        style={{
          backgroundColor: emailTokens.CHAMPAGNE,
          color: "#0B0B0B",
          fontSize: 14,
          padding: "12px 24px",
          borderRadius: 0,
          textDecoration: "none",
          display: "inline-block",
          marginTop: 8,
        }}
      >
        Open de app
      </Button>
    </EmailLayout>
  );
}
