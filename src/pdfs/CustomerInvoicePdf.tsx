import path from "node:path";
import {
  Document,
  Font,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import * as React from "react";
import { formatEuroCentsSigned } from "@/lib/format";
import { formatNlDate } from "@/lib/invoice-terms";

/**
 * De verkoopfactuur (spec-facturatie.md 5.2), gebouwd op het bewezen
 * react-pdf-skelet van TrainerInvoicePdf maar met alles wat 1.3 wettelijk
 * eist en de trainer-declaratie niet heeft: KvK- en BTW-nummer van TMC,
 * afnemer-NAW plus diens BTW-nummer waar zakelijk, per regel het tarief,
 * en het BTW-totaal per tarief. Alle bedragen komen bevroren uit
 * tmc.invoices/invoice_lines; hier wordt niets herrekend behalve de
 * groepering per tarief (som van bevroren regelbedragen, 3.4).
 *
 * De creditnota is hetzelfde document met een andere kop en de verwijzing
 * naar het gecrediteerde nummer (4.6); de bedragen zijn dan negatief en
 * worden als negatief getoond, niet gemaskeerd. Een creditnota heeft geen
 * vervaldatum en geen betaalblok.
 *
 * De vervaldatum en de overmaakgegevens komen als gegevens binnen
 * (`dueDate`, `payment`); de PDF rekent niets uit. Bestaande PDF's zijn
 * write-once en houden hun oude opmaak; dit sjabloon geldt alleen voor
 * PDF's die na deze versie worden gegenereerd.
 */

const COLORS = {
  ink: "#0E0C0B",
  stone: "#F5F0E6",
  muted: "#766D60",
  champagne: "#B9986A",
  line: "#D5CEC0",
};

// Fraunces (display) en Inter (tekst) als statische WOFF van schijf. Het pad
// loopt vanaf de projectroot; outputFileTracingIncludes in next.config.ts
// neemt de map mee in de serverless bundel. Zie src/pdfs/fonts/README.md.
const FONT_DIR = path.join(process.cwd(), "src", "pdfs", "fonts");
Font.register({
  family: "Fraunces",
  fonts: [
    { src: path.join(FONT_DIR, "fraunces-latin-400-normal.woff"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "fraunces-latin-500-normal.woff"), fontWeight: 500 },
  ],
});
Font.register({
  family: "Inter",
  fonts: [
    { src: path.join(FONT_DIR, "inter-latin-400-normal.woff"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "inter-latin-500-normal.woff"), fontWeight: 500 },
    { src: path.join(FONT_DIR, "inter-latin-600-normal.woff"), fontWeight: 600 },
  ],
});
// Geen afbrekende koppeltekens in omschrijvingen of adressen.
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 72,
    paddingHorizontal: 56,
    fontSize: 9.5,
    fontFamily: "Inter",
    fontWeight: 400,
    color: COLORS.ink,
    backgroundColor: COLORS.stone,
  },
  header: {
    marginBottom: 30,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.champagne,
    borderBottomStyle: "solid",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  brand: { fontFamily: "Fraunces", fontWeight: 500, fontSize: 16, marginBottom: 3 },
  tagline: { fontSize: 8, color: COLORS.muted, letterSpacing: 0.4 },
  docTitle: { fontFamily: "Fraunces", fontWeight: 400, fontSize: 30, lineHeight: 1 },
  creditRef: { fontSize: 8, color: COLORS.muted, marginTop: 4 },
  gridTwo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 28,
    gap: 24,
  },
  block: { flexDirection: "column", gap: 2.5, flex: 1 },
  metaBlock: { flexDirection: "column", gap: 8, width: 190 },
  label: {
    fontSize: 7.5,
    fontWeight: 500,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  value: { fontSize: 10, color: COLORS.ink },
  valueStrong: { fontSize: 10, fontWeight: 500, color: COLORS.ink },
  small: { fontSize: 9, color: COLORS.muted },
  metaRow: { flexDirection: "row", justifyContent: "space-between" },
  metaLabel: { fontSize: 9, color: COLORS.muted },
  metaValue: { fontSize: 9.5, fontWeight: 500 },
  tableHeader: {
    flexDirection: "row",
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    borderBottomStyle: "solid",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    borderBottomStyle: "solid",
  },
  colDesc: { flex: 1, fontSize: 9 },
  colQty: { width: 40, textAlign: "right", fontSize: 9 },
  colNet: { width: 78, textAlign: "right", fontSize: 9 },
  colRate: { width: 45, textAlign: "right", fontSize: 9 },
  colGross: { width: 82, textAlign: "right", fontSize: 9 },
  totalsWrap: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 14,
  },
  totalsTable: { width: 250 },
  totalsLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalsRule: {
    marginTop: 6,
    borderTopWidth: 0.75,
    borderTopColor: COLORS.ink,
    borderTopStyle: "solid",
    paddingTop: 7,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  totalLabel: { fontSize: 11, fontWeight: 500 },
  totalValue: { fontSize: 13, fontWeight: 600 },
  payWrap: { marginTop: 30 },
  payRow: { flexDirection: "row", gap: 16 },
  payBox: {
    flex: 1,
    borderWidth: 0.75,
    borderColor: COLORS.line,
    borderStyle: "solid",
    padding: 12,
    gap: 4,
  },
  payBoxTitle: { fontFamily: "Fraunces", fontWeight: 500, fontSize: 11, marginBottom: 4 },
  payLine: { flexDirection: "row" },
  payKey: { width: 62, fontSize: 9, color: COLORS.muted },
  payVal: { flex: 1, fontSize: 9.5, fontWeight: 500 },
  // Ruimte voor een tweede kader ("Direct online"), dat in een latere PR
  // komt. Geen rand en geen tekst, dus niets leegs op papier.
  payReserved: { flex: 1 },
  contact: { marginTop: 22, fontSize: 9, color: COLORS.muted },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 56,
    right: 56,
    fontSize: 7.5,
    color: COLORS.muted,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    borderTopStyle: "solid",
    paddingTop: 8,
  },
});

