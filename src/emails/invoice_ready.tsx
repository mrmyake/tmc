import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

export interface InvoiceReadyProps {
  firstName: string;
  /** Bv. "2026.001". */
  invoiceNumber: string;
  /** Bv. "€149,-". */
  amountEuro: string;
  /** Of dit een creditnota is (andere aanhef en knoptekst-context). */
  isCreditNote: boolean;
  /** Link naar /app/facturen, waar de download achter de signed URL zit.
   * Bewust geen bijlage (spec-facturatie.md 5.5): de PDF staat al in de
   * portal, en bijlagen drukken de deliverability. */
  portalUrl: string;
  /** Overmaakgegevens; alleen getoond bij een factuur, niet bij een creditnota. */
  payment?: {
    /** Gegroepeerd, bv. "NL36 RABO 0175 6438 06". */
    iban: string;
    accountHolder: string;
    /** Kenmerk, het factuurnummer. */
    reference: string;
    /** Uiterste betaaldatum, bv. "17-11-2026". */
    dueDate: string;
  };
}

// COPY: confirm met Marlon
export default function InvoiceReady({
  firstName,
  invoiceNumber,
  amountEuro,
  isCreditNote,
  portalUrl,
  payment,
}: InvoiceReadyProps) {
  const noun = isCreditNote ? "creditnota" : "factuur";
  return (
    <EmailLayout preview={`Je ${noun} ${invoiceNumber} staat klaar`}>
      <Text
        style={{
          color: emailTokens.CHAMPAGNE,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          margin: "0 0 16px 0",
        }}
      >
        {isCreditNote ? "Creditnota" : "Factuur"}
      </Text>
      <Heading
        style={{
          color: emailTokens.STONE_100,
          fontSize: 26,
          fontWeight: 500,
          lineHeight: 1.15,
          margin: "0 0 20px 0",
        }}
      >
        Je {noun} staat klaar.
      </Heading>
      <Text style={{ color: emailTokens.STONE_500, fontSize: 15, lineHeight: 1.6 }}>
        Hi {firstName}, {isCreditNote ? "we hebben een creditnota voor je aangemaakt" : "je factuur is klaar"}:{" "}
        <strong style={{ color: emailTokens.STONE_100 }}>{invoiceNumber}</strong>{" "}
        voor {amountEuro}. De PDF zit als bijlage bij deze mail. Je vindt hem
        ook in je ledenomgeving, onder Facturen.
      </Text>
      {payment && !isCreditNote && (
        <Section
          style={{
            border: `1px solid ${emailTokens.CHAMPAGNE}`,
            padding: "14px 18px",
            margin: "20px 0 4px 0",
          }}
        >
          <Text
            style={{
              color: emailTokens.CHAMPAGNE,
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              margin: "0 0 8px 0",
            }}
          >
            Zelf overmaken
          </Text>
          <Text style={{ color: emailTokens.STONE_500, fontSize: 14, lineHeight: 1.7, margin: 0 }}>
            IBAN:{" "}
            <strong style={{ color: emailTokens.STONE_100 }}>{payment.iban}</strong>
            <br />
            T.n.v.:{" "}
            <strong style={{ color: emailTokens.STONE_100 }}>{payment.accountHolder}</strong>
            <br />
            Kenmerk:{" "}
            <strong style={{ color: emailTokens.STONE_100 }}>{payment.reference}</strong>
            <br />
            Uiterlijk:{" "}
            <strong style={{ color: emailTokens.STONE_100 }}>{payment.dueDate}</strong>
          </Text>
        </Section>
      )}
      <Button
        href={portalUrl}
        style={{
          backgroundColor: emailTokens.CHAMPAGNE,
          color: emailTokens.INK_900,
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          padding: "14px 28px",
          margin: "24px 0 8px 0",
        }}
      >
        Bekijk je {noun}
      </Button>
      <Text style={{ color: emailTokens.STONE_500, fontSize: 13, lineHeight: 1.6 }}>
        Vragen over deze {noun}? Beantwoord deze mail en we kijken ernaar.
      </Text>
    </EmailLayout>
  );
}
