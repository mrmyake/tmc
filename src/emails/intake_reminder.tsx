import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

/**
 * 24-uurs reminder naar de prospect voor een geplande intake (PT-agenda
 * PR K, via de send-reminders-cron met de stempel op
 * pt_sessions.reminder_sent_at). Account-loos en gratis: geen app-link,
 * geen prijs- of credit-taal.
 */
export interface IntakeReminderProps {
  prospectName: string;
  trainerName: string;
  whenLabel: string;
  locationLabel: string;
  siteUrl: string;
}

export default function IntakeReminder({
  prospectName,
  trainerName,
  whenLabel,
  locationLabel,
  siteUrl,
}: IntakeReminderProps) {
  // COPY: confirm met Marlon
  const preview = `Morgen: je intake · ${whenLabel}`;

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
        Morgen op de agenda
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
        Tot morgen, {prospectName || "welkom"}.
      </Heading>
      {/* COPY: confirm met Marlon */}
      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 24px 0" }}>
        Je intake met {trainerName} staat gepland: {whenLabel}.
      </Text>
      {/* COPY: confirm met Marlon */}
      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 13,
          margin: "0 0 28px 0",
        }}
      >
        {locationLabel}. Lukt het toch niet? Laat het even weten via de
        contactpagina, dan plannen we een nieuw moment.
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
        Naar de contactpagina
      </Button>
    </EmailLayout>
  );
}
