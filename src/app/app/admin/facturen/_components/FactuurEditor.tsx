"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveInvoiceLines,
  saveInvoiceBillTo,
  deleteInvoiceDraft,
  finalizeInvoice,
  generateInvoicePdf,
  sendInvoiceEmail,
  createCreditNote,
  markInvoicePaid,
} from "@/lib/admin/invoice-actions";
import { getInvoiceDownloadUrl } from "@/lib/member/invoice-actions";
import { formatEuroCentsSigned } from "@/lib/format";
import type { BillToInput } from "@/lib/admin/invoice-bill-to";
import { EuroInput } from "@/components/ui/EuroInput";
import {
  grantTermsLabel,
  type GrantableProduct,
  type InvoiceGrantCounter,
} from "@/lib/product-grants/core";
import type { ProductGrantRow } from "@/lib/product-grants/server";
import { GrantProductDialog } from "../../_components/product-grants/GrantProductDialog";
import { ProductGrantsList } from "../../_components/product-grants/ProductGrantsList";

/**
 * Concept-editor plus de drie stappen (9.3/9.4/9.5). Bruto wordt ingevoerd
 * (dat is wat iemand voor zich heeft); netto en BTW rekenen live mee
 * volgens 3.1. Het tarief is een keuzelijst per regel (9, 21, 0 procent),
 * default uit de catalogusrij, met een zichtbare markering zodra het
 * afwijkt. Wijzigingen slaan nooit terug op de catalogus.
 *
 * Finaliseren is het enige onherroepelijke punt in het systeem en krijgt
 * daarom een expliciete bevestigingsstap die bedrag en afnemer noemt: een
 * misklik kost een nummer dat alleen met een creditnota te herstellen is.
 */

const VAT_OPTIONS = [
  { bp: 900, label: "9%" },
  { bp: 2100, label: "21%" },
  { bp: 0, label: "0%" },
];

function splitGross(grossCents: number, vatRateBp: number) {
  const sign = grossCents < 0 ? -1 : 1;
  const abs = Math.abs(grossCents);
  const vat = Math.round((abs * vatRateBp) / (10000 + vatRateBp));
  return { netCents: sign * (abs - vat), vatCents: sign * vat };
}

export interface EditorLine {
  lineNo: number;
  catalogueSlug: string | null;
  description: string;
  quantity: number;
  grossCents: number;
  vatRateBp: number;
  revenueCategory: string | null;
}

export interface CatalogueOption {
  slug: string;
  displayName: string;
  grossCents: number;
  vatRateBp: number;
}

interface FactuurEditorProps {
  invoice: {
    id: string;
    number: string | null;
    status: string;
    isTest: boolean;
    issuedAt: string | null;
    isCreditNote: boolean;
    creditOfNumber: string | null;
    pdfPath: string | null;
    totalGrossCents: number | null;
    billToName: string;
    billToEmail: string;
    /** Open, Vervallen, Betaald of Gecrediteerd; null bij concept en creditnota. */
    payStatusLabel: string | null;
    /** Betaaldatum (yyyy-mm-dd) als de factuur betaald is. */
    paidOn: string | null;
    canMarkPaid: boolean;
    todayIso: string;
    minPaidOn: string | null;
    profileId: string;
  };
  /**
   * Product klaarzetten (9.8). Null bij een concept of creditnota. `canGrant`
   * is waar op een betaalde factuur zonder creditnota.
   */
  grants: {
    canGrant: boolean;
    /** De afnemer heeft een lopend abonnement (waarschuwing in de dialoog). */
    hasSubscription: boolean;
    counters: InvoiceGrantCounter[];
    rows: ProductGrantRow[];
    products: GrantableProduct[];
  } | null;
  /** Afnemer per veld als concept ?? profiel (concept wint). Bij een
   * gefinaliseerde factuur zijn dit de bevroren waarden. */
  initialBillTo: BillToInput;
  initialLines: EditorLine[];
  catalogueOptions: CatalogueOption[];
}