export interface CustomerInvoiceLine {
  description: string;
  quantity: number;
  netCents: number;
  vatRateBp: number;
  grossCents: number;
}

export interface CustomerInvoiceData {
  invoiceNumber: string;
  issuedAt: string; // yyyy-mm-dd
  /** yyyy-mm-dd, berekend bij het renderen; null bij een creditnota. */
  dueDate: string | null;
  isCreditNote: boolean;
  /** Nummer van de gecrediteerde factuur; alleen bij een creditnota. */
  creditOfInvoiceNumber: string | null;

  // Afnemer, bevroren uit de factuurrij (1.3)
  billToName: string;
  billToCompany: string | null;
  billToVatNumber: string | null;
  billToStreet: string | null;
  billToPostalCode: string | null;
  billToCity: string | null;
  billToCountry: string | null;

  lines: CustomerInvoiceLine[];
  subtotalNetCents: number;
  /** BTW per tarief, som over de bevroren regels (3.4). */
  vatByRate: { rateBp: number; vatCents: number }[];
  totalGrossCents: number;

  // TMC-gegevens (1.3); KvK/BTW via getSiteSettings() zodat de echte
  // nummers zonder codewijziging doorwerken zodra ze in Sanity staan.
  tmcName: string;
  tmcTagline: string;
  tmcAddress: string;
  tmcKvk: string;
  tmcBtw: string;
  tmcEmail: string;
  /** Overmaakgegevens; alleen gebruikt bij een factuur. */
  payment: { iban: string; accountHolder: string };
}

function pct(rateBp: number): string {
  return `${(rateBp / 100).toFixed(rateBp % 100 === 0 ? 0 : 2).replace(".", ",")}%`;
}

