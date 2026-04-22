import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import * as React from "react";

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
    paddingBottom: 48,
    paddingHorizontal: 56,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: COLORS.ink,
    backgroundColor: COLORS.stone,
  },
  header: {
    marginBottom: 32,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.champagne,
    borderBottomStyle: "solid",
  },
  brand: {
    fontSize: 14,
    fontFamily: "Helvetica",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  tagline: {
    fontSize: 8,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  gridTwo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 32,
    gap: 24,
  },
  block: {
    flexDirection: "column",
    gap: 4,
    flex: 1,
  },
  label: {
    fontSize: 8,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  value: {
    fontSize: 11,
    color: COLORS.ink,
  },
  sectionTitle: {
    fontSize: 8,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 10,
  },
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
  colDate: { width: 90, fontSize: 9 },
  colNotes: { flex: 1, fontSize: 9, color: COLORS.muted },
  colHours: { width: 60, textAlign: "right", fontSize: 9 },
  colAmount: { width: 80, textAlign: "right", fontSize: 9 },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 18,
  },
  totalsBox: {
    minWidth: 180,
    padding: 12,
    backgroundColor: COLORS.ink,
    color: COLORS.stone,
  },
  totalsLabel: {
    fontSize: 8,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: COLORS.champagne,
    marginBottom: 4,
  },
  totalsValue: {
    fontSize: 20,
    color: COLORS.stone,
  },
  footer: {
    position: "absolute",
    bottom: 36,
    left: 56,
    right: 56,
    fontSize: 8,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    borderTopStyle: "solid",
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export interface TrainerInvoiceLine {
  workDate: string; // yyyy-mm-dd
  hours: number;
  amountCents: number;
  notes: string | null;
}

export interface TrainerInvoiceData {
  invoiceRef: string;
  generatedAt: string; // ISO
  periodLabel: string; // "April 2026"
  trainerName: string;
  trainerEmail: string;
  hourlyRateCents: number | null;
  lines: TrainerInvoiceLine[];
  totalHours: number;
  totalCents: number;
  tmcName: string;
  tmcAddress: string;
  tmcMeta: string; // e.g. "KvK 12345678"
}

function euro(cents: number): string {
  return `EUR ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

function nlDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

export function TrainerInvoicePdf(data: TrainerInvoiceData) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>The Movement Club</Text>
          <Text style={styles.tagline}>Uren-overzicht &middot; intern</Text>
        </View>

        <View style={styles.gridTwo}>
          <View style={styles.block}>
            <Text style={styles.label}>Trainer</Text>
            <Text style={styles.value}>{data.trainerName}</Text>
            <Text style={[styles.value, { color: COLORS.muted, fontSize: 9 }]}>
              {data.trainerEmail}
            </Text>
            {data.hourlyRateCents !== null && (
              <>
                <Text style={[styles.label, { marginTop: 10 }]}>
                  Uurtarief
                </Text>
                <Text style={styles.value}>{euro(data.hourlyRateCents)}</Text>
              </>
            )}
          </View>
          <View style={styles.block}>
            <Text style={styles.label}>Referentie</Text>
            <Text style={styles.value}>{data.invoiceRef}</Text>
            <Text style={[styles.label, { marginTop: 10 }]}>Periode</Text>
            <Text style={styles.value}>{data.periodLabel}</Text>
            <Text style={[styles.label, { marginTop: 10 }]}>Aangemaakt</Text>
            <Text style={styles.value}>{nlDate(data.generatedAt)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Goedgekeurde uren</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.colDate, { color: COLORS.muted }]}>Datum</Text>
          <Text style={[styles.colNotes, { color: COLORS.muted }]}>Notitie</Text>
          <Text style={[styles.colHours, { color: COLORS.muted }]}>Uren</Text>
          <Text style={[styles.colAmount, { color: COLORS.muted }]}>
            Bedrag
          </Text>
        </View>
        {data.lines.length === 0 ? (
          <Text
            style={{ marginTop: 12, color: COLORS.muted, fontSize: 9 }}
          >
            Geen goedgekeurde uren in deze periode.
          </Text>
        ) : (
          data.lines.map((l, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.colDate}>{nlDate(l.workDate)}</Text>
              <Text style={styles.colNotes}>{l.notes ?? ""}</Text>
              <Text style={styles.colHours}>
                {l.hours.toFixed(2).replace(".", ",")}
              </Text>
              <Text style={styles.colAmount}>{euro(l.amountCents)}</Text>
            </View>
          ))
        )}

        <View style={styles.totalsRow}>
          <View style={styles.totalsBox}>
            <Text style={styles.totalsLabel}>Totaal</Text>
            <Text style={styles.totalsValue}>{euro(data.totalCents)}</Text>
            <Text
              style={{
                fontSize: 8,
                color: COLORS.champagne,
                textTransform: "uppercase",
                letterSpacing: 1.2,
                marginTop: 6,
              }}
            >
              {data.totalHours.toFixed(2).replace(".", ",")} uur
            </Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>{data.tmcName}</Text>
          <Text>{data.tmcAddress}</Text>
          <Text>{data.tmcMeta}</Text>
        </View>
      </Page>
    </Document>
  );
}
