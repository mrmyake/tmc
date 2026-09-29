import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

export interface SessionRescheduledProps {
  firstName: string;
  className: string;
  /** Bv. "donderdag 2 oktober · 18:30 - 19:30". */
  oldWhenLabel: string;
  newWhenLabel: string;
  siteUrl: string;
}

/**
 * Starttijd van een groepsles eenmalig verschoven door de studio
 * (spec-session-overrides.md). De boeking blijft staan; het lid mag tot de
 * nieuwe starttijd kosteloos annuleren, ook binnen het normale venster.
 */
export default function SessionRescheduled({
  firstName,
  className,
  oldWhenLabel,
  newWhenLabel,
  siteUrl,
}: SessionRescheduledProps) {
  return (
    // COPY: confirm met Marlon
    <EmailLayout preview={`${className} heeft een nieuwe tijd: ${newWhenLabel}`}>
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
        Nieuwe tijd
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
        Hé {firstName || "daar"}, je les schuift op.
      </Heading>

      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 12px 0" }}>
        {/* COPY: confirm met Marlon */}
        {className} begint op een ander tijdstip. Je plek blijft gewoon voor je
        gereserveerd.
      </Text>

      <Text style={{ color: emailTokens.STONE_500, margin: "0 0 4px 0", textDecoration: "line-through" }}>
        {/* COPY: confirm met Marlon */}
        Was: {oldWhenLabel}
      </Text>
      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
        {/* COPY: confirm met Marlon */}
        Nu: {newWhenLabel}
      </Text>

      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
        {/* COPY: confirm met Marlon */}
        Past de nieuwe tijd niet? Tot de nieuwe starttijd annuleer je kosteloos,
        ook als je al binnen het gewone annuleringsvenster zit. Je rit of plek
        in je abonnement krijg je dan terug.
      </Text>

      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 13,
          margin: "0 0 28px 0",
        }}
      >
        {/* COPY: confirm met Marlon */}
        Vragen? Stuur een appje of mail terug.
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
        {/* COPY: confirm met Marlon */}
        Bekijk je boekingen
      </Button>
    </EmailLayout>
  );
}
