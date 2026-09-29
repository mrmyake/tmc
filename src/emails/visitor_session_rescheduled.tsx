import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

export type VisitorSessionRescheduledProps =
  | {
      /** Proefles-bezoeker; "paid" met terugbetaling, "code" gratis via proefcode. */
      recipient: "trial";
      trialKind: "paid" | "code";
      firstName: string;
      className: string;
      oldWhenLabel: string;
      newWhenLabel: string;
      /** /proefles/annuleren/<cancel_token> */
      cancelUrl: string;
    }
  | {
      /** Gast van een lid (geen account, geen annuleerpad). */
      recipient: "guest";
      firstName: string;
      /**
       * Alleen de voornaam van het lid dat de gast uitnodigde, of een
       * omschrijving als die ontbreekt ("het lid dat je uitnodigde").
       */
      hostFirstName: string;
      className: string;
      oldWhenLabel: string;
      newWhenLabel: string;
    };

/**
 * Tijdwijziging van een groepsles voor bezoekers zonder account
 * (spec-session-overrides.md): betaalde proefles, proefles via code en gast.
 * Leden krijgen session_rescheduled.tsx. Verzonden met reply-to op de inbox
 * van Marlon, zodat "antwoord op deze mail" ergens aankomt.
 */
export default function VisitorSessionRescheduled(props: VisitorSessionRescheduledProps) {
  const { firstName, className, oldWhenLabel, newWhenLabel } = props;
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
        {props.recipient === "trial" ? (
          <>
            {/* COPY: confirm met Marlon */}
            {className} begint op een ander tijdstip. Je proefles blijft gewoon
            staan.
          </>
        ) : (
          <>
            {/* COPY: confirm met Marlon */}
            {className}, waarvoor je bent uitgenodigd, begint op een ander
            tijdstip. Je plek blijft gewoon staan.
          </>
        )}
      </Text>

      <Text style={{ color: emailTokens.STONE_500, margin: "0 0 4px 0", textDecoration: "line-through" }}>
        {/* COPY: confirm met Marlon */}
        Was: {oldWhenLabel}
      </Text>
      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
        {/* COPY: confirm met Marlon */}
        Nu: {newWhenLabel}
      </Text>

      {props.recipient === "trial" ? (
        <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
          {props.trialKind === "paid" ? (
            <>
              {/* COPY: confirm met Marlon */}
              Past de nieuwe tijd niet? Tot de nieuwe starttijd annuleer je
              kosteloos, ook als je al binnen het gewone annuleringsvenster zit.
              Je krijgt dan het volledige bedrag terug.
            </>
          ) : (
            <>
              {/* COPY: confirm met Marlon */}
              Past de nieuwe tijd niet? Tot de nieuwe starttijd annuleer je
              kosteloos. Omdat je met een proefcode boekte, is er niets terug te
              betalen.
            </>
          )}
        </Text>
      ) : (
        <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
          {/* COPY: confirm met Marlon */}
          Past de nieuwe tijd niet? Laat het weten aan {props.hostFirstName},
          of antwoord op deze mail.
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
        Vragen? Antwoord gerust op deze mail.
      </Text>

      {props.recipient === "trial" && (
        <Button
          href={props.cancelUrl}
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
          Proefles annuleren
        </Button>
      )}
    </EmailLayout>
  );
}
