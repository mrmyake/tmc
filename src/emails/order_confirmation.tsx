import { Button, Heading, Hr, Section, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout, emailTokens } from "./_layout";

/**
 * Bevestiging na een geslaagde eerste betaling (abonnement) of
 * productbetaling (rittenkaart, PT, duo). Eén template, twee varianten,
 * gestuurd door `kind`. Alle bedragen en labels komen uit de order-rij en
 * tmc.catalogue (samengesteld in src/lib/orders/order-confirmation-core.ts);
 * deze component rekent en kiest niets zelf.
 *
 * Dit is een bevestiging, geen factuur: er staat bewust geen factuurnummer
 * in en de tekst zegt dat ook.
 */

interface CommonProps {
  firstName: string;
  /** display_name uit tmc.catalogue. */
  productName: string;
  /** Betaald bedrag, al geformatteerd ("€79,00"). */
  paidEuro: string;
  /** Btw-deel van het betaalde bedrag, al geformatteerd. */
  paidVatEuro: string;
  /** Btw-percentage als tekst ("9%"). */
  vatRateLabel: string;
  siteUrl: string;
}

export interface SubscriptionConfirmationProps extends CommonProps {
  kind: "subscription";
  /** Terugkerend bedrag, al geformatteerd. */
  recurringEuro: string;
  /** Btw-deel van het terugkerende bedrag, al geformatteerd. */
  recurringVatEuro: string;
  /** "per 4 weken", nooit "per maand"; afgeleid uit billing_cycle_weeks. */
  intervalLabel: string;
  /** Eerstvolgende incassodatum, al geformatteerd ("6 oktober 2026"). */
  nextChargeDate: string;
  /** Wat er met de inschrijfkosten is gebeurd. */
  signupFee:
    | { charged: true; amountEuro: string }
    | { charged: false; reasonLabel: string };
  /** Opzegtermijn, al geformatteerd ("4 weken" of "28 dagen"). */
  noticePeriodLabel: string;
}

export interface ProductConfirmationProps extends CommonProps {
  kind: "product";
  /** credits uit tmc.catalogue; null als de rij er geen heeft. */
  credits: number | null;
  /** validity_months uit tmc.catalogue; null als de rij er geen heeft. */
  validityMonths: number | null;
}

export type OrderConfirmationProps =
  | SubscriptionConfirmationProps
  | ProductConfirmationProps;

const eyebrow: React.CSSProperties = {
  color: emailTokens.CHAMPAGNE,
  fontSize: 11,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  margin: "0 0 16px 0",
};

const heading: React.CSSProperties = {
  fontFamily: emailTokens.FONT_SERIF,
  fontWeight: 300,
  fontSize: 34,
  lineHeight: 1.15,
  letterSpacing: "-0.02em",
  color: emailTokens.STONE_100,
  margin: "0 0 24px 0",
};

const body: React.CSSProperties = {
  color: emailTokens.STONE_100,
  margin: "0 0 20px 0",
};

const muted: React.CSSProperties = {
  color: emailTokens.STONE_500,
  fontSize: 13,
  margin: "0 0 12px 0",
};

const rowLabel: React.CSSProperties = {
  color: emailTokens.STONE_500,
  fontSize: 12,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  margin: "0 0 2px 0",
};

const rowValue: React.CSSProperties = {
  color: emailTokens.STONE_100,
  fontSize: 15,
  margin: "0 0 14px 0",
};

const divider: React.CSSProperties = {
  borderTop: `1px solid ${emailTokens.INK_700}`,
  borderBottom: "none",
  borderLeft: "none",
  borderRight: "none",
  margin: "24px 0",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <Text style={rowLabel}>{label}</Text>
      <Text style={rowValue}>{value}</Text>
    </>
  );
}

export default function OrderConfirmation(props: OrderConfirmationProps) {
  const { firstName, productName, paidEuro, paidVatEuro, vatRateLabel, siteUrl } =
    props;

  return (
    // COPY: confirm met Marlon
    <EmailLayout preview={`Je betaling van ${paidEuro} is ontvangen`}>
      {/* COPY: confirm met Marlon */}
      <Text style={eyebrow}>Bevestiging</Text>
      {/* COPY: confirm met Marlon */}
      <Heading as="h1" style={heading}>
        Hé {firstName || "daar"}, je betaling is binnen.
      </Heading>

      {props.kind === "subscription" ? (
        <SubscriptionBody {...props} />
      ) : (
        <ProductBody {...props} />
      )}

      <Hr style={divider} />

      {/* COPY: confirm met Marlon */}
      <Row label="Betaald" value={`${paidEuro} (waarvan ${paidVatEuro} btw, ${vatRateLabel})`} />
      {/* COPY: confirm met Marlon */}
      <Row label="Product" value={productName} />

      <Section style={{ paddingTop: 8 }}>
        <Button
          href={`${siteUrl}/app`}
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
          Naar je account
        </Button>
      </Section>

      {/* COPY: confirm met Marlon */}
      <Text style={{ ...muted, margin: "28px 0 0 0" }}>
        Dit is een bevestiging van je betaling, geen factuur.
      </Text>
    </EmailLayout>
  );
}

function SubscriptionBody({
  productName,
  recurringEuro,
  recurringVatEuro,
  intervalLabel,
  nextChargeDate,
  signupFee,
  noticePeriodLabel,
}: SubscriptionConfirmationProps) {
  return (
    <>
      {/* COPY: confirm met Marlon */}
      <Text style={body}>
        Welkom bij The Movement Club. Je abonnement {productName} is actief.
        Hieronder staat wat we hebben afgeschreven en wat je vanaf nu kunt
        verwachten.
      </Text>

      <Hr style={divider} />

      {/* COPY: confirm met Marlon */}
      <Row label="Terugkerend bedrag" value={`${recurringEuro} ${intervalLabel} (waarvan ${recurringVatEuro} btw)`} />
      {/* COPY: confirm met Marlon */}
      <Row label="Eerstvolgende incasso" value={nextChargeDate} />
      {/* COPY: confirm met Marlon */}
      <Row
        label="Inschrijfkosten"
        value={
          signupFee.charged
            ? `${signupFee.amountEuro}, eenmalig, zit in het betaalde bedrag`
            : `Niet in rekening gebracht (${signupFee.reasonLabel})`
        }
      />
      {/* COPY: confirm met Marlon */}
      <Row label="Opzegtermijn" value={noticePeriodLabel} />

      {/* COPY: confirm met Marlon */}
      <Text style={muted}>
        De incasso loopt automatisch via Mollie op de machtiging die je bij
        deze betaling hebt gegeven. Opzeggen of pauzeren regel je in je
        account.
      </Text>
    </>
  );
}

function ProductBody({ productName, credits, validityMonths }: ProductConfirmationProps) {
  const details = [
    // COPY: confirm met Marlon
    credits !== null ? (credits === 1 ? "1 rit" : `${credits} ritten`) : null,
    // COPY: confirm met Marlon
    validityMonths !== null ? `${validityMonths} maanden geldig` : null,
  ].filter((s): s is string => s !== null);

  return (
    <>
      {/* COPY: confirm met Marlon */}
      <Text style={body}>
        Je {productName} staat klaar in je account
        {details.length > 0 ? ` (${details.join(", ")})` : ""}.
      </Text>

      {/* COPY: confirm met Marlon */}
      <Text style={muted}>
        Dit was een eenmalige betaling. Er loopt geen doorlopende incasso en
        er is geen machtiging afgegeven.
      </Text>
    </>
  );
}
