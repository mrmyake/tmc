import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

export interface SessionCancelledByAdminProps {
  firstName: string;
  className: string;
  whenLabel: string;
  reason: string;
  creditRestored: boolean;
  siteUrl: string;
}

export default function SessionCancelledByAdmin({
  firstName,
  className,
  whenLabel,
  reason,
  creditRestored,
  siteUrl,
}: SessionCancelledByAdminProps) {
  return (
    <EmailLayout preview={`${className} op ${whenLabel} is geannuleerd`}>
      <Text
        style={{
          color: emailTokens.CHAMPAGNE,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          margin: "0 0 16px 0",
        }}
      >
        Sessie geannuleerd
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
        Hé {firstName || "daar"}, de sessie gaat niet door.
      </Heading>

      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
        We moeten {className} van {whenLabel} annuleren. Reden: {reason}.
      </Text>

      {creditRestored && (
        <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
          Je credit staat weer op je account. Boek gerust een andere sessie.
        </Text>
      )}

      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 13,
          margin: "0 0 28px 0",
        }}
      >
        Sorry voor het ongemak. Vragen? Stuur een appje of mail terug.
      </Text>

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
        Bekijk het rooster
      </Button>
    </EmailLayout>
  );
}
