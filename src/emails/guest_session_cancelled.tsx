import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

export interface GuestSessionCancelledProps {
  /** "guest": de gast zelf. "host": het lid dat de gast boekte. */
  recipient: "guest" | "host";
  /** Voornaam van de ontvanger (gastnaam bij recipient "guest"). */
  firstName: string;
  guestName: string;
  className: string;
  whenLabel: string;
  reason: string;
  siteUrl: string;
}

/**
 * Groepsles met een gastboeking geannuleerd door de studio
 * (spec-session-overrides.md). Twee varianten: de gast zelf krijgt bericht,
 * en het lid dat de gast boekte krijgt bericht plus de melding dat de
 * gastpas terug is.
 */
export default function GuestSessionCancelled({
  recipient,
  firstName,
  guestName,
  className,
  whenLabel,
  reason,
  siteUrl,
}: GuestSessionCancelledProps) {
  const isHost = recipient === "host";
  return (
    // COPY: confirm met Marlon
    <EmailLayout preview={`${className} op ${whenLabel} gaat niet door`}>
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
        Les geannuleerd
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
        Hé {firstName || "daar"}, de les gaat niet door.
      </Heading>

      {isHost ? (
        <>
          <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
            {/* COPY: confirm met Marlon */}
            We moeten {className} van {whenLabel} annuleren. Reden: {reason}. Je
            had {guestName} als gast meegenomen; die hebben we ook op de hoogte
            gebracht.
          </Text>
          <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
            {/* COPY: confirm met Marlon */}
            Je gastpas staat weer op je account. Nodig je gast gerust uit voor
            een andere les.
          </Text>
        </>
      ) : (
        <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
          {/* COPY: confirm met Marlon */}
          Je zou als gast meedoen aan {className} van {whenLabel}. Helaas moeten
          we die les annuleren. Reden: {reason}.
        </Text>
      )}

      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 13,
          margin: "0 0 28px 0",
        }}
      >
        {/* COPY: confirm met Marlon */}
        Sorry voor het ongemak. Vragen? Stuur een appje of mail terug.
      </Text>

      {isHost && (
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
          {/* COPY: confirm met Marlon */}
          Bekijk het rooster
        </Button>
      )}
    </EmailLayout>
  );
}
