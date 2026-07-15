import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

/**
 * Uitkomst-mail naar het lid nadat staf een annuleer-verzoek op een
 * PT-boeking heeft afgehandeld (PT-agenda PR E2). Drie varianten:
 * goedgekeurd met restitutie (credit terug), goedgekeurd zonder
 * restitutie (geen credit terug), of afgewezen (sessie blijft staan),
 * met de optionele toelichting van staf.
 */
export type PtCancellationOutcomeVariant =
  | "approved_refund"
  | "approved_no_refund"
  | "rejected";

export interface PtCancellationOutcomeProps {
  firstName: string;
  variant: PtCancellationOutcomeVariant;
  sessionLabel: string;
  whenLabel: string;
  /** "PT-credit" of "duo-credit"; alleen relevant bij approved_refund. */
  creditLabel: string;
  note: string | null;
  siteUrl: string;
}

export default function PtCancellationOutcome({
  firstName,
  variant,
  sessionLabel,
  whenLabel,
  creditLabel,
  note,
  siteUrl,
}: PtCancellationOutcomeProps) {
  // COPY: confirm met Marlon
  const title =
    variant === "rejected"
      ? "Je annuleringsverzoek is afgewezen"
      : "Je sessie is geannuleerd";
  // COPY: confirm met Marlon
  const body =
    variant === "approved_refund"
      ? `Je ${sessionLabel} van ${whenLabel} is geannuleerd. Je ${creditLabel} is teruggezet op je tegoed.`
      : variant === "approved_no_refund"
        ? `Je ${sessionLabel} van ${whenLabel} is geannuleerd. Er gaat geen credit terug.`
        : `Je verzoek om de ${sessionLabel} van ${whenLabel} te annuleren is afgewezen. De sessie staat nog gewoon gepland; we rekenen op je.`;

  return (
    <EmailLayout preview={title}>
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
        Jouw aanvraag
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
        Hoi {firstName},
      </Text>
      <Text
        style={{
          color: emailTokens.STONE_100,
          fontSize: 15,
          lineHeight: 1.6,
          margin: "0 0 12px 0",
        }}
      >
        {body}
      </Text>
      {note && (
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
          Toelichting: &ldquo;{note}&rdquo;
        </Text>
      )}
      <Button
        href={`${siteUrl}/app/boekingen`}
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
        Bekijk je boekingen
      </Button>
    </EmailLayout>
  );
}
