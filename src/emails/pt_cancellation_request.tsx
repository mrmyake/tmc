import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

/**
 * Trainer-notificatie bij een nieuw annuleer-verzoek van een lid op een
 * PT-boeking (PT-agenda PR E2). Gaat naar de trainer van de sessie (via
 * trainers.profile_id), nooit hardcoded naar Marlon. Het verzoek muteert
 * de agenda niet; de sessie blijft staan tot de trainer beslist in het
 * admin-overzicht.
 */
export interface PtCancellationRequestProps {
  trainerName: string;
  memberLabel: string;
  sessionLabel: string;
  whenLabel: string;
  reason: string | null;
  siteUrl: string;
}

export default function PtCancellationRequest({
  trainerName,
  memberLabel,
  sessionLabel,
  whenLabel,
  reason,
  siteUrl,
}: PtCancellationRequestProps) {
  // COPY: confirm met Marlon
  const preview = `${memberLabel} vraagt een annulering aan`;

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
        {/* COPY: confirm met Marlon */}
        Annulering aangevraagd
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
        {memberLabel} vraagt of de {sessionLabel} van {whenLabel} geannuleerd
        kan worden.
      </Text>
      {reason && (
        <Text
          style={{
            color: emailTokens.STONE_100,
            fontSize: 15,
            lineHeight: 1.6,
            margin: "0 0 12px 0",
            fontStyle: "italic",
          }}
        >
          {/* COPY: confirm met Marlon */}
          Opgegeven reden: &ldquo;{reason}&rdquo;
        </Text>
      )}
      {/* COPY: confirm met Marlon */}
      <Text
        style={{
          color: emailTokens.STONE_100,
          fontSize: 15,
          lineHeight: 1.6,
          margin: "0 0 12px 0",
        }}
      >
        De sessie blijft gewoon in de agenda staan tot jij het verzoek
        afhandelt.
      </Text>
      <Button
        href={`${siteUrl}/app/admin/pauzes`}
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
        {/* COPY: confirm met Marlon */}
        Bekijk het verzoek
      </Button>
    </EmailLayout>
  );
}
