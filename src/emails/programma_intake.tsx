import { Heading, Link, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

/**
 * Stafmail aan Marlon bij een nieuwe intake-aanvraag voor het 12 weken
 * programma. Reply-to is het adres van de aanvrager, zodat een antwoord direct
 * bij de aanvrager aankomt. Geen zichtbare URL: telefoon en e-mail zijn
 * tel:- en mailto:-tekstlinks, het dashboard een tekstlink
 * (scripts/programma-intake/email.test.mts bewaakt dat).
 */
export interface ProgrammaIntakeMailProps {
  firstName: string;
  lastName: string;
  /** E.164, zoals opgeslagen. */
  phone: string;
  email: string;
  /** Null verbergt de regel (kennismaking hormoonprofiel kent geen voorkeursdag). */
  preferredDay: string | null;
  message: string | null;
  submittedAtLabel: string;
  sourceLines: string[];
  dashboardUrl: string;
  /** Alleen buiten productie: het adres waar de mail normaal heen gaat. */
  originalRecipientLabel: string | null;
  /** Hergebruik voor de kennismaking hormoonprofiel; standaard de 12 weken-intake. */
  eyebrow?: string;
  previewSuffix?: string;
}

const row = { color: emailTokens.STONE_100, margin: "0 0 6px 0" } as const;
const linkStyle = { color: emailTokens.CHAMPAGNE, textDecoration: "underline" } as const;

export default function ProgrammaIntake({
  firstName,
  lastName,
  phone,
  email,
  preferredDay,
  message,
  submittedAtLabel,
  sourceLines,
  dashboardUrl,
  originalRecipientLabel,
  // COPY: confirm met Marlon
  eyebrow = "Intake-aanvraag 12 weken programma",
  // COPY: confirm met Marlon
  previewSuffix = "vraagt een intake aan voor het 12 weken programma",
}: ProgrammaIntakeMailProps) {
  const name = `${firstName} ${lastName}`.trim();
  return (
    <EmailLayout preview={`${name} ${previewSuffix}`}>
      <Text
        style={{
          color: emailTokens.CHAMPAGNE,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          margin: "0 0 16px 0",
        }}
      >
        {eyebrow}
      </Text>
      <Heading
        as="h1"
        style={{
          fontFamily: emailTokens.FONT_SERIF,
          fontWeight: 300,
          fontSize: 30,
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
          color: emailTokens.STONE_100,
          margin: "0 0 24px 0",
        }}
      >
        {name}
      </Heading>

      {originalRecipientLabel ? (
        <Text style={{ color: emailTokens.CHAMPAGNE, fontSize: 13, margin: "0 0 20px 0" }}>
          {/* COPY: confirm met Marlon */}
          Testomgeving. Oorspronkelijke ontvanger: {originalRecipientLabel}
        </Text>
      ) : null}

      <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0" }}>
        {/* COPY: confirm met Marlon */}
        Er is een nieuwe aanvraag binnengekomen. Antwoord op deze mail om direct te reageren.
      </Text>

      <Text style={row}>
        {/* COPY: confirm met Marlon */}
        Telefoon:{" "}
        <Link href={`tel:${phone}`} style={linkStyle}>
          {phone}
        </Link>
      </Text>
      <Text style={row}>
        {/* COPY: confirm met Marlon */}
        E-mail:{" "}
        <Link href={`mailto:${email}`} style={linkStyle}>
          {email}
        </Link>
      </Text>
      {preferredDay ? (
        <Text style={row}>
          {/* COPY: confirm met Marlon */}
          Voorkeursdag: {preferredDay}
        </Text>
      ) : null}
      <Text style={row}>
        {/* COPY: confirm met Marlon */}
        Aangevraagd: {submittedAtLabel}
      </Text>

      <Text style={{ color: emailTokens.STONE_100, margin: "18px 0 4px 0" }}>
        {/* COPY: confirm met Marlon */}
        Bericht:
      </Text>
      {message ? (
        <Text style={{ color: emailTokens.STONE_100, margin: "0 0 20px 0", whiteSpace: "pre-wrap" }}>
          {message}
        </Text>
      ) : (
        <Text style={{ color: emailTokens.STONE_500, margin: "0 0 20px 0" }}>
          {/* COPY: confirm met Marlon */}
          Geen bericht
        </Text>
      )}

      {sourceLines.length > 0 ? (
        <>
          <Text style={{ color: emailTokens.STONE_100, margin: "0 0 4px 0" }}>
            {/* COPY: confirm met Marlon */}
            Bron:
          </Text>
          {sourceLines.map((line) => (
            <Text key={line} style={{ ...row, fontSize: 13, color: emailTokens.STONE_500 }}>
              {line}
            </Text>
          ))}
        </>
      ) : null}

      <Text style={{ color: emailTokens.STONE_100, margin: "24px 0 0 0" }}>
        <Link href={dashboardUrl} style={linkStyle}>
          {/* COPY: confirm met Marlon */}
          Bekijk in dashboard
        </Link>
      </Text>
    </EmailLayout>
  );
}