/** Alleen nog voor het aantal-veld; bedragen lopen via EuroInput en
 * `parseEuroInput`. Komma en punt allebei toegestaan als decimaalscheiding
 * (NL toetsenbord typt komma). Staan beide in de invoer, dan is de LAATSTE de
 * decimaalscheiding en is de andere een duizendtal-scheiding (dekt zowel
 * "1.234,56" als "1,234.56"). Nooit een spinner-input: die is onwerkbaar
 * voor bedragen en levert bovendien geen komma-invoer. Ongeldige invoer
 * valt terug op 0, net als de bestaande `Number(...) || 0`-aanpak elders
 * in dit scherm. */
function parseDecimalInput(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    normalized = trimmed.replace(/,/g, "");
  } else {
    normalized = trimmed;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Editor-interne regel: `uid` als stabiele React-key (regels worden
 * verwijderd en hernummerd), `amountInvalid` zolang het bedragveld geen
 * geldig bedrag bevat. Beide worden vóór het opslaan van de regel gehaald,
 * zodat het contract met `saveInvoiceLines` ongewijzigd blijft. */
type EditorRow = EditorLine & { uid: number; amountInvalid: boolean };

const BILL_TO_FIELDS: Array<{
  key: keyof BillToInput;
  label: string;
  required: boolean;
  wide?: boolean;
  type?: string;
}> = [
  // COPY: confirm met Marlon
  { key: "name", label: "Naam", required: true, wide: true },
  { key: "company", label: "Bedrijfsnaam (optioneel)", required: false, wide: true },
  { key: "vatNumber", label: "BTW-nummer (optioneel)", required: false },
  { key: "email", label: "E-mailadres", required: true, type: "email" },
  { key: "street", label: "Straat en huisnummer", required: true, wide: true },
  { key: "postalCode", label: "Postcode", required: true },
  { key: "city", label: "Plaats", required: true },
  { key: "country", label: "Land (optioneel)", required: false },
];

function serializeBillTo(b: BillToInput): string {
  return JSON.stringify(BILL_TO_FIELDS.map((f) => b[f.key].trim()));
}

function serializeLines(rows: EditorLine[]): string {
  return JSON.stringify(
    rows.map((l) => [
      l.lineNo,
      l.catalogueSlug,
      l.description,
      l.quantity,
      l.grossCents,
      l.vatRateBp,
      l.revenueCategory,
    ]),
  );
}

export function FactuurEditor({
  invoice,
  initialBillTo,
  initialLines,
  catalogueOptions,
  grants,
}: FactuurEditorProps) {
  const router = useRouter();
  const isDraft = invoice.status === "draft";
  const nextUid = useRef(initialLines.length);
  const [lines, setLines] = useState<EditorRow[]>(() =>
    initialLines.map((l, i) => ({ ...l, uid: i, amountInvalid: false })),
  );
  const [billTo, setBillTo] = useState<BillToInput>(initialBillTo);
  const [savedBillToKey, setSavedBillToKey] = useState(() =>
    serializeBillTo(initialBillTo),
  );
  const [savedLinesKey, setSavedLinesKey] = useState(() =>
    serializeLines(initialLines),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPaid, setConfirmPaid] = useState(false);
  const [paidOn, setPaidOn] = useState(invoice.todayIso);
  // Product klaarzetten: de slug waarvoor de dialoog open staat ("" is
  // een vrije keuze, voor een factuur zonder productregel).
  const [grantFor, setGrantFor] = useState<
    { slug: string | undefined; full: boolean } | null
  >(null);
  const [isPending, startTransition] = useTransition();

  const totals = useMemo(() => {
    let net = 0;
    let gross = 0;
    const vatByRate = new Map<number, number>();
    for (const l of lines) {
      const { netCents, vatCents } = splitGross(l.grossCents, l.vatRateBp);
      net += netCents;
      gross += l.grossCents;
      vatByRate.set(l.vatRateBp, (vatByRate.get(l.vatRateBp) ?? 0) + vatCents);
    }
    return { net, gross, vatByRate };
  }, [lines]);

  const defaultRateBySlug = useMemo(
    () => new Map(catalogueOptions.map((c) => [c.slug, c.vatRateBp])),
    [catalogueOptions],
  );

  const hasInvalidAmount = lines.some((l) => l.amountInvalid);
  // Onopgeslagen wijzigingen blokkeren finaliseren: de RPC leest de
  // opgeslagen rij, dus wat op het scherm staat zou anders niet op de
  // onomkeerbare factuur terechtkomen.
  const billToDirty = serializeBillTo(billTo) !== savedBillToKey;
  const linesDirty = serializeLines(lines) !== savedLinesKey || hasInvalidAmount;
  const hasUnsaved = billToDirty || linesDirty;

  function updateLine(i: number, patch: Partial<EditorRow>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function addCatalogueLine(slug: string) {
    const opt = catalogueOptions.find((c) => c.slug === slug);
    if (!opt) return;
    setLines((prev) => [
      ...prev,
      {
        lineNo: prev.length + 1,
        catalogueSlug: opt.slug,
        description: opt.displayName,
        quantity: 1,
        grossCents: opt.grossCents,
        vatRateBp: opt.vatRateBp,
        revenueCategory: null,
        uid: nextUid.current++,
        amountInvalid: false,
      },
    ]);
  }

  function addFreeLine() {
    setLines((prev) => [
      ...prev,
      {
        lineNo: prev.length + 1,
        catalogueSlug: null,
        description: "",
        quantity: 1,
        grossCents: 0,
        // Vrije regel: default 9 procent, het tarief van vrijwel alles wat
        // TMC verkoopt (9.3); net zo goed te wijzigen.
        vatRateBp: 900,
        revenueCategory: null,
        uid: nextUid.current++,
        amountInvalid: false,
      },
    ]);
  }

  function removeLine(i: number) {
    setLines((prev) =>
      prev.filter((_, j) => j !== i).map((l, j) => ({ ...l, lineNo: j + 1 })),
    );
  }

  function save() {
    setMessage(null);
    // Nooit stil 0 opslaan: een ongeldig bedrag blokkeert het opslaan.
    if (hasInvalidAmount) return;
    startTransition(async () => {
      const r = await saveInvoiceLines(
        invoice.id,
        lines.map((l) => ({
          lineNo: l.lineNo,
          catalogueSlug: l.catalogueSlug,
          description: l.description,
          quantity: l.quantity,
          grossCents: l.grossCents,
          vatRateBp: l.vatRateBp,
          revenueCategory: l.revenueCategory,
        })),
      );
      // COPY: confirm met Marlon
      setMessage(r.ok ? "Regels opgeslagen." : r.error);
      if (r.ok) {
        setSavedLinesKey(serializeLines(lines));
        router.refresh();
      }
    });
  }

  function saveBillTo() {
    setMessage(null);
    startTransition(async () => {
      const r = await saveInvoiceBillTo(invoice.id, billTo);
      // COPY: confirm met Marlon
      setMessage(r.ok ? "Afnemer opgeslagen." : r.error);
      if (r.ok) {
        setSavedBillToKey(serializeBillTo(billTo));
        router.refresh();
      }
    });
  }

  function runDelete() {
    setConfirmDelete(false);
    setMessage(null);
    startTransition(async () => {
      const r = await deleteInvoiceDraft(invoice.id);
      if (!r.ok) {
        setMessage(r.error);
        return;
      }
      router.push("/app/admin/facturen");
    });
  }

  function runFinalize() {
    setConfirmFinalize(false);
    setMessage(null);
    startTransition(async () => {
      const r = await finalizeInvoice(invoice.id);
      // COPY: confirm met Marlon
      setMessage(
        r.ok ? `Gefinaliseerd als ${r.invoiceNumber}.` : r.error,
      );
      if (r.ok) router.refresh();
    });
  }

  function runMarkPaid() {
    setMessage(null);
    startTransition(async () => {
      const r = await markInvoicePaid(invoice.id, paidOn);
      // COPY: confirm met Marlon
      setMessage(r.ok ? "Factuur gemarkeerd als betaald." : r.error);
      if (r.ok) {
        setConfirmPaid(false);
        router.refresh();
      }
    });
  }

  function runPdf() {
    setMessage(null);
    startTransition(async () => {
      const r = await generateInvoicePdf(invoice.id);
      // COPY: confirm met Marlon
      setMessage(r.ok ? "PDF gegenereerd en opgeslagen." : r.error);
      if (r.ok) router.refresh();
    });
  }

  function runSend() {
    setMessage(null);
    startTransition(async () => {
      const r = await sendInvoiceEmail(invoice.id);
      // COPY: confirm met Marlon
      setMessage(r.ok ? "Mail verstuurd." : r.error);
    });
  }

  function runCredit() {
    setMessage(null);
    startTransition(async () => {
      const r = await createCreditNote(invoice.id);
      if (!r.ok) {
        setMessage(r.error);
        return;
      }
      router.push(`/app/admin/facturen/${r.invoiceId}`);
    });
  }

  function download() {
    setMessage(null);
    startTransition(async () => {
      const r = await getInvoiceDownloadUrl(invoice.id);
      if (!r.ok) {
        setMessage(r.error);
        return;
      }
      window.open(r.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <span className="tmc-eyebrow tmc-eyebrow--accent block mb-3">
          {invoice.isCreditNote ? "Creditnota" : "Factuur"}
          {invoice.isTest && " · TEST"}
        </span>
        <h1 className="font-[family-name:var(--font-playfair)] text-4xl text-text tracking-[-0.02em]">
          {invoice.number ?? "Concept"}
        </h1>
        <p className="text-text-muted text-sm mt-2">
          {billTo.name || invoice.billToName} ·{" "}
          {billTo.email || invoice.billToEmail}
          {invoice.creditOfNumber && (
            <> · creditnota bij {invoice.creditOfNumber}</>
          )}
          {invoice.issuedAt && <> · {invoice.issuedAt}</>}
          {invoice.payStatusLabel && <> · {invoice.payStatusLabel}</>}
        </p>
      </header>

      {/* Afnemer */}
      <section className="flex flex-col gap-3">
        {/* COPY: confirm met Marlon */}
        <h2 className="tmc-eyebrow">Afnemer</h2>
        {isDraft ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-bg-elevated p-3">
              {BILL_TO_FIELDS.map((f) => (
                <label
                  key={f.key}
                  className={`flex flex-col gap-1 ${f.wide ? "sm:col-span-2" : ""}`}
                >
                  <span className="text-text-muted text-[10px] uppercase tracking-[0.14em]">
                    {f.label}
                  </span>
                  <input
                    type={f.type ?? "text"}
                    value={billTo[f.key]}
                    onChange={(e) =>
                      setBillTo((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                    className="bg-transparent border-b border-[color:var(--ink-500)]/60 text-sm text-text py-1"
                  />
                </label>
              ))}
            </div>
            <div className="flex items-center gap-4">
              {/* COPY: confirm met Marlon */}
              <p className="text-text-muted text-xs max-w-prose">
                Vooringevuld uit het profiel. Wijzigingen gelden alleen voor
                deze factuur en schrijven niets terug naar het profiel.
              </p>
              <button
                type="button"
                onClick={saveBillTo}
                disabled={isPending || !billToDirty}
                className="ml-auto px-4 py-1.5 border border-accent text-accent text-xs uppercase tracking-[0.16em] hover:bg-accent hover:text-bg transition-colors disabled:opacity-50"
              >
                {/* COPY: confirm met Marlon */}
                Afnemer opslaan
              </button>
            </div>
          </>
        ) : (
          <div className="bg-bg-elevated p-3">
            <BillToBlock value={billTo} />
          </div>
        )}
      </section>

      {/* Regels */}
      <section className="flex flex-col gap-3">
        <h2 className="tmc-eyebrow">Regels</h2>
        {lines.map((l, i) => {
          const { netCents, vatCents } = splitGross(l.grossCents, l.vatRateBp);
          const defaultRate = l.catalogueSlug
            ? defaultRateBySlug.get(l.catalogueSlug)
            : undefined;
          const deviates =
            defaultRate !== undefined && defaultRate !== l.vatRateBp;
          return (
            <div
              key={l.uid}
              className="grid grid-cols-[1fr_90px_110px_90px_auto] gap-3 items-start bg-bg-elevated p-3"
            >
              <div className="flex flex-col gap-1">
                <input
                  disabled={!isDraft}
                  value={l.description}
                  onChange={(e) => updateLine(i, { description: e.target.value })}
                  // COPY: confirm met Marlon
                  placeholder="Omschrijving"
                  className="bg-transparent border-b border-[color:var(--ink-500)]/60 text-sm text-text py-1"
                />
                <span className="text-text-muted text-[10px]">
                  {l.catalogueSlug ?? "vrije regel"} · netto{" "}
                  {formatEuroCentsSigned(netCents)} · BTW{" "}
                  {formatEuroCentsSigned(vatCents)}
                </span>
              </div>
              <input
                disabled={!isDraft}
                type="text"
                inputMode="decimal"
                value={l.quantity}
                onChange={(e) =>
                  updateLine(i, { quantity: parseDecimalInput(e.target.value) })
                }
                className="bg-transparent border-b border-[color:var(--ink-500)]/60 text-sm text-text py-1 text-right"
                aria-label="Aantal"
              />
              <EuroInput
                disabled={!isDraft}
                value={l.grossCents}
                onChange={(cents) =>
                  updateLine(
                    i,
                    cents === null
                      ? { amountInvalid: true }
                      : { grossCents: cents, amountInvalid: false },
                  )
                }
                className="bg-transparent border-b border-[color:var(--ink-500)]/60 text-sm text-text py-1 text-right"
                aria-label="Bedrag incl. BTW"
              />
              <div className="flex flex-col gap-0.5">
                <select
                  disabled={!isDraft}
                  value={l.vatRateBp}
                  onChange={(e) =>
                    updateLine(i, { vatRateBp: Number(e.target.value) })
                  }
                  className="bg-bg border border-[color:var(--ink-500)]/60 text-sm text-text py-1 px-2"
                  aria-label="BTW-tarief"
                >
                  {VAT_OPTIONS.map((o) => (
                    <option key={o.bp} value={o.bp}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {deviates && (
                  // COPY: confirm met Marlon
                  <span className="text-[color:var(--danger)] text-[10px]">
                    Afwijkend van catalogus (
                    {VAT_OPTIONS.find((o) => o.bp === defaultRate)?.label ??
                      `${(defaultRate ?? 0) / 100}%`}
                    )
                  </span>
                )}
              </div>
              {isDraft && (
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  className="text-text-muted text-xs hover:text-[color:var(--danger)] pt-1"
                >
                  Verwijder
                </button>
              )}
            </div>
          );
        })}

        {isDraft && (
          <div className="flex items-center gap-4">
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) addCatalogueLine(e.target.value);
                e.target.value = "";
              }}
              className="bg-bg border border-[color:var(--ink-500)]/60 text-sm text-text py-1.5 px-2"
            >
              {/* COPY: confirm met Marlon */}
              <option value="">+ Regel uit catalogus…</option>
              {catalogueOptions.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.displayName}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addFreeLine}
              className="text-accent text-sm hover:text-text"
            >
              {/* COPY: confirm met Marlon */}
              + Vrije regel
            </button>
            {hasInvalidAmount && (
              // COPY: confirm met Marlon
              <span className="text-[color:var(--danger)] text-xs">
                Corrigeer eerst de ongeldige bedragen.
              </span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={isPending || hasInvalidAmount}
              className="ml-auto px-4 py-1.5 border border-accent text-accent text-xs uppercase tracking-[0.16em] hover:bg-accent hover:text-bg transition-colors disabled:opacity-50"
            >
              Regels opslaan
            </button>
          </div>
        )}
      </section>

      {/* Totalen */}
      <section className="flex flex-col items-end gap-1 text-sm">
        <span className="text-text-muted">
          Subtotaal excl. BTW: {formatEuroCentsSigned(totals.net)}
        </span>
        {Array.from(totals.vatByRate)
          .sort(([a], [b]) => a - b)
          .map(([bp, cents]) => (
            <span key={bp} className="text-text-muted">
              BTW {bp / 100}%: {formatEuroCentsSigned(cents)}
            </span>
          ))}
        <span className="text-text text-lg">
          Totaal: {formatEuroCentsSigned(totals.gross)}
        </span>
      </section>

      {/* De drie stappen (9.4) + crediteren (9.5) */}
      <section className="flex flex-wrap items-center gap-3 border-t border-[color:var(--ink-500)]/60 pt-6">
        {isDraft && !confirmFinalize && (
          <button
            type="button"
            onClick={() => setConfirmFinalize(true)}
            disabled={isPending || lines.length === 0 || hasUnsaved}
            className="px-4 py-2 bg-accent text-bg text-xs uppercase tracking-[0.16em] disabled:opacity-50"
          >
            {/* COPY: confirm met Marlon */}
            1. Finaliseren…
          </button>
        )}
        {isDraft && !confirmFinalize && hasUnsaved && (
          // COPY: confirm met Marlon
          <span className="text-text-muted text-xs">
            Sla eerst{" "}
            {[billToDirty && "de afnemer", linesDirty && "de regels"]
              .filter(Boolean)
              .join(" en ")}{" "}
            op voordat je finaliseert.
          </span>
        )}
        {isDraft && confirmFinalize && (
          <div className="flex flex-col gap-2 bg-bg-elevated p-4 border border-accent/40">
            {/* COPY: confirm met Marlon */}
            <p className="text-text text-sm max-w-md">
              Definitief maken voor{" "}
              <strong>{formatEuroCentsSigned(totals.gross)}</strong> aan{" "}
              <strong>{billTo.name || invoice.billToName}</strong>? Dit trekt
              een factuurnummer en is onomkeerbaar; herstellen kan daarna
              alleen met een creditnota.
            </p>
            <div className="bg-bg p-3">
              <BillToBlock value={billTo} />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={runFinalize}
                disabled={isPending}
                className="px-4 py-1.5 bg-accent text-bg text-xs uppercase tracking-[0.16em] disabled:opacity-50"
              >
                {/* COPY: confirm met Marlon */}
                Ja, finaliseer
              </button>
              <button
                type="button"
                onClick={() => setConfirmFinalize(false)}
                className="text-text-muted text-xs uppercase tracking-[0.16em]"
              >
                Annuleren
              </button>
            </div>
          </div>
        )}
        {isDraft && !confirmDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={isPending}
            className="ml-auto px-4 py-2 border border-[color:var(--danger)]/60 text-[color:var(--danger)] text-xs uppercase tracking-[0.16em] disabled:opacity-50"
          >
            {/* COPY: confirm met Marlon */}
            Concept verwijderen
          </button>
        )}
        {isDraft && confirmDelete && (
          <div className="ml-auto flex items-center gap-3">
            {/* COPY: confirm met Marlon */}
            <span className="text-text-muted text-xs">Zeker weten?</span>
            <button
              type="button"
              onClick={runDelete}
              disabled={isPending}
              className="px-4 py-1.5 border border-[color:var(--danger)] text-[color:var(--danger)] text-xs uppercase tracking-[0.16em] disabled:opacity-50"
            >
              {/* COPY: confirm met Marlon */}
              Ja, verwijder
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-text-muted text-xs uppercase tracking-[0.16em]"
            >
              Annuleren
            </button>
          </div>
        )}
        {!isDraft && !invoice.pdfPath && (
          <button
            type="button"
            onClick={runPdf}
            disabled={isPending}
            className="px-4 py-2 bg-accent text-bg text-xs uppercase tracking-[0.16em] disabled:opacity-50"
          >
            {/* COPY: confirm met Marlon */}
            2. PDF genereren
          </button>
        )}
        {!isDraft && invoice.pdfPath && (
          <>
            <button
              type="button"
              onClick={download}
              disabled={isPending}
              className="px-4 py-2 border border-accent text-accent text-xs uppercase tracking-[0.16em] disabled:opacity-50"
            >
              Download PDF
            </button>
            <button
              type="button"
              onClick={runSend}
              disabled={isPending}
              className="px-4 py-2 bg-accent text-bg text-xs uppercase tracking-[0.16em] disabled:opacity-50"
            >
              {/* COPY: confirm met Marlon */}
              3. Versturen
            </button>
          </>
        )}
        {!isDraft && !invoice.isCreditNote && (
          <button
            type="button"
            onClick={runCredit}
            disabled={isPending}
            className="ml-auto px-4 py-2 border border-[color:var(--danger)]/60 text-[color:var(--danger)] text-xs uppercase tracking-[0.16em] disabled:opacity-50"
          >
            {/* COPY: confirm met Marlon */}
            Creditnota maken
          </button>
        )}
      </section>

      {/* Betaling (9.7): alleen een gefinaliseerde factuur zonder betaling. */}
      {!isDraft && !invoice.isCreditNote && (
        <section className="flex flex-col gap-3 border-t border-[color:var(--ink-500)]/60 pt-6">
          {/* COPY: confirm met Marlon */}
          <h2 className="tmc-eyebrow">Betaling</h2>
          {invoice.paidOn && (
            // COPY: confirm met Marlon
            <p className="text-text text-sm">Betaald op {invoice.paidOn}.</p>
          )}
          {invoice.canMarkPaid && !confirmPaid && (
            <div>
              <button
                type="button"
                onClick={() => setConfirmPaid(true)}
                disabled={isPending}
                className="px-4 py-2 border border-accent text-accent text-xs uppercase tracking-[0.16em] disabled:opacity-50"
              >
                {/* COPY: confirm met Marlon */}
                Markeer als betaald (overboeking)
              </button>
            </div>
          )}
          {invoice.canMarkPaid && confirmPaid && (
            <div className="flex flex-col gap-3 bg-bg-elevated p-4 border border-accent/40 max-w-md">
              <label className="flex flex-col gap-1">
                {/* COPY: confirm met Marlon */}
                <span className="text-text-muted text-[10px] uppercase tracking-[0.14em]">
                  Betaaldatum
                </span>
                <input
                  type="date"
                  value={paidOn}
                  min={invoice.minPaidOn ?? undefined}
                  max={invoice.todayIso}
                  onChange={(e) => setPaidOn(e.target.value)}
                  className="bg-transparent border-b border-[color:var(--ink-500)]/60 text-sm text-text py-1"
                />
              </label>
              {/* COPY: confirm met Marlon */}
              <p className="text-text text-sm">
                Factuur <strong>{invoice.number}</strong> van{" "}
                <strong>{billTo.name || invoice.billToName}</strong> voor{" "}
                <strong>{formatEuroCentsSigned(totals.gross)}</strong> markeren
                als overgemaakt op <strong>{paidOn}</strong>? Dit is niet terug
                te draaien; corrigeren kan alleen met een creditnota.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={runMarkPaid}
                  disabled={isPending || !paidOn}
                  className="px-4 py-1.5 bg-accent text-bg text-xs uppercase tracking-[0.16em] disabled:opacity-50"
                >
                  {/* COPY: confirm met Marlon */}
                  Ja, markeer als betaald
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmPaid(false)}
                  className="text-text-muted text-xs uppercase tracking-[0.16em]"
                >
                  Annuleren
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Product klaarzetten (9.8): een betaalde factuur activeert niets;
          het product wordt hier handmatig toegekend. */}
      {grants && (grants.canGrant || grants.rows.length > 0) && (
        <section
          id="product-klaarzetten"
          className="flex flex-col gap-3 border-t border-[color:var(--ink-500)]/60 pt-6"
        >
          {/* COPY: confirm met Marlon */}
          <h2 className="tmc-eyebrow">Product klaarzetten</h2>
          {grants.canGrant && (
            <>
              {/* COPY: confirm met Marlon */}
              <p className="text-text-muted text-sm max-w-prose">
                Deze factuur is betaald. De betaling zet zelf niets klaar: ken
                het product hier toe, dan staat het tegoed direct bij het lid.
              </p>
              {grants.hasSubscription && (
                // COPY: confirm met Marlon
                <p
                  role="note"
                  className="text-sm p-4 border border-[color:var(--warning)]/40 text-[color:var(--warning)] max-w-prose"
                >
                  Dit lid heeft een lopend abonnement. Toekennen kan, maar
                  zolang het tegoed actief is zijn pauzeren, opzeggen en
                  abonnement wisselen op het ledendetail tijdelijk niet
                  bereikbaar.
                </p>
              )}
              {grants.counters.length > 0 ? (
                <ul className="flex flex-col divide-y divide-[color:var(--ink-500)]/60">
                  {grants.counters.map((c) => {
                    const full = c.granted >= c.allowed;
                    return (
                      <li
                        key={c.slug}
                        className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
                      >
                        <span className="text-sm text-text">{c.displayName}</span>
                        <span className="text-xs text-text-muted">
                          {grantTermsLabel(c)}
                        </span>
                        <span className="ml-auto text-xs text-text-muted tabular-nums">
                          {/* COPY: confirm met Marlon */}
                          {c.granted} van {c.allowed} toegekend
                        </span>
                        <button
                          type="button"
                          onClick={() => setGrantFor({ slug: c.slug, full })}
                          disabled={isPending}
                          className={
                            full
                              ? "px-4 py-2 border border-[color:var(--ink-500)] text-text-muted text-xs uppercase tracking-[0.16em] disabled:opacity-50 cursor-pointer"
                              : "px-4 py-2 border border-accent text-accent text-xs uppercase tracking-[0.16em] disabled:opacity-50 cursor-pointer"
                          }
                        >
                          {/* COPY: confirm met Marlon */}
                          {full ? "Nog een keer toekennen" : "Product klaarzetten"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div>
                  {/* COPY: confirm met Marlon */}
                  <p className="text-text-muted text-sm max-w-prose mb-3">
                    Op de regels van deze factuur staat geen product met
                    tegoed. Hoort er toch een bij, kies het dan zelf.
                  </p>
                  <button
                    type="button"
                    onClick={() => setGrantFor({ slug: undefined, full: false })}
                    disabled={isPending || grants.products.length === 0}
                    className="px-4 py-2 border border-accent text-accent text-xs uppercase tracking-[0.16em] disabled:opacity-50 cursor-pointer"
                  >
                    {/* COPY: confirm met Marlon */}
                    Product klaarzetten
                  </button>
                </div>
              )}
            </>
          )}
          {!grants.canGrant && (
            // COPY: confirm met Marlon
            <p className="text-text-muted text-sm max-w-prose">
              Aan deze factuur is geen nieuw product meer te koppelen (niet
              betaald of gecrediteerd).
            </p>
          )}
          <ProductGrantsList grants={grants.rows} showInvoice={false} />
          {grantFor && invoice.number && (
            <GrantProductDialog
              open
              onClose={() => setGrantFor(null)}
              profileId={invoice.profileId}
              products={grants.products}
              fixedInvoice={{ id: invoice.id, number: invoice.number }}
              presetSlug={grantFor.slug}
              duplicateExpected={grantFor.full}
              hasSubscription={grants.hasSubscription}
              // COPY: confirm met Marlon
              title="Product klaarzetten"
            />
          )}
        </section>
      )}

      {message && <p className="text-text-muted text-sm">{message}</p>}
      {!isDraft && (
        // COPY: confirm met Marlon
        <p className="text-text-muted text-xs max-w-prose">
          Stap 2 en 3 zijn opnieuw uit te voeren als ze falen; stap 1 niet.
          De PDF wordt maar één keer gemaakt en verandert daarna nooit meer.
        </p>
      )}
    </div>
  );
}

/** Afnemer als adresblok, zoals op de factuur: naam, bedrijf, adres, BTW. */
function BillToBlock({ value }: { value: BillToInput }) {
  const v = (x: string) => x.trim();
  const cityLine = [v(value.postalCode), v(value.city)].filter(Boolean).join(" ");
  const lines = [
    v(value.name),
    v(value.company),
    v(value.street),
    cityLine,
    v(value.country),
    v(value.vatNumber) && `BTW ${v(value.vatNumber)}`,
    v(value.email),
  ].filter(Boolean);
  return (
    <address className="not-italic text-text text-sm leading-relaxed">
      {lines.map((l, i) => (
        <span key={i} className="block">
          {l}
        </span>
      ))}
    </address>
  );
}
