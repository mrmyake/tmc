import { Button, Heading, Text } from "@react-email/components";
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
}

// COPY: confirm met Marlon
export default function InvoiceReady({
  firstName,
  invoiceNumber,
  amountEuro,
  isCreditNote,
  portalUrl,
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
        voor {amountEuro}. Je downloadt de PDF in je ledenomgeving, onder
        Facturen.
      </Text>
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
