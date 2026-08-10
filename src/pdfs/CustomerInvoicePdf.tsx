import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import * as React from "react";

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
 * worden als negatief getoond, niet gemaskeerd.
 */

const COLORS = {
  ink: "#0E0C0B",
  stone: "#F5F0E6",
  muted: "#766D60",
  champagne: "#B9986A",
  line: "#D5CEC0",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 64,
    paddingHorizontal: 56,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: COLORS.ink,
    backgroundColor: COLORS.stone,
  },
  header: {
    marginBottom: 28,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.champagne,
    borderBottomStyle: "solid",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  brand: { fontSize: 14, letterSpacing: 0.5, marginBottom: 2 },
  docTitle: {
    fontSize: 11,
    color: COLORS.champagne,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  creditRef: { fontSize: 8, color: COLORS.muted, marginTop: 2 },
  gridTwo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 26,
    gap: 24,
  },
  block: { flexDirection: "column", gap: 3, flex: 1 },
  label: {
    fontSize: 8,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  value: { fontSize: 10.5, color: COLORS.ink },
  small: { fontSize: 9, color: COLORS.muted },
  tableHeader: {
    flexDirection: "row",
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    borderBottomStyle: "solid",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    borderBottomStyle: "solid",
  },
  colDesc: { flex: 1, fontSize: 9 },
  colQty: { width: 40, textAlign: "right", fontSize: 9 },
  colNet: { width: 70, textAlign: "right", fontSize: 9 },
  colRate: { width: 45, textAlign: "right", fontSize: 9 },
  colGross: { width: 75, textAlign: "right", fontSize: 9 },
  totalsWrap: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 16,
  },
  totalsTable: { minWidth: 230 },
  totalsLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalsBox: {
    marginTop: 8,
    padding: 12,
    backgroundColor: COLORS.ink,
  },
  totalsBoxLabel: {
    fontSize: 8,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: COLORS.champagne,
    marginBottom: 4,
  },
  totalsBoxValue: { fontSize: 20, color: COLORS.stone },
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
  tmcAddress: string;
  tmcKvk: string;
  tmcBtw: string;
  tmcEmail: string;
}

function euro(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}EUR ${(Math.abs(cents) / 100).toFixed(2).replace(".", ",")}`;
}

function pct(rateBp: number): string {
  return `${(rateBp / 100).toFixed(rateBp % 100 === 0 ? 0 : 2).replace(".", ",")}%`;
}

function nlDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

export function CustomerInvoicePdf(data: CustomerInvoiceData) {
  const title = data.isCreditNote ? "Creditnota" : "Factuur";
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{data.tmcName}</Text>
            <Text style={styles.small}>{data.tmcAddress}</Text>
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
            {data.billToCompany && (
              <Text style={styles.value}>{data.billToCompany}</Text>
            )}
            <Text style={styles.value}>{data.billToName}</Text>
            {data.billToStreet && (
              <Text style={styles.small}>{data.billToStreet}</Text>
            )}
            {(data.billToPostalCode || data.billToCity) && (
              <Text style={styles.small}>
                {[data.billToPostalCode, data.billToCity]
                  .filter(Boolean)
                  .join("  ")}
              </Text>
            )}
            {data.billToCountry && (
              <Text style={styles.small}>{data.billToCountry}</Text>
            )}
            {data.billToVatNumber && (
              <Text style={[styles.small, { marginTop: 4 }]}>
                BTW-nr afnemer: {data.billToVatNumber}
              </Text>
            )}
          </View>
          <View style={styles.block}>
            <Text style={styles.label}>Factuurnummer</Text>
            <Text style={styles.value}>{data.invoiceNumber}</Text>
            <Text style={[styles.label, { marginTop: 8 }]}>Factuurdatum</Text>
            <Text style={styles.value}>{nlDate(data.issuedAt)}</Text>
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
          <View key={i} style={styles.tableRow}>
            <Text style={styles.colDesc}>{l.description}</Text>
            <Text style={styles.colQty}>
              {l.quantity.toFixed(l.quantity % 1 === 0 ? 0 : 2).replace(".", ",")}
            </Text>
            <Text style={styles.colNet}>{euro(l.netCents)}</Text>
            <Text style={styles.colRate}>{pct(l.vatRateBp)}</Text>
            <Text style={styles.colGross}>{euro(l.grossCents)}</Text>
          </View>
        ))}

        <View style={styles.totalsWrap}>
          <View style={styles.totalsTable}>
            <View style={styles.totalsLine}>
              <Text style={styles.small}>Subtotaal excl. BTW</Text>
              <Text style={{ fontSize: 9 }}>{euro(data.subtotalNetCents)}</Text>
            </View>
            {data.vatByRate.map((v) => (
              <View key={v.rateBp} style={styles.totalsLine}>
                <Text style={styles.small}>BTW {pct(v.rateBp)}</Text>
                <Text style={{ fontSize: 9 }}>{euro(v.vatCents)}</Text>
              </View>
            ))}
            <View style={styles.totalsBox}>
              <Text style={styles.totalsBoxLabel}>
                {data.isCreditNote ? "Te crediteren" : "Totaal incl. BTW"}
              </Text>
              <Text style={styles.totalsBoxValue}>
                {euro(data.totalGrossCents)}
              </Text>
            </View>
          </View>
        </View>

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
