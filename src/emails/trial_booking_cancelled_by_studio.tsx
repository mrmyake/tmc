import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

export interface TrialBookingCancelledByStudioProps {
  firstName: string;
  className: string;
  whenLabel: string;
  reason: string;
  /** Bv. "17,00". Alleen bij een betaalde proefles; null bij een codeboeking. */
  refundAmountLabel: string | null;
  /** True als de proefcode na deze annulering weer bruikbaar is. */
  codeReusable: boolean;
  siteUrl: string;
}

/**
 * Annulering van een proefles door de studio (losse annulering of hele
 * sessie), spec-community-growth.md §1 "Annulering door de studio". Zelfde
 * vorm als session_cancelled_by_admin.tsx voor leden, met in plaats van de
 * credit-regel een terugbetalingsregel (betaald) of een code-regel (gratis).
 * De terugbetalingsregel noemt bewust geen termijn.
 */
export default function TrialBookingCancelledByStudio({
  firstName,
  className,
  whenLabel,
  reason,
  refundAmountLabel,
  codeReusable,
  siteUrl,
}: TrialBookingCancelledByStudioProps) {
  return (
    // COPY: confirm met Marlon
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
        {/* COPY: confirm met Marlon */}
        Proefles geannuleerd
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
        Hé {firstName || "daar"}, je proefles gaat niet door.
      </Heading>

      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
        {/* COPY: confirm met Marlon */}
        We moeten je proefles {className} van {whenLabel} annuleren. Reden: {reason}.
      </Text>

      {refundAmountLabel && (
        <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
          {/* COPY: confirm met Marlon */}
          Je betaling van {refundAmountLabel} euro storten we volledig terug op
          de rekening waarmee je hebt betaald. Je hoeft daar niets voor te doen.
        </Text>
      )}

      {codeReusable && (
        <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
          {/* COPY: confirm met Marlon */}
          Je proefcode is weer te gebruiken voor een andere les.
        </Text>
      )}

      <Text
        style={{
          color: emailTokens.STONE_500,
          fontSize: 13,
          margin: "0 0 28px 0",
          lineHeight: 1.6,
        }}
      >
        {/* COPY: confirm met Marlon */}
        Wil je een andere sessie proberen? Kies een nieuwe datum op{" "}
        {siteUrl}/proefles/boeken. Vragen? Antwoord gerust op deze mail.
      </Text>
    </EmailLayout>
  );
}