export function CustomerInvoicePdf(data: CustomerInvoiceData) {
  const title = data.isCreditNote ? "Creditnota" : "Factuur";
  const showPayment = !data.isCreditNote && data.dueDate !== null;
  const cityLine = [data.billToPostalCode, data.billToCity]
    .filter(Boolean)
    .join("  ");
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{data.tmcName}</Text>
            <Text style={styles.tagline}>{data.tmcTagline}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.docTitle}>{title}</Text>
            {data.isCreditNote && data.creditOfInvoiceNumber && (
              // COPY: confirm met Marlon
              <Text style={styles.creditRef}>
                Creditnota bij factuur {data.creditOfInvoiceNumber}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.gridTwo}>
          <View style={styles.block}>
            <Text style={styles.label}>Aan</Text>
            {data.billToCompany ? (
              <>
                <Text style={styles.valueStrong}>{data.billToCompany}</Text>
                {/* COPY: confirm met Marlon */}
                <Text style={styles.value}>t.a.v. {data.billToName}</Text>
              </>
            ) : (
              <Text style={styles.valueStrong}>{data.billToName}</Text>
            )}
            {data.billToStreet && (
              <Text style={styles.small}>{data.billToStreet}</Text>
            )}
            {cityLine !== "" && <Text style={styles.small}>{cityLine}</Text>}
            {data.billToCountry && (
              <Text style={styles.small}>{data.billToCountry}</Text>
            )}
            {data.billToVatNumber && (
              // COPY: confirm met Marlon
              <Text style={[styles.small, { marginTop: 4 }]}>
                BTW-nr: {data.billToVatNumber}
              </Text>
            )}
          </View>
          <View style={styles.metaBlock}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Factuurnummer</Text>
              <Text style={styles.metaValue}>{data.invoiceNumber}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Factuurdatum</Text>
              <Text style={styles.metaValue}>{formatNlDate(data.issuedAt)}</Text>
            </View>
            {!data.isCreditNote && data.dueDate && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Vervaldatum</Text>
                <Text style={styles.metaValue}>{formatNlDate(data.dueDate)}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.colDesc, { color: COLORS.muted }]}>
            Omschrijving
          </Text>
          <Text style={[styles.colQty, { color: COLORS.muted }]}>Aantal</Text>
          <Text style={[styles.colNet, { color: COLORS.muted }]}>
            Excl. BTW
          </Text>
          <Text style={[styles.colRate, { color: COLORS.muted }]}>BTW</Text>
          <Text style={[styles.colGross, { color: COLORS.muted }]}>
            Incl. BTW
          </Text>
        </View>
        {data.lines.map((l, i) => (
          <View key={i} style={styles.tableRow} wrap={false}>
            <Text style={styles.colDesc}>{l.description}</Text>
            <Text style={styles.colQty}>
              {l.quantity.toFixed(l.quantity % 1 === 0 ? 0 : 2).replace(".", ",")}
            </Text>
            <Text style={styles.colNet}>{formatEuroCentsSigned(l.netCents)}</Text>
            <Text style={styles.colRate}>{pct(l.vatRateBp)}</Text>
            <Text style={styles.colGross}>
              {formatEuroCentsSigned(l.grossCents)}
            </Text>
          </View>
        ))}

        <View style={styles.totalsWrap} wrap={false}>
          <View style={styles.totalsTable}>
            <View style={styles.totalsLine}>
              <Text style={styles.small}>Subtotaal excl. BTW</Text>
              <Text style={{ fontSize: 9 }}>
                {formatEuroCentsSigned(data.subtotalNetCents)}
              </Text>
            </View>
            {data.vatByRate.map((v) => (
              <View key={v.rateBp} style={styles.totalsLine}>
                <Text style={styles.small}>BTW {pct(v.rateBp)}</Text>
                <Text style={{ fontSize: 9 }}>
                  {formatEuroCentsSigned(v.vatCents)}
                </Text>
              </View>
            ))}
            <View style={styles.totalsRule}>
              {/* COPY: confirm met Marlon */}
              <Text style={styles.totalLabel}>
                {data.isCreditNote ? "Te crediteren" : "Te betalen"}
              </Text>
              <Text style={styles.totalValue}>
                {formatEuroCentsSigned(data.totalGrossCents)}
              </Text>
            </View>
          </View>
        </View>

        {showPayment && data.dueDate && (
          <View style={styles.payWrap} wrap={false}>
            <Text style={styles.label}>Betalen</Text>
            <View style={styles.payRow}>
              <View style={styles.payBox}>
                {/* COPY: confirm met Marlon */}
                <Text style={styles.payBoxTitle}>Zelf overmaken</Text>
                <View style={styles.payLine}>
                  <Text style={styles.payKey}>IBAN</Text>
                  <Text style={styles.payVal}>{data.payment.iban}</Text>
                </View>
                <View style={styles.payLine}>
                  <Text style={styles.payKey}>T.n.v.</Text>
                  <Text style={styles.payVal}>{data.payment.accountHolder}</Text>
                </View>
                <View style={styles.payLine}>
                  <Text style={styles.payKey}>Kenmerk</Text>
                  <Text style={styles.payVal}>{data.invoiceNumber}</Text>
                </View>
                <View style={styles.payLine}>
                  <Text style={styles.payKey}>Uiterlijk</Text>
                  <Text style={styles.payVal}>{formatNlDate(data.dueDate)}</Text>
                </View>
              </View>
              <View style={styles.payReserved} />
            </View>
          </View>
        )}

        {/* COPY: confirm met Marlon */}
        <Text style={styles.contact}>
          Vragen over deze {data.isCreditNote ? "creditnota" : "factuur"}? Mail
          ons via {data.tmcEmail}.
        </Text>

        <View style={styles.footer} fixed>
          <Text>
            {data.tmcName} · {data.tmcAddress} · {data.tmcEmail}
          </Text>
          <Text style={{ marginTop: 2 }}>
            KvK {data.tmcKvk} · BTW {data.tmcBtw}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
